import { differenceInDays, parseISO } from "date-fns";

// Retrospective scoring for the cycle predictor, split out of
// CyclePredictionAccuracyCard so the walk-forward logic can be unit-tested
// without React. For each past period (from the 3rd onward), use only the
// cycles that came *before* it — the data the predictor would have had —
// take the median of the last 6 valid gaps, project the next start, and
// compare to what actually happened.

const MIN_VALID_CYCLE = 18;
const MAX_VALID_CYCLE = 60;

export interface ScoredPrediction {
  actual: Date;
  predicted: Date;
  deltaDays: number; // actual - predicted, signed
  basedOnNCycles: number;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

// startDates: period start dates as ISO strings, ASCENDING (oldest first).
// Returns up to the last 4 scoreable predictions.
export function scorePredictions(startDates: string[]): ScoredPrediction[] {
  if (startDates.length < 4) return [];

  const out: ScoredPrediction[] = [];
  for (let i = 2; i < startDates.length; i++) {
    const priorStarts = startDates.slice(0, i).map((d) => parseISO(d));
    // Cycle gaps between consecutive prior starts.
    const gaps: number[] = [];
    for (let j = 1; j < priorStarts.length; j++) {
      const g = differenceInDays(priorStarts[j], priorStarts[j - 1]);
      if (g >= MIN_VALID_CYCLE && g <= MAX_VALID_CYCLE) gaps.push(g);
    }
    if (gaps.length === 0) continue;
    const recent = gaps.slice(-6); // weight to recent cycles
    const med = Math.round(median(recent));
    const lastPriorStart = priorStarts[priorStarts.length - 1];
    const predicted = new Date(lastPriorStart);
    predicted.setDate(predicted.getDate() + med);
    const actual = parseISO(startDates[i]);
    const deltaDays = differenceInDays(actual, predicted);
    // Skip extreme outliers (likely missed entries between).
    if (Math.abs(deltaDays) > 30) continue;
    out.push({ actual, predicted, deltaDays, basedOnNCycles: recent.length });
  }
  return out.slice(-4); // last 4 scoreable predictions
}
