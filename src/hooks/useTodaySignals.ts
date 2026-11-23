import { useCallback, useEffect, useState } from 'react';
import { isToday } from 'date-fns';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationPrefs } from '@/hooks/useNotificationPrefs';
import { onHealthDataChange } from '@/lib/data-events';
import type { TodaySignals } from '@/lib/todayItems';
import { RECORDS } from '@/lib/todayItems';
import type { PeriodData } from '@/hooks/useStageProfile';

// Reads the few facts Home's "Today" list ranks (lib/todayItems.ts):
// visits (today / within a week), recent doctor notes, results marked
// critical, getting-started progress, and the next predicted period.
// Read-only; the same endpoints and tables the old Home cards used
// (AppointmentTodayBanner, UpcomingAppointments, DoctorNotesCard,
// useAttentionCount, GettingStarted).

const NOTE_WINDOW_MS = 14 * 86_400_000;

interface Appt { scheduled_at: string; status: string | null; duration: number | null }

// Same per-device "Hide" the old Getting started card offered.
function setupHidden(userId: string): boolean {
  try { return localStorage.getItem(`womanie_getting_started_hidden_${userId}`) === '1'; } catch { return false; }
}

export function periodDaysUntil(period: PeriodData | null, now = new Date()): number | null {
  if (!period || !period.cycleLength) return null;
  const start = new Date(period.lastPeriodStart.getFullYear(), period.lastPeriodStart.getMonth(), period.lastPeriodStart.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = start.getTime() + period.cycleLength * 86_400_000;
  return Math.round((next - today.getTime()) / 86_400_000);
}

export function useTodaySignals(period: PeriodData | null, profileName: string | null | undefined): TodaySignals {
  const { user } = useAuth();
  const prefs = useNotificationPrefs();
  const [s, setS] = useState<Omit<TodaySignals, 'periodDaysUntil'>>({});

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
      const hasName = !!profileName?.trim();
      const done = Number(hasName) + Number(hasDoc) + Number(hasLog);
      setS({
        appointmentToday: today ? new Date(today.scheduled_at) : null,
        nextVisit: next ? new Date(next.scheduled_at) : null,
        newDoctorNotes: notes.filter(n => n.created_at && Date.parse(n.created_at) >= now - NOTE_WINDOW_MS).length,
        flaggedResults: Array.isArray(critRes.data) ? critRes.data.length : 0,
        setup: setupHidden(user.id) ? null : { done, total: 3, nameMissing: !hasName, nextTarget: !hasDoc ? RECORDS : 'sheet:log' },
      });
    } catch {
      // Today rows are a convenience; keep the last known state.
    }
  }, [user, profileName]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  return {
    ...s,
    // The day-of and upcoming visit rows follow the appointment-reminder toggle, as the old cards did.
    appointmentToday: prefs.appointmentReminders ? s.appointmentToday : null,
    periodDaysUntil: periodDaysUntil(period),
  };
}
