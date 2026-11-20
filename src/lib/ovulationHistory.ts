// "Last 6 cycles" ovulation history.
//
// learnLuteal() only returns the cycles where ovulation was found, but the
// history view must also show the cycles where nothing was detected, so
// she can see which cycles had no LH tests / temperatures logged. This
// lists every completed cycle (period start → day before the next start)
// and attaches the same detectOvulation() result the learning uses.

import {
  detectOvulation,
  METHOD_TEXT,
  type LutealModel,
  type OvulationEstimate,
  type ProgesteroneLab,
  type SignalLike,
} from './ovulation';

export interface HistoryCycle {
  start: Date;
  nextStart: Date;
  /** Days from this period start to the next one. */
  length: number;
  ovulation: OvulationEstimate | null;
  /** Cycle day of ovulation (period start = day 1), null when not detected. */
  ovulationDay: number | null;
  /** Days from ovulation to the next period, null when not detected. */
  luteal: number | null;
}

const DAY = 86400000;
const parseYmd = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const diffD = (a: Date, b: Date) =>
  Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime() - new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()) / DAY);
const addD = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * The last `limit` completed cycles, newest first. `periodStarts` are ISO
 * dates in any order (duplicates ignored). The running cycle (no next
 * start yet) is not included.
 */
export function listCompletedCycles(
  periodStarts: string[],
  signals: Record<string, SignalLike>,
  progesterone?: ProgesteroneLab | null,
  limit = 6,
): HistoryCycle[] {
  const starts = [...new Set(periodStarts.filter(Boolean).map(s => s.slice(0, 10)))].sort().map(parseYmd);
  const out: HistoryCycle[] = [];
  for (let i = starts.length - 2; i >= 0 && out.length < limit; i--) {
    const start = starts[i];
    const nextStart = starts[i + 1];
    const length = diffD(nextStart, start);
    const ov = detectOvulation(signals, start, addD(nextStart, -1), progesterone);
    out.push({
      start,
      nextStart,
      length,
      ovulation: ov,
      ovulationDay: ov ? diffD(ov.date, start) + 1 : null,
      luteal: ov ? diffD(nextStart, ov.date) : null,
    });
  }
  return out;
}

/** One calm line above the list. */
export function lutealSummary(model: Pick<LutealModel, 'lutealLength' | 'source' | 'cycles'>): string {
  if (model.source === 'personal') {
    const n = model.cycles.filter(c => c.ovulation.confidence !== 'low').length;
    return `Your luteal phase is usually ${model.lutealLength} days (learned from ${n} ${n === 1 ? 'cycle' : 'cycles'}).`;
  }
  return 'We use the typical 14-day luteal phase until your LH tests or temperatures show when you ovulate.';
}

export const CONFIDENCE_TEXT: Record<OvulationEstimate['confidence'], string> = {
  high: 'clear signal',
  medium: 'good signal',
  low: 'rough estimate',
};

/** "positive LH test · good signal" */
export function describeOvulation(ov: OvulationEstimate): string {
  return `${METHOD_TEXT[ov.method]} · ${CONFIDENCE_TEXT[ov.confidence]}`;
}

export const NOT_DETECTED_TEXT = 'Not detected — log LH tests or temperature to see it';
