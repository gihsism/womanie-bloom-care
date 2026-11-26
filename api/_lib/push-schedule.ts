// Which phone reminders are due for ONE user right now (pure: no DB, no
// network, so the rules are unit-tested). The sender (api/_routes/push/
// send-due.ts) loads each user's own rows, calls planUserReminders once per
// user, and sends each reminder only to that user's own devices.
//
// Product rules (decided 2026-11-26):
// - Everything is read in HER local time (the timezone her phone reported
//   when she switched notifications on).
// - Medicine: at each reminder time she set on the medicine, unless she has
//   already ticked enough doses today (same rule as the in-app "due" list,
//   src/lib/medicine.ts dueReminders). A run that comes up to 60 minutes
//   late still sends it; older ones are skipped (no stale pile-up).
//   A time she chose herself inside quiet hours (e.g. a 23:00 pill) is
//   still sent: she picked it.
// - Period expected tomorrow, and period 3-7 days late (once per cycle);
//   only in stages that have periods.
// - A visit tomorrow (sent the day before).
// - Quiet hours 22:00-07:00: reminders whose time Womanie chooses (period,
//   visit) are never sent then; they go out from 09:00 until 21:59 at the
//   first scheduler run. With a once-a-day scheduler they still arrive the
//   same day as long as that run lands in her daytime.
// - Lock-screen wording stays discreet: no medicine names, no doctor names.
// - IVF trigger shot (opt-in, off until she switches it on): about 1 hour
//   and in the last 15 minutes before the exact time she entered
//   (windows in src/lib/ivfJourney.ts TRIGGER_PUSH_WINDOWS, pinned by the
//   parity test). Sent in quiet hours too: she did not pick the time, her
//   clinic did, and missing it matters. Wording says "timed injection".

export type ReminderType = 'medicine' | 'period' | 'appointment' | 'ivf_trigger';

// bookings: doctor side only (a patient booked / cancelled / moved a visit
// with HER as the doctor); switched in the doctor's Profile & settings.
// Sent at booking time by api/_lib/doctor-notify.ts, not by this planner.
// documents: patient side, "Dr X added a document" (sent at upload time by
// api/_lib/doctor-documents.ts, not by this planner).
// ivf_trigger: opt-in (false unless she switched it on), see above.
export interface PushPrefs { medicine: boolean; period: boolean; appointment: boolean; bookings: boolean; documents: boolean; ivf_trigger: boolean }

export const DEFAULT_PREFS: PushPrefs = { medicine: true, period: true, appointment: true, bookings: true, documents: true, ivf_trigger: false };

export interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  timezone: string | null;
  prefs: Partial<PushPrefs> | string | null;
  updated_at?: string | null;
}

export interface MedRow { id: string; user_id?: string; reminder_times: string[] | string | null }
export interface DoseRow { user_id?: string; medication_id: string | null; occurred_at: string }
export interface PeriodRow { period_start_date: string; cycle_length: number | null }
export interface ApptRow { id: string; scheduled_at: string; status: string | null }

export interface UserData {
  userId: string;
  lifeStage: string | null;
  meds: MedRow[];
  doses: DoseRow[];
  period: PeriodRow | null;
  appointments: ApptRow[];
  /** IVF trigger shot moment (UTC ISO) from ivf_plans, if one is near. */
  ivfTriggerAt?: string | null;
}

export interface PushPayload { title: string; body: string; url: string; tag: string }

export interface PlannedReminder {
  userId: string;
  type: ReminderType;
  /** Unique per user: the sender claims it once in push_sent_log. */
  key: string;
  /**
   * Medicine only: the dose slot (the n-th reminder time of her day). The
   * sender claims it too and sends only when BOTH keys are new, so editing
   * a medicine's times never re-sends a dose she was already reminded of
   * (08:00 sent, time moved to 08:30 -> no second ping for that dose).
   */
  slotKey?: string;
  payload: PushPayload;
  /** Only this user's devices that opted in to this type. */
  subscriptions: SubscriptionRow[];
}

export const QUIET_START_MIN = 22 * 60;
export const QUIET_END_MIN = 7 * 60;
export const DAY_REMINDER_FROM_MIN = 9 * 60;
export const MED_LOOKBACK_MIN = 60;
export const PERIOD_STAGES = new Set(['menstrual-cycle', 'contraception', 'conception']);

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Local calendar date (YYYY-MM-DD) and minutes since local midnight. */
export function localParts(at: Date, timeZone: string): { date: string; minutes: number } {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export function isQuietHours(minutes: number): boolean {
  return minutes >= QUIET_START_MIN || minutes < QUIET_END_MIN;
}

/** Inside the daytime window for reminders whose time Womanie picks. */
export function inDayWindow(minutes: number): boolean {
  return !isQuietHours(minutes) && minutes >= DAY_REMINDER_FROM_MIN;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function parsePrefs(raw: SubscriptionRow['prefs']): PushPrefs {
  let p: unknown = raw;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
  const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
  return {
    medicine: o.medicine !== false,
    period: o.period !== false,
    appointment: o.appointment !== false,
    bookings: o.bookings !== false,
    documents: o.documents !== false,
    ivf_trigger: o.ivf_trigger === true,
  };
}

function parseTimes(raw: MedRow['reminder_times']): string[] {
  let v: unknown = raw;
  if (typeof v === 'string') {
    // Postgres text[] may arrive as '{08:00,20:00}' from some drivers.
    const s = v.trim();
    if (s.startsWith('[')) { try { v = JSON.parse(s); } catch { v = []; } }
    else v = s.replace(/^\{|\}$/g, '').split(',').map(x => x.replace(/"/g, '').trim());
  }
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((t): t is string => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort();
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/**
 * Trigger-shot reminder due now: 'hour' from 65 to just over 15 minutes
 * before, 'ten' in the last 15 minutes (the scheduler runs every 15 min, so
 * one run always lands in each window; the key is claimed once). Same rule
 * as src/lib/ivfJourney.ts dueTriggerPush (parity test in push-schedule.test.ts).
 */
export function triggerPushDue(triggerAt: string | null, now: Date): { kind: 'hour' | 'ten'; minutesLeft: number } | null {
  if (!triggerAt) return null;
  const t = Date.parse(triggerAt);
  if (Number.isNaN(t)) return null;
  const left = Math.ceil((t - now.getTime()) / 60_000);
  if (left <= 65 && left > 15) return { kind: 'hour', minutesLeft: left };
  if (left <= 15 && left > 0) return { kind: 'ten', minutesLeft: left };
  return null;
}

/** Her timezone: the most recently updated device's valid zone, else UTC. */
export function userTimeZone(subs: SubscriptionRow[]): string {
  const sorted = [...subs].sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
  return sorted.map(s => s.timezone).find(isValidTimeZone) ?? 'UTC';
}

/**
 * The reminders due for this user at `now`. Every reminder carries ONLY
 * subscriptions whose user_id is this user and that opted in to its type;
 * rows belonging to anyone else are ignored even if passed in by mistake.
 */
export function planUserReminders(data: UserData, allSubs: SubscriptionRow[], now: Date): PlannedReminder[] {
  const subs = allSubs.filter(s => s.user_id === data.userId);
  if (subs.length === 0) return [];
  const tz = userTimeZone(subs);
  const { date: today, minutes } = localParts(now, tz);
  const out: PlannedReminder[] = [];

  const push = (type: ReminderType, key: string, payload: PushPayload, slotKey?: string) => {
    const targets = subs.filter(s => parsePrefs(s.prefs)[type]);
    if (targets.length) out.push({ userId: data.userId, type, key, payload, subscriptions: targets, ...(slotKey ? { slotKey } : {}) });
  };

  // Medicine times.
  for (const med of data.meds) {
    if (med.user_id && med.user_id !== data.userId) continue;
    const times = parseTimes(med.reminder_times);
    if (!times.length) continue;
    const dosesToday = data.doses.filter(d =>
      d.medication_id === med.id && (!d.user_id || d.user_id === data.userId) &&
      localParts(new Date(d.occurred_at), tz).date === today,
    ).length;
    const passed = times.filter(t => toMin(t) <= minutes);
    // Times are read fresh each run (an edit takes effect at the next run);
    // the medicine keeps its id when edited, so its keys and today's doses
    // stay attached to it.
    passed.forEach((t, slot) => {
      if (slot < dosesToday) return;
      if (minutes - toMin(t) > MED_LOOKBACK_MIN) return;
      push('medicine', `med:${med.id}:${today}:${t}`, {
        title: 'Medicine reminder',
        body: `It's ${t} - time for your medicine. Tap to log it.`,
        url: '/dashboard',
        tag: `med-${med.id}-${t}`,
      }, `med:${med.id}:${today}:slot${slot}`);
    });
  }

  // IVF trigger shot: before the quiet-hours cut, the clinic set the time.
  const trig = triggerPushDue(data.ivfTriggerAt ?? null, now);
  if (trig) {
    const at = new Date(data.ivfTriggerAt as string);
    const atIso = at.toISOString();
    const local = hhmm(localParts(at, tz).minutes);
    push('ivf_trigger', `ivf-trigger:${atIso}:${trig.kind}`, {
      title: 'Timed reminder',
      body: trig.kind === 'hour'
        ? `Your timed injection is at ${local}, in about ${trig.minutesLeft >= 55 ? '1 hour' : `${trig.minutesLeft} minutes`}.`
        : `Your timed injection is at ${local}, in ${trig.minutesLeft} minute${trig.minutesLeft === 1 ? '' : 's'}.`,
      url: '/dashboard/stage#ivf-trigger',
      tag: 'ivf-trigger',
    });
  }

  if (!inDayWindow(minutes)) return out;

  // Period expected tomorrow / late.
  const stage = data.lifeStage ?? 'menstrual-cycle';
  const p = data.period;
  if (PERIOD_STAGES.has(stage) && p && /^\d{4}-\d{2}-\d{2}/.test(p.period_start_date)) {
    const cycle = Number(p.cycle_length);
    if (Number.isFinite(cycle) && cycle >= 15 && cycle <= 60) {
      const expected = addDays(p.period_start_date.slice(0, 10), cycle);
      const until = daysBetween(today, expected);
      if (until === 1) {
        push('period', `period:soon:${expected}`, {
          title: 'Cycle reminder',
          body: 'Your period is expected tomorrow.',
          url: '/dashboard',
          tag: 'period',
        });
      } else if (until <= -3 && until >= -7) {
        push('period', `period:late:${expected}`, {
          title: 'Cycle reminder',
          body: `Your period is ${-until} days later than expected. Tap to log it or see what this can mean.`,
          url: '/dashboard',
          tag: 'period',
        });
      }
    }
  }

  // A visit tomorrow.
  const tomorrow = addDays(today, 1);
  for (const a of data.appointments) {
    if ((a.status ?? '').toLowerCase() === 'cancelled') continue;
    const at = new Date(a.scheduled_at);
    if (Number.isNaN(at.getTime())) continue;
    const local = localParts(at, tz);
    if (local.date !== tomorrow) continue;
    push('appointment', `appt:${a.id}:${at.toISOString()}`, {
      title: 'Visit tomorrow',
      body: `You have a visit tomorrow at ${hhmm(local.minutes)}. Tap to prepare your questions.`,
      url: '/dashboard/appointments',
      tag: `appt-${a.id}`,
    });
  }

  return out;
}
