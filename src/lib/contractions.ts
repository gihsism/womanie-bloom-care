// Contraction timing maths for the late-pregnancy contraction timer.
// Pure functions (no React, no storage) so they can be unit-tested.
//
// Guidance this follows (non-diagnostic, the app never tells anyone they
// are or aren't in labour):
// - ACOG, "How to Tell When Labor Begins" (FAQ004): time contractions from
//   the start of one to the start of the next; true labour contractions
//   come at regular intervals, get closer together and last ~30-70 s.
//   The widely taught "5-1-1" rule (every 5 minutes, lasting 1 minute,
//   for 1 hour) is the usual point at which to call.
// - NHS, "Signs that labour has begun": contact your midwife or maternity
//   unit when contractions are regular, about 5 minutes apart and lasting
//   about 60 seconds (first baby); sooner for a fast previous labour, if
//   you live far away, or if your waters break, you bleed, or the baby
//   moves less.
// Clinics differ; the UI always says "follow your own midwife's or
// hospital's advice".

export interface TimedContraction {
  id: string;
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
}

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;

/** 5-1-1 thresholds. */
export const RULE_INTERVAL_MS = 5 * MINUTE; // start-to-start, at most
export const RULE_DURATION_MS = 1 * MINUTE; // each, at least
export const RULE_SUSTAINED_MS = 1 * HOUR; // pattern held for
// We accept the pattern as "held for an hour" once the first and the last
// contraction of the run are 50+ minutes apart: the run has to start with a
// contraction and the hour is rarely timed to the minute.
export const SUSTAINED_TOLERANCE_MS = 10 * MINUTE;
// A gap of more than 10 minutes breaks the run (a missed tap or a pause).
export const MAX_GAP_IN_RUN_MS = 10 * MINUTE;
// The pattern only counts as current if the last contraction started
// within this long ago.
export const CURRENT_WITHIN_MS = 10 * MINUTE;

export function durationMs(c: TimedContraction): number {
  return Math.max(0, c.endedAt - c.startedAt);
}

export function sortByStart<T extends { startedAt: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.startedAt - b.startedAt);
}

/** Start-to-start intervals between consecutive contractions (oldest first). */
export function intervalsMs(list: TimedContraction[]): number[] {
  const s = sortByStart(list);
  const out: number[] = [];
  for (let i = 1; i < s.length; i++) out.push(s[i].startedAt - s[i - 1].startedAt);
  return out;
}

/** Interval to the previous contraction for each one (null for the first). */
export function withIntervals(list: TimedContraction[]): Array<TimedContraction & { intervalMs: number | null; durationMs: number }> {
  const s = sortByStart(list);
  return s.map((c, i) => ({
    ...c,
    intervalMs: i === 0 ? null : c.startedAt - s[i - 1].startedAt,
    durationMs: durationMs(c),
  }));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export interface RollingSummary {
  count: number;
  avgIntervalMs: number | null;
  avgDurationMs: number | null;
  lastIntervalMs: number | null;
  lastDurationMs: number | null;
}

/**
 * Summary of the contractions that started in the last `windowMs`
 * (default one hour) before `now`. Intervals are only counted between two
 * contractions that are both inside the window.
 */
export function rollingSummary(list: TimedContraction[], now: number, windowMs = HOUR): RollingSummary {
  const inWindow = sortByStart(list).filter(c => c.startedAt >= now - windowMs && c.startedAt <= now);
  const ints = intervalsMs(inWindow);
  const durs = inWindow.map(durationMs);
  return {
    count: inWindow.length,
    avgIntervalMs: mean(ints),
    avgDurationMs: mean(durs),
    lastIntervalMs: ints.length ? ints[ints.length - 1] : null,
    lastDurationMs: durs.length ? durs[durs.length - 1] : null,
  };
}

export type PatternStatus = 'none' | 'building' | 'met';

export interface PatternResult {
  status: PatternStatus;
  /** How long the current regular run has lasted (first to last start). */
  sustainedMs: number;
  /** Contractions in the current regular run. */
  runCount: number;
}

/**
 * Detects the 5-1-1 pattern: contractions about every 5 minutes or closer
 * (start to start), each lasting about a minute or longer, held for an hour.
 *
 * The current "run" is the longest stretch ending with the latest
 * contraction in which no gap exceeds 10 minutes. Inside the run the
 * typical (median) interval must be <= 5 min and the typical duration
 * >= 1 min; medians tolerate one late tap. The run must also be current
 * (last contraction started within 10 minutes).
 *
 * - 'met': the run has held for >= 50 minutes (the hour, less tolerance).
 * - 'building': the last 3+ contractions already fit, but not for an hour.
 * - 'none': otherwise.
 */
export function detect511(list: TimedContraction[], now: number): PatternResult {
  const none: PatternResult = { status: 'none', sustainedMs: 0, runCount: 0 };
  const s = sortByStart(list).filter(c => c.startedAt <= now);
  if (s.length < 3) return none;
  const last = s[s.length - 1];
  if (now - last.startedAt > CURRENT_WITHIN_MS) return none;

  // Grow the run backwards from the latest contraction while it still fits.
  let best = -1;
  for (let i = s.length - 2; i >= 0; i--) {
    if (s[i + 1].startedAt - s[i].startedAt > MAX_GAP_IN_RUN_MS) break;
    const run = s.slice(i);
    if (run.length >= 3 && fits(run)) best = i;
  }
  if (best < 0) return none;
  const run = s.slice(best);
  const sustainedMs = last.startedAt - run[0].startedAt;
  const status: PatternStatus = sustainedMs >= RULE_SUSTAINED_MS - SUSTAINED_TOLERANCE_MS ? 'met' : 'building';
  return { status, sustainedMs, runCount: run.length };
}

function fits(run: TimedContraction[]): boolean {
  const mi = median(intervalsMs(run));
  const md = median(run.map(durationMs));
  return mi !== null && md !== null && mi <= RULE_INTERVAL_MS && md >= RULE_DURATION_MS;
}

/** "4m 05s", "58s", "1h 12m". */
export function formatSpan(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  if (m === 0) return `${sec}s`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}
