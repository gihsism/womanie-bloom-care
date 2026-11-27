// Trying to conceive: the cycle summary on the visit prep sheet, for a
// fertility doctor. The current cycle plus the last 6 completed ones: start,
// cycle length, period length and the ovulation (LH) tests she logged in
// each, then one plain line with the ranges. Cycle and period lengths come
// from lastCycles() (the visit summary's rules: gaps outside 15-90 days are
// left blank as a missed log); LH results are the "LH test: …" segments the
// ovulation-tests card writes into daily_health_signals.notes. Pure,
// unit-tested.
//
// Wording rule: figures and dates only. No "regular", no "normal".

import { daysBetween, lastCycles, parseDay, type PeriodRow } from './visitSummary';
import { parseOpk, type OpkResult } from './ttc';

export const TTC_PREP_CYCLES = 6;

export interface TtcSignalRow {
  signal_date: string;
  notes?: string | null;
}

export interface TtcCycleLine {
  start: Date;
  /** The running cycle (no next period logged yet). */
  current: boolean;
  cycleLength: number | null;
  periodLength: number | null;
  /** Days in this cycle with an LH test logged. */
  lhTests: number;
  /** Positive / peak results as cycle days (period start = day 1). */
  lhPositive: Array<{ day: number; result: Exclude<OpkResult, 'negative'> }>;
}

export interface TtcCycleSummary {
  cycles: TtcCycleLine[];
  sentence: string;
}

const range = (xs: number[], unit: string) => {
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return lo === hi ? `${lo} ${unit}` : `${lo} to ${hi} ${unit}`;
};

/** "Day 14 (peak)" lines for a cycle, or the count of negative tests. */
export function lhText(c: TtcCycleLine): string {
  if (c.lhTests === 0) return 'None logged';
  const pos = c.lhPositive.map(p => `day ${p.day} ${p.result}`);
  const tests = `${c.lhTests} ${c.lhTests === 1 ? 'test' : 'tests'}`;
  return pos.length ? `${tests}; ${pos.join(', ')}` : `${tests}, all negative`;
}

export function ttcCycleSummary(
  periods: PeriodRow[],
  signals: TtcSignalRow[],
  now = new Date(),
  n = TTC_PREP_CYCLES,
): TtcCycleSummary {
  const opk = new Map<string, OpkResult>();
  for (const s of signals) {
    const r = parseOpk(s.notes);
    if (r && s.signal_date) opk.set(String(s.signal_date).slice(0, 10), r);
  }
  const tests = [...opk.entries()]
    .map(([day, result]) => ({ date: parseDay(day), result }))
    .filter((t): t is { date: Date; result: OpkResult } => t.date != null);

  const rows = lastCycles(periods, n);
  const cycles: TtcCycleLine[] = rows.map((c, i) => {
    // A cycle runs to the day before the newer period start (today for the current one).
    const end = i === 0 ? now : new Date(rows[i - 1].start.getFullYear(), rows[i - 1].start.getMonth(), rows[i - 1].start.getDate() - 1);
    const inCycle = tests
      .filter(t => daysBetween(c.start, t.date) >= 0 && daysBetween(t.date, end) >= 0)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    return {
      start: c.start,
      current: i === 0,
      cycleLength: c.cycleLength,
      periodLength: c.periodLength,
      lhTests: inCycle.length,
      lhPositive: inCycle
        .filter(t => t.result !== 'negative')
        .map(t => ({ day: daysBetween(c.start, t.date) + 1, result: t.result as Exclude<OpkResult, 'negative'> })),
    };
  });

  const completed = cycles.filter(c => !c.current);
  const lengths = completed.map(c => c.cycleLength).filter((v): v is number => v != null);
  const bleeds = cycles.map(c => c.periodLength).filter((v): v is number => v != null);
  const parts: string[] = [];
  if (lengths.length) {
    const avg = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
    parts.push(`Cycle length ${range(lengths, 'days')} over ${lengths.length} ${lengths.length === 1 ? 'cycle' : 'cycles'}${lengths.length > 1 ? ` (average ${avg})` : ''}.`);
  }
  if (bleeds.length) parts.push(`Period length ${range(bleeds, 'days')}.`);
  if (cycles.length) {
    const withTests = cycles.filter(c => c.lhTests > 0).length;
    const withPos = cycles.filter(c => c.lhPositive.length > 0).length;
    parts.push(withTests === 0
      ? 'No ovulation tests logged in these cycles.'
      : `Ovulation tests logged in ${withTests} of ${cycles.length} cycles; a positive or peak result in ${withPos}.`);
  }
  const sentence = cycles.length === 0 ? 'No periods logged yet.' : parts.join(' ');
  return { cycles, sentence };
}
