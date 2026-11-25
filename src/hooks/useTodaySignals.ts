import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, isToday, subDays } from 'date-fns';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationPrefs } from '@/hooks/useNotificationPrefs';
import { onHealthDataChange } from '@/lib/data-events';
import type { TodaySignals } from '@/lib/todayItems';
import { RECORDS } from '@/lib/todayItems';
import type { PeriodData } from '@/hooks/useStageProfile';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { dueReminders } from '@/lib/medicine';
import { parsePillStatus, pillPackDay } from '@/lib/pillLog';
import { PREG_VACCINES_KEY, gestationalWeek, vaccinesDueNow, type VaccineState } from '@/lib/pregnancyVaccines';
import { useAccountDataVersion } from '@/lib/account-data';

// Reads the few facts Home's "Today" list ranks (lib/todayItems.ts):
// visits (today / within a week), recent doctor notes, results marked
// critical, getting-started progress, the next predicted period, and the
// stage tasks: medicines due (medications + today's med_dose ticks),
// an unticked contraceptive pill, pregnancy vaccinations in their window
// and the 2-weekly EPDS mood check.
// Read-only; the same endpoints and tables the old Home cards used
// (AppointmentTodayBanner, UpcomingAppointments, DoctorNotesCard,
// useAttentionCount, GettingStarted).

const NOTE_WINDOW_MS = 14 * 86_400_000;

interface Appt { scheduled_at: string; status: string | null; duration: number | null }

// Same per-device "Hide" the old Getting started card offered.
function setupHidden(userId: string): boolean {
  try { return localStorage.getItem(`womanie_getting_started_hidden_${userId}`) === '1'; } catch { return false; }
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Last EPDS date from the mood-check history (newest first); null = never taken. */
export function lastMoodCheckFrom(history: unknown): Date | null {
  if (!Array.isArray(history)) return null;
  const dates = history
    .map(r => (r && typeof r === 'object' ? (r as { date?: unknown }).date : null))
    .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (!dates.length) return null;
  const [y, m, d] = dates[dates.length - 1].split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function periodDaysUntil(period: PeriodData | null, now = new Date()): number | null {
  if (!period || !period.cycleLength) return null;
  const start = new Date(period.lastPeriodStart.getFullYear(), period.lastPeriodStart.getMonth(), period.lastPeriodStart.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = start.getTime() + period.cycleLength * 86_400_000;
  return Math.round((next - today.getTime()) / 86_400_000);
}

interface Med { id: string; name: string; reminder_times: string[] | string | null }

export function useTodaySignals(
  period: PeriodData | null,
  profileName: string | null | undefined,
  stage: { mode?: LifeStage | null; pregnancyDueDate?: Date | null } = {},
): TodaySignals {
  const { user } = useAuth();
  const prefs = useNotificationPrefs();
  const [s, setS] = useState<Omit<TodaySignals, 'periodDaysUntil'>>({});
  const [tasks, setTasks] = useState<Pick<TodaySignals, 'medicinesDue' | 'pill'>>({});
  const { mode, pregnancyDueDate } = stage;
  const uid = user?.id;
  // Device copies of account data (synced in lib/account-data.ts).
  const vaxKey = uid ? PREG_VACCINES_KEY(uid) : null;
  const epdsKey = uid ? `womanie_epds_history_${uid}` : null;
  const accountVersion = useAccountDataVersion([vaxKey, epdsKey, uid ? `contraception:${uid}:method` : null]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [apptResp, notesResp, critRes, docsRes, signalsRes] = await Promise.all([
        fetch('/api/me/appointments').then(r => (r.ok ? r.json() : { appointments: [] })).catch(() => ({ appointments: [] })),
        fetch('/api/me/doctor-notes').then(r => (r.ok ? r.json() : { notes: [] })).catch(() => ({ notes: [] })),
        db.from('current_extracted_data').select('id').eq('user_id', user.id).eq('status', 'critical'),
        db.from('health_documents').select('id').eq('user_id', user.id).limit(1),
        db.from('daily_health_signals').select('id').eq('user_id', user.id).limit(1),
      ]);
      const now = Date.now();
      const appts = ((apptResp?.appointments ?? []) as Appt[]).filter(a => (a.status ?? '').toLowerCase() !== 'cancelled');
      const today = appts
        .filter(a => isToday(new Date(a.scheduled_at)) && Date.parse(a.scheduled_at) + (a.duration ?? 30) * 60_000 > now)
        .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0];
      const next = appts
        .filter(a => !isToday(new Date(a.scheduled_at)) && Date.parse(a.scheduled_at) > now)
        .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0];
      const notes = (Array.isArray(notesResp?.notes) ? notesResp.notes : []) as Array<{ created_at: string | null }>;
      const hasDoc = Array.isArray(docsRes.data) && docsRes.data.length > 0;
      const hasLog = Array.isArray(signalsRes.data) && signalsRes.data.length > 0;
      setS({
        appointmentToday: today ? new Date(today.scheduled_at) : null,
        nextVisit: next ? new Date(next.scheduled_at) : null,
        newDoctorNotes: notes.filter(n => n.created_at && Date.parse(n.created_at) >= now - NOTE_WINDOW_MS).length,
        flaggedResults: Array.isArray(critRes.data) ? critRes.data.length : 0,
        // The name part is added at render time from the CURRENT profile
        // name: an earlier load (before the profile arrived) finishing last
        // must not show "Add your name" to someone who has one.
        setup: setupHidden(user.id) ? null : { done: Number(hasDoc) + Number(hasLog), total: 3, nextTarget: !hasDoc ? RECORDS : 'sheet:log' },
      });
    } catch {
      // Today rows are a convenience; keep the last known state.
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  // Stage tasks: medicines due today and the contraceptive pill tick.
  // Two loaders: medicines don't depend on the stage or on the synced
  // device keys, so they load once per user (plus on data changes / every
  // 5 min) instead of again when the profile's stage and the account sync
  // arrive — that used to fire the same two queries three times on Home.
  const loadMeds = useCallback(async () => {
    if (!uid) return;
    try {
      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const [medsRes, dosesRes] = await Promise.all([
        db.from('medications').select('id, name, reminder_times').eq('user_id', uid).eq('active', true),
        db.from('life_events').select('data, occurred_at').eq('user_id', uid).eq('kind', 'med_dose')
          .gte('occurred_at', startToday.toISOString()),
      ]);
      const taken = new Map<string, number>();
      for (const row of (Array.isArray(dosesRes.data) ? dosesRes.data : []) as Array<{ data: unknown; occurred_at: string }>) {
        if (!isToday(new Date(row.occurred_at))) continue;
        let d = row.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
        const id = d && typeof d === 'object' ? (d as { medication_id?: unknown }).medication_id : null;
        if (typeof id === 'string') taken.set(id, (taken.get(id) ?? 0) + 1);
      }
      const medicinesDue: Array<{ name: string; time: string }> = [];
      for (const m of (Array.isArray(medsRes.data) ? medsRes.data : []) as Med[]) {
        let times = m.reminder_times;
        if (typeof times === 'string') { try { times = JSON.parse(times); } catch { times = null; } }
        const due = dueReminders(Array.isArray(times) ? times : [], taken.get(m.id) ?? 0, now);
        if (due.length) medicinesDue.push({ name: m.name, time: due[0] });
      }
      setTasks(t => ({ ...t, medicinesDue }));
    } catch {
      // Keep the last known state.
    }
  }, [uid]);

  const loadPill = useCallback(async () => {
    if (!uid) return;
    try {
      const now = new Date();
      let pill: TodaySignals['pill'] = null;
      const method = readJSON<string>(`contraception:${uid}:method`);
      if (mode === 'contraception' && (method == null || method === 'pill')) {
        const { data } = await db.from('daily_health_signals').select('signal_date, notes')
          .eq('user_id', uid).gte('signal_date', format(subDays(now, 7), 'yyyy-MM-dd'));
        const rows = (Array.isArray(data) ? data : []) as Array<{ signal_date: string; notes: string | null }>;
        const status = (day: Date) => parsePillStatus(rows.find(r => String(r.signal_date).slice(0, 10) === format(day, 'yyyy-MM-dd'))?.notes);
        const today = status(now);
        const yesterday = status(subDays(now, 1));
        // Only someone who ticks her pill (any tick in the last week) is
        // reminded about yesterday; "missed" logged counts as answered.
        const ticksRegularly = rows.some(r => parsePillStatus(r.notes) != null);
        pill = {
          reminderTime: readJSON<string>(`contraception:${uid}:reminderTime`) ?? '21:00',
          takenToday: today != null,
          takenYesterday: ticksRegularly ? yesterday != null : null,
          packDay: pillPackDay(readJSON<string>(`contraception:${uid}:packStartDate`), now),
        };
      }
      setTasks(t => ({ ...t, pill }));
    } catch {
      // Keep the last known state.
    }
  }, [uid, mode]);

  useEffect(() => { void loadMeds(); }, [loadMeds]);
  // The pill method lives in an account-synced device key: re-read on sync.
  useEffect(() => { void loadPill(); }, [loadPill, accountVersion]);
  useEffect(() => onHealthDataChange(() => { void loadMeds(); void loadPill(); }), [loadMeds, loadPill]);
  // Reminder times pass while Home stays open.
  useEffect(() => {
    const t = window.setInterval(() => { void loadMeds(); void loadPill(); }, 5 * 60_000);
    return () => window.clearInterval(t);
  }, [loadMeds, loadPill]);

  // Pregnancy vaccinations and the EPDS mood check live in account-synced
  // device keys; re-read whenever the sync refreshes them.
  const vaccinesDue = useMemo(() => {
    if (mode !== 'pregnancy' || !vaxKey) return [];
    const state = readJSON<VaccineState>(vaxKey) ?? {};
    return vaccinesDueNow(state, gestationalWeek(pregnancyDueDate ?? null)).map(v => v.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, vaxKey, pregnancyDueDate, accountVersion, s]);
  const lastMoodCheck = useMemo(() => {
    if ((mode !== 'pregnancy' && mode !== 'postpartum') || !epdsKey) return undefined;
    return lastMoodCheckFrom(readJSON<unknown>(epdsKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, epdsKey, accountVersion, s]);

  const hasName = !!profileName?.trim();
  return {
    ...s,
    ...tasks,
    vaccinesDue,
    lastMoodCheck,
    setup: s.setup ? { ...s.setup, done: s.setup.done + Number(hasName), nameMissing: !hasName } : s.setup,
    // The day-of and upcoming visit rows follow the appointment-reminder toggle, as the old cards did.
    appointmentToday: prefs.appointmentReminders ? s.appointmentToday : null,
    periodDaysUntil: periodDaysUntil(period),
  };
}
