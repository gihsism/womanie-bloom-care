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
import { supplyReminders, type SupplyMed } from '@/lib/medicineSupply';
import { parsePillStatus, pillPackDay } from '@/lib/pillLog';
import { PREG_VACCINES_KEY, gestationalWeek, vaccinesDueNow, type VaccineState } from '@/lib/pregnancyVaccines';
import { useAccountDataVersion } from '@/lib/account-data';
import { babyVaccineReminders, type BabyForVaccines } from '@/lib/babyVaccines';
import { postnatalCheckDue, pickBirthDate, POSTNATAL_MILESTONE_ID } from '@/lib/postnatalCheck';
import { currentFlagged, labFlag } from '@/lib/labFlags';
import { contraceptionRows, isMethodId, METHOD_DATES_KEY, parseMethodDates } from '@/lib/contraceptionSchedule';
import { hasAnyDate, ivfTodayDates, localDateTime, parseIvfPlan, recentWarningSign, IVF_PLAN_LOCAL_KEY, WARNING_SIGN_HOURS, type IvfPlan, type SymptomEntry } from '@/lib/ivfJourney';
import { assessCheckin, parseCheckins, RECOVERY_CHECKINS_KEY } from '@/lib/postpartumRecovery';
import { deviceTz } from '@/components/dashboard/ivf/ivfFormat';
import { isVisitAhead } from '@/lib/visitAhead';

type FlagRow = { id: string; title: string; status: string | null; data_type: string | null; date_recorded: string | null };

// Reads the few facts Home's "Today" list ranks (lib/todayItems.ts):
// visits (today / within a week), recent doctor notes, results outside
// the range (latest reading per test), getting-started progress, the next predicted period, and the
// stage tasks: medicines due (medications + today's med_dose ticks), a
// medicine whose course or pack ends within 3 days,
// an unticked contraceptive pill, pregnancy vaccinations in their window
// and the 2-weekly EPDS mood check; postpartum, a baby at a common
// vaccination age (babies + baby_vaccine events); other stages, the last
// mood ticked in the daily log (weekly mood prompt). Contraception, other
// methods: ring / patch change days, injection, IUD check and IUD /
// implant replacement from the dates she entered; no method yet -> the
// choose-a-method row. IVF: her clinic dates today / tomorrow; no date
// and no phase yet (no row: the hero asks). Urgent rows (first on the
// list): results the lab marked critical (latest reading per test); IVF,
// a warning sign logged in the two-week-wait log in the last 48 h;
// postpartum, red flags in a recovery check-in saved today or yesterday.
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

/** Last local day with a mood ticked in the daily log; null = none in the rows. */
export function lastMoodLogFrom(rows: unknown): Date | null {
  if (!Array.isArray(rows)) return null;
  let best: string | null = null;
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const { signal_date, mood } = r as { signal_date?: unknown; mood?: unknown };
    let m = mood;
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch { m = null; } }
    if (!Array.isArray(m) || m.length === 0) continue;
    const day = String(signal_date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (best === null || day > best) best = day;
  }
  if (!best) return null;
  const [y, mo, d] = best.split('-').map(Number);
  return new Date(y, mo - 1, d);
}

export function periodDaysUntil(period: PeriodData | null, now = new Date()): number | null {
  if (!period || !period.cycleLength) return null;
  const start = new Date(period.lastPeriodStart.getFullYear(), period.lastPeriodStart.getMonth(), period.lastPeriodStart.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = start.getTime() + period.cycleLength * 86_400_000;
  return Math.round((next - today.getTime()) / 86_400_000);
}

interface Med extends SupplyMed { id: string; name: string; reminder_times: string[] | string | null }

export function useTodaySignals(
  period: PeriodData | null,
  profileName: string | null | undefined,
  stage: { mode?: LifeStage | null; pregnancyDueDate?: Date | null; ivfPhase?: string | null } = {},
): TodaySignals {
  const { user } = useAuth();
  const prefs = useNotificationPrefs();
  const [s, setS] = useState<Omit<TodaySignals, 'periodDaysUntil'>>({});
  // Start times of her visits that are not cancelled (for the postnatal-check row).
  const [visitTimes, setVisitTimes] = useState<Date[] | null>(null);
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [tasks, setTasks] = useState<Pick<TodaySignals, 'medicinesDue' | 'medicinesRunningOut' | 'pill' | 'babyVaccines' | 'lastMoodLog' | 'contraceptionDue' | 'methodMissing'>>({});
  // IVF: her treatment dates (ivf_plans, device copy first); null = not loaded.
  const [ivfPlan, setIvfPlan] = useState<IvfPlan | null>(null);
  // IVF: two-week-wait log entries of the last 48 h (warning signs).
  const [ivfLog, setIvfLog] = useState<SymptomEntry[]>([]);
  const { mode, pregnancyDueDate, ivfPhase } = stage;
  const uid = user?.id;
  // Device copies of account data (synced in lib/account-data.ts).
  const vaxKey = uid ? PREG_VACCINES_KEY(uid) : null;
  const epdsKey = uid ? `womanie_epds_history_${uid}` : null;
  const recoveryKey = uid ? RECOVERY_CHECKINS_KEY(uid) : null;
  const accountVersion = useAccountDataVersion([vaxKey, epdsKey, uid ? `contraception:${uid}:method` : null, uid ? METHOD_DATES_KEY(uid) : null, uid ? `postpartum:${uid}:milestones` : null, recoveryKey]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [apptResp, notesResp, critRes, docsRes, signalsRes] = await Promise.all([
        fetch('/api/me/appointments').then(r => (r.ok ? r.json() : { appointments: [] })).catch(() => ({ appointments: [] })),
        fetch('/api/me/doctor-notes').then(r => (r.ok ? r.json() : { notes: [] })).catch(() => ({ notes: [] })),
        db.from('current_extracted_data').select('id, title, status, data_type, date_recorded').eq('user_id', user.id),
        db.from('health_documents').select('id').eq('user_id', user.id).limit(1),
        db.from('daily_health_signals').select('id').eq('user_id', user.id).limit(1),
      ]);
      const now = Date.now();
      const appts = ((apptResp?.appointments ?? []) as Appt[]).filter(a => (a.status ?? '').toLowerCase() !== 'cancelled');
      // Same "still ahead" rule as Visits (lib/visitAhead.ts): a visit in
      // progress still counts; a completed one does not.
      const today = appts
        .filter(a => isToday(new Date(a.scheduled_at)) && isVisitAhead(a, now))
        .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0];
      const next = appts
        .filter(a => !isToday(new Date(a.scheduled_at)) && Date.parse(a.scheduled_at) > now)
        .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at))[0];
      setVisitTimes(appts.map(a => new Date(a.scheduled_at)));
      const notes = (Array.isArray(notesResp?.notes) ? notesResp.notes : []) as Array<{ created_at: string | null }>;
      const hasDoc = Array.isArray(docsRes.data) && docsRes.data.length > 0;
      const hasLog = Array.isArray(signalsRes.data) && signalsRes.data.length > 0;
      const current = Array.isArray(critRes.data) ? currentFlagged(critRes.data as FlagRow[]) : [];
      setS({
        appointmentToday: today ? new Date(today.scheduled_at) : null,
        nextVisit: next ? new Date(next.scheduled_at) : null,
        newDoctorNotes: notes.filter(n => n.created_at && Date.parse(n.created_at) >= now - NOTE_WINDOW_MS).length,
        // Same list as Records' "Talk to your doctor about": the latest
        // reading of each test, outside the range (shared rule, labFlags).
        flaggedResults: current.length,
        urgentResults: current.filter(r => labFlag(r.status) === 'urgent').map(r => r.title.trim()).filter(Boolean),
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
        // '*': ends_on / pack_size / pack_started_on exist only once migration 027 is applied.
        db.from('medications').select('*').eq('user_id', uid).eq('active', true),
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
      const medicinesRunningOut = supplyReminders((Array.isArray(medsRes.data) ? medsRes.data : []) as Med[], now)
        .map(r => ({ name: r.name, label: r.label }));
      setTasks(t => ({ ...t, medicinesDue, medicinesRunningOut }));
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
      // Other methods: rows from the dates she entered on the method card.
      // No method yet (nothing chosen on this account): ask for it instead
      // of reminding a possibly IUD / implant user about a pill.
      const methodId = isMethodId(method) ? method : null;
      const contraceptionDue = mode === 'contraception'
        ? contraceptionRows(methodId, parseMethodDates(readJSON<unknown>(METHOD_DATES_KEY(uid)))[methodId ?? 'pill'], now)
        : [];
      const methodMissing = mode === 'contraception' && method == null;
      if (mode === 'contraception' && method === 'pill') {
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
      setTasks(t => ({ ...t, pill, contraceptionDue, methodMissing }));
    } catch {
      // Keep the last known state.
    }
  }, [uid, mode]);

  // Postpartum: babies at a common vaccination age. Other stages (not the
  // EPDS ones): the last mood ticked in the daily log, for the weekly row.
  const loadStageExtras = useCallback(async () => {
    if (!uid || !mode) return;
    try {
      const now = new Date();
      if (mode === 'postpartum') {
        const [babiesRes, vaxRes, birthRes] = await Promise.all([
          db.from('babies').select('id, name, birth_date').eq('user_id', uid),
          db.from('life_events').select('baby_id, occurred_at').eq('user_id', uid).eq('kind', 'baby_vaccine')
            .order('occurred_at', { ascending: false }).limit(200),
          db.from('birth_records').select('birth_at').eq('user_id', uid)
            .order('created_at', { ascending: false }).limit(1),
        ]);
        const last = new Map<string, Date>();
        for (const v of (Array.isArray(vaxRes.data) ? vaxRes.data : []) as Array<{ baby_id: string | null; occurred_at: string }>) {
          if (!v.baby_id) continue;
          const at = new Date(v.occurred_at);
          const prev = last.get(v.baby_id);
          if (!prev || at > prev) last.set(v.baby_id, at);
        }
        const babies: BabyForVaccines[] = ((Array.isArray(babiesRes.data) ? babiesRes.data : []) as Array<{ id: string; name: string | null; birth_date: string | null }>)
          .map(b => ({ name: b.name, birth_date: b.birth_date ? String(b.birth_date).slice(0, 10) : null, lastVaccineAt: last.get(b.id) ?? null }));
        setTasks(t => ({ ...t, babyVaccines: babyVaccineReminders(babies, now), lastMoodLog: undefined }));
        // Same sources as the stage page's recovery list: the birth record,
        // else the babies, else the date kept on this device.
        const rec = (Array.isArray(birthRes.data) ? birthRes.data[0] : null) as { birth_at?: string | null } | null;
        let deviceBirth: string | null = null;
        try { deviceBirth = localStorage.getItem(`womanie_postpartum_birth_${uid}`); } catch { /* storage blocked */ }
        setBirthDate(pickBirthDate(rec?.birth_at ?? null, babies.map(b => b.birth_date), deviceBirth));
      } else if (mode === 'pregnancy') {
        setTasks(t => ({ ...t, babyVaccines: [], lastMoodLog: undefined }));
      } else {
        const { data } = await db.from('daily_health_signals').select('signal_date, mood')
          .eq('user_id', uid).gte('signal_date', format(subDays(now, 35), 'yyyy-MM-dd'));
        setTasks(t => ({ ...t, babyVaccines: [], lastMoodLog: lastMoodLogFrom(data) }));
      }
    } catch {
      // Keep the last known state.
    }
  }, [uid, mode]);

  // IVF: the clinic dates (same source as the stage page's timeline).
  const loadIvf = useCallback(async () => {
    if (!uid || mode !== 'ivf') return;
    let local: IvfPlan | null = null;
    try {
      const raw = localStorage.getItem(IVF_PLAN_LOCAL_KEY(uid));
      if (raw) local = parseIvfPlan(raw);
    } catch { /* storage blocked */ }
    if (local) setIvfPlan(local);
    try {
      const { data, error } = await db.from('ivf_plans').select('plan').eq('user_id', uid).maybeSingle();
      const row = data as { plan: unknown } | null;
      if (!error && row) setIvfPlan(parseIvfPlan(row.plan));
      else if (!local) setIvfPlan(parseIvfPlan(null));
    } catch {
      if (!local) setIvfPlan(parseIvfPlan(null));
    }
  }, [uid, mode]);
  const loadIvfLog = useCallback(async () => {
    if (!uid || mode !== 'ivf') return;
    try {
      const since = new Date(Date.now() - WARNING_SIGN_HOURS * 3_600_000).toISOString();
      const { data } = await db.from('life_events').select('data, occurred_at').eq('user_id', uid)
        .eq('kind', 'tww_symptom').gte('occurred_at', since);
      setIvfLog(((Array.isArray(data) ? data : []) as Array<{ data: unknown; occurred_at: string }>).map(r => {
        let d = r.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
        return { occurred_at: r.occurred_at, data: (d && typeof d === 'object' ? d : {}) as SymptomEntry['data'] };
      }));
    } catch {
      // Keep the last known state.
    }
  }, [uid, mode]);
  useEffect(() => { void loadIvfLog(); }, [loadIvfLog]);
  useEffect(() => onHealthDataChange(() => { void loadIvfLog(); }), [loadIvfLog]);
  useEffect(() => { void loadIvf(); }, [loadIvf]);
  useEffect(() => onHealthDataChange(() => { void loadIvf(); }), [loadIvf]);

  useEffect(() => { void loadMeds(); }, [loadMeds]);
  useEffect(() => { void loadStageExtras(); }, [loadStageExtras]);
  useEffect(() => onHealthDataChange(() => { void loadStageExtras(); }), [loadStageExtras]);
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

  // The recovery milestone tick lives in an account-synced device key.
  const postnatal = useMemo(() => {
    if (mode !== 'postpartum' || !uid || visitTimes === null) return false;
    const ticked = readJSON<Record<string, boolean>>(`postpartum:${uid}:milestones`)?.[POSTNATAL_MILESTONE_ID] === true;
    return postnatalCheckDue({ birthDate, visits: visitTimes, ticked });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, uid, visitTimes, birthDate, accountVersion, s]);

  // Postpartum: red flags in a recovery check-in saved today or yesterday
  // (account-synced device key, same list the recovery card shows).
  const recoveryRedFlags = useMemo(() => {
    if (mode !== 'postpartum' || !recoveryKey) return [];
    const now = new Date();
    const day = (d: Date) => format(d, 'yyyy-MM-dd');
    const recent = new Set([day(now), day(subDays(now, 1))]);
    return parseCheckins(readJSON<unknown>(recoveryKey))
      .filter(e => recent.has(e.date))
      .flatMap(e => assessCheckin(e).urgent)
      .filter((f, i, all) => all.indexOf(f) === i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, recoveryKey, accountVersion, s]);

  const ivfWarningSign = useMemo(
    () => mode === 'ivf' && recentWarningSign(ivfLog, new Date()),
    // `tasks` changes on the 5-minute refresh: let a 48-hour-old sign drop off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, ivfLog, tasks],
  );

  const ivf = useMemo(() => {
    if (mode !== 'ivf' || !ivfPlan) return { ivfDates: [], ivfSetupNeeded: false };
    const now = new Date();
    const tz = deviceTz();
    return {
      ivfDates: ivfTodayDates(ivfPlan, now, tz).map(d => ({
        key: d.key, label: d.label, daysUntil: d.daysUntil,
        time: d.at ? localDateTime(new Date(d.at), tz).time : null,
      })),
      ivfSetupNeeded: !hasAnyDate(ivfPlan) && !ivfPhase,
    };
    // `s` / `tasks` change on the 5-minute refresh: re-evaluate today / tomorrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ivfPlan, ivfPhase, s, tasks]);

  const hasName = !!profileName?.trim();
  return {
    ...s,
    ...tasks,
    ...ivf,
    vaccinesDue,
    lastMoodCheck,
    postnatalCheckDue: postnatal,
    recoveryRedFlags,
    ivfWarningSign,
    setup: s.setup ? { ...s.setup, done: s.setup.done + Number(hasName), nameMissing: !hasName } : s.setup,
    // Settings -> Reminders, the in-app switches (the phone has its own per-device ones):
    // "Visit rows in the app" hides the day-of and upcoming visit rows,
    // "Period notes in the app" the period due / late rows.
    appointmentToday: prefs.appointmentReminders ? s.appointmentToday : null,
    nextVisit: prefs.appointmentReminders ? s.nextVisit : null,
    periodReminders: prefs.cycleReminders,
    periodDaysUntil: periodDaysUntil(period),
  };
}
