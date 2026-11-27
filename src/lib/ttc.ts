// Trying to conceive: ovulation tests (OPKs) and the fertile window, plus
// the "when to see a doctor" rule.
//
// OPK results live in daily_health_signals.notes as "LH test: negative" /
// "LH test: positive" / "LH test: peak" (the same segment DailyLogging
// writes; "peak" is the strongest reading on digital tests).
//
// Window rule: the LH surge comes 24–36 h before ovulation, so the first
// positive (or peak) test of the cycle puts ovulation at that day + 1
// (same rule lib/ovulation.ts uses to learn her luteal phase). The window
// is the 5 days before ovulation plus ovulation day + 1 (sperm survive up
// to 5 days); after a positive test the best days are that day and the
// next two. A temperature rise (BBT "3 over 6") confirms ovulation has
// happened and closes the window.

import { detectOvulation, parseBbtC, type OvulationEstimate, type SignalLike } from './ovulation';

export type OpkResult = 'negative' | 'positive' | 'peak';

export function parseOpk(notes: string | null | undefined): OpkResult | null {
  const m = (notes ?? '').match(/LH test:\s*(negative|positive|peak)/i);
  return m ? (m[1].toLowerCase() as OpkResult) : null;
}

/** Replace (or remove, with null) the "LH test: …" segment in a notes string. */
export function setOpkInNotes(notes: string | null | undefined, result: OpkResult | null): string | null {
  const kept = (notes ?? '')
    // Split only on ". " (how notes are joined) so "BBT: 36.6°C" stays whole.
    .split(/\.\s+|\.$/)
    .map(s => s.trim())
    .filter(s => s && !/^LH test:\s*(not-tested|negative|positive|peak)$/i.test(s));
  if (result) kept.push(`LH test: ${result}`);
  return kept.length ? kept.join('. ') : null;
}

/** Replace (or remove) the "BBT: 36.55°C" segment; same format DailyLogging writes. */
export function setBbtInNotes(notes: string | null | undefined, celsius: number | null): string | null {
  const kept = (notes ?? '')
    .split(/\.\s+|\.$/)
    .map(s => s.trim())
    .filter(s => s && !/^BBT:\s*\d+(?:\.\d+)?\s*°?\s*[CF]?$/i.test(s));
  if (celsius != null && Number.isFinite(celsius)) kept.push(`BBT: ${Math.round(celsius * 100) / 100}°C`);
  return kept.length ? kept.join('. ') : null;
}

/** A typed temperature in °C, or null if it is not a plausible BBT. */
export function parseTypedBbt(raw: string): number | null {
  const v = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(v) && v >= 35 && v <= 38.5 ? v : null;
}

const DAY = 86_400_000;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addD = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffD = (a: Date, b: Date) => Math.round((dayStart(a).getTime() - dayStart(b).getTime()) / DAY);
export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseYmd = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };

export interface FertileWindow {
  /** Calendar prediction: cycle start + cycle length − luteal length. */
  predicted: Date;
  /** The ovulation day the window is built around (OPK-shifted or confirmed). */
  ovulation: Date;
  start: Date;
  end: Date;
  /** What moved the window: nothing, a positive OPK, or a confirmed rise. */
  source: 'predicted' | 'opk' | 'confirmed';
  /** First positive/peak test this cycle, if any. */
  firstPositive: Date | null;
  /** Ovulation confirmed by temperature (with or without LH), if any. */
  confirmed: OvulationEstimate | null;
  /** ovulation − predicted, in days (positive = later than predicted). */
  shiftDays: number;
}

/**
 * The current cycle's fertile window. `signals` is keyed yyyy-MM-dd.
 * OPKs before cycle day 7 are ignored (as in detectOvulation).
 */
export function fertileWindow(params: {
  cycleStart: Date;
  cycleLength: number;
  lutealLength?: number;
  signals: Record<string, SignalLike>;
  today?: Date;
}): FertileWindow {
  const { cycleStart, signals } = params;
  const luteal = params.lutealLength ?? 14;
  const len = Number.isFinite(params.cycleLength) && params.cycleLength >= 18 && params.cycleLength <= 60 ? params.cycleLength : 28;
  const today = dayStart(params.today ?? new Date());
  const predicted = addD(cycleStart, Math.max(7, len - luteal));

  let firstPositive: Date | null = null;
  const lastDay = Math.max(0, diffD(today, cycleStart));
  for (let i = 6; i <= lastDay; i++) {
    const r = parseOpk(signals[ymd(addD(cycleStart, i))]?.notes);
    if (r === 'positive' || r === 'peak') { firstPositive = addD(cycleStart, i); break; }
  }

  const detected = detectOvulation(signals, cycleStart, today);
  const confirmed = detected && (detected.method === 'bbt' || detected.method === 'lh+bbt') ? detected : null;

  let ovulation = predicted;
  let source: FertileWindow['source'] = 'predicted';
  if (confirmed) { ovulation = dayStart(confirmed.date); source = 'confirmed'; }
  else if (firstPositive) { ovulation = addD(firstPositive, 1); source = 'opk'; }

  const start = addD(ovulation, -5);
  const end = addD(ovulation, 1);
  return { predicted, ovulation, start, end, source, firstPositive, confirmed, shiftDays: diffD(ovulation, predicted) };
}

/** Today's status in plain words, for the card's headline. */
export function windowHeadline(w: FertileWindow, today = new Date()): string {
  const t = dayStart(today);
  if (w.source === 'confirmed') return 'Ovulation confirmed by your temperature rise. Your fertile window has closed for this cycle.';
  if (w.firstPositive && diffD(t, w.firstPositive) >= 0 && diffD(t, w.firstPositive) <= 2) {
    return 'Positive test: today and the next day or two are your most fertile days.';
  }
  if (t < w.start) {
    const n = diffD(w.start, t);
    return `Fertile window starts in ${n} ${n === 1 ? 'day' : 'days'}.`;
  }
  if (t <= w.end) return 'You are in your fertile window.';
  return 'Your fertile window has passed for this cycle.';
}

export interface BbtPoint { day: number; date: string; c: number; opk: OpkResult | null }

/** BBT readings (°C) and OPK results per cycle day (day 1 = cycle start), for the chart. */
export function cycleChartPoints(cycleStart: Date, signals: Record<string, SignalLike>, today = new Date()): {
  temps: BbtPoint[];
  opks: { day: number; date: string; result: OpkResult }[];
  days: number;
} {
  const days = Math.max(1, diffD(today, cycleStart) + 1);
  const temps: BbtPoint[] = [];
  const opks: { day: number; date: string; result: OpkResult }[] = [];
  for (let i = 0; i < days; i++) {
    const date = ymd(addD(cycleStart, i));
    const s = signals[date];
    if (!s) continue;
    const opk = parseOpk(s.notes);
    const c = parseBbtC(s.notes);
    if (c !== null) temps.push({ day: i + 1, date, c, opk });
    if (opk) opks.push({ day: i + 1, date, result: opk });
  }
  return { temps, opks, days };
}

// ─── When to see a doctor ───────────────────────────────────────────
//
// NICE NG257 (Fertility problems, March 2026, replaced CG156) and ASRM
// Committee Opinion "Definition of infertility" (2023): see a doctor after 12 months of regular unprotected
// sex, or after 6 months if she is 35 or older. ASRM: from 40, an
// evaluation straight away is reasonable. See a doctor sooner with very
// irregular or absent periods or a known cause (both say so).

export interface TtcDoctorAdvice {
  monthsTrying: number;
  thresholdMonths: number;
  /** True once the threshold is reached. */
  due: boolean;
  /** Whole months until the suggestion appears (0 when due). */
  monthsLeft: number;
}

/** Whole calendar months from start to now (day-of-month aware). */
export function monthsBetween(start: Date, now: Date): number {
  let m = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) m -= 1;
  return Math.max(0, m);
}

export function thresholdMonthsFor(age: number | null | undefined): number {
  if (age != null && age >= 40) return 0;
  if (age != null && age >= 35) return 6;
  return 12;
}

/**
 * Earliest "started trying" date the picker accepts: 20 years back. A
 * browser date field reports every keystroke of the year (0002, 0020,
 * 0202, 2025), and each one used to be saved to the profile.
 */
export function ttcStartMin(todayIso: string): string {
  return `${Number(todayIso.slice(0, 4)) - 20}${todayIso.slice(4, 10)}`;
}

/** A complete, plausible start date: not in the future, not before ttcStartMin. */
export function isTtcStartInput(v: string, todayIso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && v <= todayIso && v >= ttcStartMin(todayIso);
}

export function ttcDoctorAdvice(ttcStart: string | null | undefined, age: number | null | undefined, now = new Date()): TtcDoctorAdvice | null {
  if (!ttcStart || !/^\d{4}-\d{2}-\d{2}/.test(ttcStart)) return null;
  const start = parseYmd(ttcStart);
  if (start.getTime() > now.getTime()) return null;
  const monthsTrying = monthsBetween(start, now);
  const thresholdMonths = thresholdMonthsFor(age);
  const due = monthsTrying >= thresholdMonths;
  return { monthsTrying, thresholdMonths, due, monthsLeft: due ? 0 : thresholdMonths - monthsTrying };
}

export function ttcDoctorText(a: TtcDoctorAdvice): string {
  if (a.thresholdMonths === 0) {
    return 'From 40, fertility doctors suggest a check-up early on rather than waiting. It is a routine step, and a good time to ask about simple tests for you and your partner.';
  }
  const span = a.thresholdMonths === 6 ? '6 months (the usual advice from 35)' : 'a year';
  return `You have been trying for ${span} or more. That is when doctors suggest a check-up: many couples are fine, and simple tests for both of you can help. Bring your visit summary.`;
}

/** Onboarding's "How long have you been trying?" -> an approximate start date. */
export function ttcStartFromDuration(duration: string | null | undefined, now = new Date()): string | null {
  const months: Record<string, number> = {
    'just-started': 0,
    '1-3-months': 2,
    '3-6-months': 4,
    '6-12-months': 9,
    'over-year': 13,
  };
  if (!duration || !(duration in months)) return null;
  return ymd(new Date(now.getFullYear(), now.getMonth() - months[duration], now.getDate()));
}
