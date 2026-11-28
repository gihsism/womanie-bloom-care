// IVF journey: the dates of one treatment cycle, where she is today, the
// next key date, the trigger-shot reminders and the two-week wait.
//
// Pure (no React, no DB, no '@/' imports) so it is unit-tested and the
// server tests (api/_lib/push-schedule.test.ts) can check the push
// planner against the same trigger rule.
//
// Product rules (decided 2026-11-26):
// - She sets every date herself (the clinic gives them); nothing is
//   predicted. Stim day N is counted from the first stimulation day
//   (= day 1), the way Swiss clinics count it on the protocol sheet.
// - Calendar days are counted on plain dates (YYYY-MM-DD) with UTC math,
//   so a day is a day across the March / October clock changes in
//   Europe/Zurich (no 23- or 25-hour "days").
// - The trigger shot is an exact moment: she types the date and the time
//   the clinic gave her; it is stored as a UTC instant plus the timezone
//   she typed it in. A time that does not exist on the night the clocks
//   go forward (02:30 on the last Sunday of March) moves forward with the
//   clock (03:30); a time that happens twice when they go back (02:30 on
//   the last Sunday of October) is read as the first one.
// - The phase follows the latest date she has reached; when no date is
//   set, the app keeps the phase she picked by hand.
// - Tone: calm, practical, no medical advice, no interpretation of
//   symptoms.

export const DEFAULT_IVF_TZ = 'Europe/Zurich';

/** Keys shared with src/components/dashboard/ivfPhases.ts and profiles.ivf_phase. */
export type IvfPhaseKey = 'prep' | 'stimulation' | 'trigger' | 'retrieval' | 'fertilization' | 'transfer' | 'tww' | 'beta';

export interface IvfPlan {
  v: 1;
  /** First day of down-regulation / priming (optional: many protocols skip it). */
  downregStart: string | null;
  /** Stim day 1. */
  stimStart: string | null;
  /**
   * Monitoring scans / blood tests during stimulation, as the clinic books
   * them (sorted, no repeats, at most MAX_IVF_SCANS). Older saved plans
   * have no such field: read as [].
   */
  scans: string[];
  /** The trigger shot as a UTC instant (ISO). */
  triggerAt: string | null;
  /** The timezone she entered the trigger time in. */
  triggerTz: string | null;
  retrieval: string | null;
  transfer: string | null;
  /** The blood test (beta hCG) date the clinic gave her. */
  testDate: string | null;
}

export const EMPTY_IVF_PLAN: IvfPlan = {
  v: 1, downregStart: null, stimStart: null, scans: [], triggerAt: null, triggerTz: null, retrieval: null, transfer: null, testDate: null,
};

export const MAX_IVF_SCANS = 10;

export const IVF_PLAN_LOCAL_KEY = (userId: string) => `womanie_ivf_plan_${userId}`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDateStr(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function isTimeStr(v: unknown): v is string {
  return typeof v === 'string' && TIME_RE.test(v);
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** Anything from storage -> a clean plan (unknown or broken fields dropped). */
export function parseIvfPlan(raw: unknown): IvfPlan {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const date = (k: string) => (isDateStr(o[k]) ? (o[k] as string) : null);
  const at = typeof o.triggerAt === 'string' && !Number.isNaN(Date.parse(o.triggerAt)) ? new Date(o.triggerAt).toISOString() : null;
  return {
    v: 1,
    downregStart: date('downregStart'),
    stimStart: date('stimStart'),
    scans: Array.isArray(o.scans)
      ? [...new Set(o.scans.filter(isDateStr))].sort().slice(0, MAX_IVF_SCANS)
      : [],
    triggerAt: at,
    triggerTz: at && isValidTimeZone(o.triggerTz) ? (o.triggerTz as string) : at ? DEFAULT_IVF_TZ : null,
    retrieval: date('retrieval'),
    transfer: date('transfer'),
    testDate: date('testDate'),
  };
}

export function hasAnyDate(p: IvfPlan): boolean {
  return !!(p.downregStart || p.stimStart || p.scans.length || p.triggerAt || p.retrieval || p.transfer || p.testDate);
}

// ─── Calendar math (DST-proof) ───

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (to - from). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Local date and time of an instant in a timezone. */
export function localDateTime(at: Date, timeZone: string): { date: string; time: string } {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export const localDate = (at: Date, timeZone: string) => localDateTime(at, timeZone).date;

/** Offset of the zone from UTC at an instant, in minutes (Zurich: 60 or 120). */
function offsetMinutes(atMs: number, tz: string): number {
  const { date, time } = localDateTime(new Date(atMs), tz);
  const [y, m, d] = date.split('-').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
  return Math.round((asUtc - Math.floor(atMs / 60_000) * 60_000) / 60_000);
}

/**
 * The instant at which the wall clock in `timeZone` shows `date time`.
 * Clock-change rules: see the header (gap -> moves forward, overlap -> first).
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
  const before = offsetMinutes(wall - 14 * 3_600_000, tz);
  const after = offsetMinutes(wall + 14 * 3_600_000, tz);
  const hits = [...new Set([before, after])]
    .map(o => wall - o * 60_000)
    .filter(t => { const l = localDateTime(new Date(t), tz); return l.date === date && l.time === time; })
    .sort((a, b) => a - b);
  if (hits.length) return new Date(hits[0]);
  // Inside the spring-forward gap: the clock jumps, so the moment is the
  // same distance past the jump (02:30 -> 03:30 in Zurich).
  return new Date(wall - before * 60_000);
}

// ─── Timeline and phase ───

export interface IvfStep {
  key: 'downreg' | 'stims' | 'scan' | 'trigger' | 'retrieval' | 'transfer' | 'tww' | 'test';
  label: string;
  phase: IvfPhaseKey;
  /** Local date of the step (the trigger: its local date in her zone). */
  date: string | null;
  state: 'done' | 'current' | 'upcoming';
}

const STEP_LABELS: Record<IvfStep['key'], string> = {
  downreg: 'Down-regulation',
  stims: 'Stimulation',
  scan: 'Monitoring scan',
  trigger: 'Trigger shot',
  retrieval: 'Egg retrieval',
  transfer: 'Embryo transfer',
  tww: 'Two-week wait',
  test: 'Test day',
};

export interface IvfStatus {
  /** null when no date she set has been reached (keep the manual phase). */
  phase: IvfPhaseKey | null;
  /** Local date the current phase started (for profiles.ivf_start_date). */
  phaseStart: string | null;
  /** Stim day N (day 1 = first stimulation day), from stims to trigger day. */
  stimDay: number | null;
  /** True once the trigger moment has passed. */
  triggerDone: boolean;
}

function triggerLocalDate(p: IvfPlan, tz: string): string | null {
  return p.triggerAt ? localDate(new Date(p.triggerAt), tz) : null;
}

export function ivfStatus(p: IvfPlan, now: Date, tz: string = DEFAULT_IVF_TZ): IvfStatus {
  const today = localDate(now, tz);
  const trig = triggerLocalDate(p, tz);
  const triggerDone = !!p.triggerAt && now.getTime() >= Date.parse(p.triggerAt);
  const reached = (d: string | null) => !!d && daysBetween(d, today) >= 0;

  let stimDay: number | null = null;
  if (p.stimStart && reached(p.stimStart) && (!trig || daysBetween(today, trig) >= 0) && !reached(p.retrieval) && !reached(p.transfer)) {
    stimDay = daysBetween(p.stimStart, today) + 1;
  }

  let phase: IvfPhaseKey | null = null;
  let phaseStart: string | null = null;
  if (p.testDate && reached(p.testDate)) { phase = 'beta'; phaseStart = p.testDate; }
  else if (p.transfer && reached(p.transfer)) {
    if (p.transfer === today) { phase = 'transfer'; phaseStart = p.transfer; }
    else { phase = 'tww'; phaseStart = addDays(p.transfer, 1); }
  } else if (p.retrieval && reached(p.retrieval)) {
    if (p.retrieval === today) { phase = 'retrieval'; phaseStart = p.retrieval; }
    else { phase = 'fertilization'; phaseStart = addDays(p.retrieval, 1); }
  } else if (trig && (reached(trig) || triggerDone)) { phase = 'trigger'; phaseStart = trig; }
  else if (p.stimStart && reached(p.stimStart)) { phase = 'stimulation'; phaseStart = p.stimStart; }
  else if (p.downregStart && reached(p.downregStart)) { phase = 'prep'; phaseStart = p.downregStart; }

  return { phase, phaseStart, stimDay, triggerDone };
}

const PHASE_TO_STEP: Record<IvfPhaseKey, IvfStep['key']> = {
  prep: 'downreg', stimulation: 'stims', trigger: 'trigger', retrieval: 'retrieval',
  fertilization: 'retrieval', transfer: 'transfer', tww: 'tww', beta: 'test',
};

/**
 * The steps to draw. Down-regulation shows only when she set a date for it
 * (many protocols have none). `fallbackPhase` = the phase she picked by
 * hand, used when no date has been reached yet.
 */
export function ivfTimeline(p: IvfPlan, now: Date, tz: string = DEFAULT_IVF_TZ, fallbackPhase: string | null = null): IvfStep[] {
  const st = ivfStatus(p, now, tz);
  const keys: IvfStep['key'][] = ['downreg', 'stims', 'trigger', 'retrieval', 'transfer', 'tww', 'test'];
  const dates: Record<IvfStep['key'], string | null> = {
    downreg: p.downregStart,
    stims: p.stimStart,
    scan: null,
    trigger: triggerLocalDate(p, tz),
    retrieval: p.retrieval,
    transfer: p.transfer,
    tww: p.transfer ? addDays(p.transfer, 1) : null,
    test: p.testDate,
  };
  const phase = st.phase ?? (fallbackPhase && fallbackPhase in PHASE_TO_STEP ? (fallbackPhase as IvfPhaseKey) : null);
  const visible = keys.filter(k => k !== 'downreg' || !!p.downregStart || phase === 'prep');
  const currentKey = phase ? PHASE_TO_STEP[phase] : null;
  const currentIdx = currentKey ? visible.indexOf(currentKey) : -1;
  return visible.map((key, i) => ({
    key,
    label: STEP_LABELS[key],
    phase: (Object.keys(PHASE_TO_STEP) as IvfPhaseKey[]).find(ph => PHASE_TO_STEP[ph] === key) ?? 'prep',
    date: dates[key],
    state: currentIdx < 0 ? 'upcoming' : i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'upcoming',
  }));
}

export interface NextKeyDate {
  key: IvfStep['key'];
  label: string;
  date: string;
  /** 0 = today. */
  daysUntil: number;
  /** The trigger only: the exact moment. */
  at: string | null;
}

/** Every date she set that is still ahead, soonest first (today's counts until it is over). */
function keyDatesAhead(p: IvfPlan, now: Date, tz: string): NextKeyDate[] {
  const today = localDate(now, tz);
  const cands: NextKeyDate[] = [];
  const add = (key: IvfStep['key'], date: string | null, at: string | null = null) => {
    if (!date) return;
    const daysUntil = daysBetween(today, date);
    if (daysUntil < 0) return;
    if (at && now.getTime() >= Date.parse(at)) return; // trigger already given
    cands.push({ key, label: STEP_LABELS[key], date, daysUntil, at });
  };
  add('stims', p.stimStart && daysBetween(today, p.stimStart) > 0 ? p.stimStart : null);
  for (const d of p.scans ?? []) add('scan', d);
  add('trigger', triggerLocalDate(p, tz), p.triggerAt);
  add('retrieval', p.retrieval);
  add('transfer', p.transfer);
  add('test', p.testDate);
  cands.sort((a, b) => a.daysUntil - b.daysUntil || (a.at ? -1 : 1));
  return cands;
}

/** The next date she set that is still ahead (today's counts until it is over). */
export function nextKeyDate(p: IvfPlan, now: Date, tz: string = DEFAULT_IVF_TZ): NextKeyDate | null {
  return keyDatesAhead(p, now, tz)[0] ?? null;
}

/**
 * Home's Today rows: the clinic dates she set for today and tomorrow
 * (soonest first; the trigger with its time; a trigger already given
 * drops out). Only her own dates, no advice.
 */
export function ivfTodayDates(p: IvfPlan, now: Date, tz: string = DEFAULT_IVF_TZ): NextKeyDate[] {
  return keyDatesAhead(p, now, tz).filter(k => k.daysUntil <= 1);
}

/** Her treatment dates in order, for the visit prep sheet (only the ones she set). */
export function ivfDateList(p: IvfPlan, tz: string = DEFAULT_IVF_TZ): Array<{ label: string; date: string; at: string | null }> {
  const rows: Array<{ label: string; date: string; at: string | null }> = [];
  const add = (label: string, date: string | null, at: string | null = null) => { if (date) rows.push({ label, date, at }); };
  add('Down-regulation starts', p.downregStart);
  add('Stimulation day 1', p.stimStart);
  (p.scans ?? []).forEach((d, i, all) => add(all.length > 1 ? `Monitoring scan ${i + 1}` : 'Monitoring scan', d));
  add('Trigger shot', triggerLocalDate(p, tz), p.triggerAt);
  add('Egg retrieval', p.retrieval);
  add('Embryo transfer', p.transfer);
  add('Test day', p.testDate);
  return rows;
}

/** Dates entered out of order (shown as a gentle "check this" note, never blocking). */
export function planIssues(p: IvfPlan, tz: string = DEFAULT_IVF_TZ): string[] {
  const seq: Array<[string, string | null]> = [
    ['Down-regulation', p.downregStart],
    ['Stimulation', p.stimStart],
    ['Trigger shot', triggerLocalDate(p, tz)],
    ['Egg retrieval', p.retrieval],
    ['Embryo transfer', p.transfer],
    ['Test day', p.testDate],
  ];
  const set = seq.filter((s): s is [string, string] => !!s[1]);
  const out: string[] = [];
  for (let i = 1; i < set.length; i++) {
    if (daysBetween(set[i - 1][1], set[i][1]) < 0) out.push(`${set[i][0]} is before ${set[i - 1][0].toLowerCase()}`);
  }
  return out;
}

// ─── Trigger shot ───

/** The phone reminders before the shot: 1 hour and 10 minutes. */
export const TRIGGER_REMINDERS = [
  { kind: 'hour' as const, minutesBefore: 60 },
  { kind: 'ten' as const, minutesBefore: 10 },
];
export type TriggerReminderKind = (typeof TRIGGER_REMINDERS)[number]['kind'];

/**
 * The phone scheduler runs every 15 minutes, so each reminder has a window
 * a run is sure to land in, and the message always says the real minutes
 * left. 'hour': from 65 to just over 15 minutes before; 'ten': the last 15
 * minutes. Nothing once the moment has passed. Each window is claimed once
 * per trigger time (push_sent_log), so a run never repeats one.
 */
export const TRIGGER_PUSH_WINDOWS: Record<TriggerReminderKind, { fromMin: number; toMin: number }> = {
  hour: { fromMin: 65, toMin: 15 },
  ten: { fromMin: 15, toMin: 0 },
};

export function minutesUntil(atIso: string, now: Date): number {
  return Math.ceil((Date.parse(atIso) - now.getTime()) / 60_000);
}

/** Which phone reminder is due now (server rule; mirrored in api/_lib/push-schedule.ts). */
export function dueTriggerPush(triggerAt: string | null, now: Date): { kind: TriggerReminderKind; minutesLeft: number } | null {
  if (!triggerAt || Number.isNaN(Date.parse(triggerAt))) return null;
  const left = minutesUntil(triggerAt, now);
  for (const r of TRIGGER_REMINDERS) {
    const w = TRIGGER_PUSH_WINDOWS[r.kind];
    if (left <= w.fromMin && left > w.toMin) return { kind: r.kind, minutesLeft: left };
  }
  return null;
}

/** The nominal reminder moments, for "We'll remind you at 20:30 and 21:20". */
export function triggerReminderTimes(triggerAt: string): Array<{ kind: TriggerReminderKind; at: Date }> {
  const t = Date.parse(triggerAt);
  return TRIGGER_REMINDERS.map(r => ({ kind: r.kind, at: new Date(t - r.minutesBefore * 60_000) }));
}

/** In-app alert while the app is open: exactly at 60 and 10 minutes, and at the moment. */
export function inAppTriggerAlert(triggerAt: string | null, now: Date): TriggerReminderKind | 'now' | null {
  if (!triggerAt) return null;
  const ms = Date.parse(triggerAt) - now.getTime();
  if (ms <= 0 && ms > -15 * 60_000) return 'now';
  if (ms > 0 && ms <= 10 * 60_000) return 'ten';
  if (ms > 10 * 60_000 && ms <= 60 * 60_000) return 'hour';
  return null;
}

/** "2 d 4 h", "3 h 05 min", "12:04" (mm:ss in the last hour). */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ─── Two-week wait ───

export interface TwoWeekWait {
  /** Days since the transfer (the day after the transfer = 1). */
  day: number;
  /** Days left to the test date she set; null when none is set. */
  daysToTest: number | null;
  /** Share of the wait done, 0..1 (null without a test date). */
  progress: number | null;
}

/** From the day after the transfer until the day before the test. */
export function twoWeekWait(p: IvfPlan, now: Date, tz: string = DEFAULT_IVF_TZ): TwoWeekWait | null {
  if (!p.transfer) return null;
  const today = localDate(now, tz);
  const day = daysBetween(p.transfer, today);
  if (day < 1) return null;
  if (p.testDate) {
    const left = daysBetween(today, p.testDate);
    if (left <= 0) return null;
    const total = daysBetween(p.transfer, p.testDate);
    return { day, daysToTest: left, progress: total > 0 ? Math.min(1, day / total) : null };
  }
  // No test date yet: count for up to three weeks, then stop.
  return day <= 21 ? { day, daysToTest: null, progress: null } : null;
}

export const TWW_SYMPTOMS = [
  'Cramping', 'Spotting', 'Bloating', 'Tender breasts', 'Tiredness', 'Nausea', 'Headache', 'Mood swings', 'Feeling okay',
] as const;

/**
 * Signs to call the clinic about straight away (OHSS: HFEA, RCOG; heavy
 * bleeding). Logged in the same list as TWW_SYMPTOMS, shown apart, and
 * the only entries the app reacts to (a call-your-clinic note, and Home's
 * Today row for 2 days).
 */
export const TWW_WARNING_SIGNS = [
  'Strong tummy pain', 'Belly swelling quickly', 'Short of breath', 'Much less urine', 'Heavy bleeding',
] as const;

/** Hours a logged warning sign keeps Home's "call your clinic" row. */
export const WARNING_SIGN_HOURS = 48;

/** A warning sign in an entry logged within the last WARNING_SIGN_HOURS. */
export function recentWarningSign(entries: SymptomEntry[], now: Date): boolean {
  const since = now.getTime() - WARNING_SIGN_HOURS * 3_600_000;
  const signs: readonly string[] = TWW_WARNING_SIGNS;
  return entries.some(e => {
    const t = Date.parse(e.occurred_at);
    if (Number.isNaN(t) || t < since || t > now.getTime() + 60_000) return false;
    return Array.isArray(e.data?.symptoms) && e.data.symptoms.some(x => typeof x === 'string' && signs.includes(x));
  });
}

export interface SymptomEntry { id?: string; occurred_at: string; data: { symptoms?: unknown; note?: unknown } }
export interface SymptomDay { date: string; symptoms: string[]; notes: string[] }

/** Her log, one row per local day, newest first; no scoring, no meaning. */
export function groupSymptomLog(entries: SymptomEntry[], tz: string = DEFAULT_IVF_TZ): SymptomDay[] {
  const by = new Map<string, SymptomDay>();
  for (const e of entries) {
    const t = Date.parse(e.occurred_at);
    if (Number.isNaN(t)) continue;
    const date = localDate(new Date(t), tz);
    const row = by.get(date) ?? { date, symptoms: [], notes: [] };
    const list = Array.isArray(e.data?.symptoms) ? e.data.symptoms.filter((s): s is string => typeof s === 'string') : [];
    for (const s of list) if (!row.symptoms.includes(s)) row.symptoms.push(s);
    if (typeof e.data?.note === 'string' && e.data.note.trim()) row.notes.push(e.data.note.trim().slice(0, 500));
    by.set(date, row);
  }
  return [...by.values()].sort((a, b) => b.date.localeCompare(a.date));
}
