// Browser entry point for lab value / reference range parsing: the single
// source lives in api/_lib/lab-value.ts so the analysis pipeline, the AI
// retrieval and every screen read "1,250", "1'250" and "5,0 - 7,0" the same way.
export * from '../../api/_lib/lab-value';

/** Distance past a limit as a percentage of that limit (of the range width when the limit is 0). */
export function deviationPct(distance: number, limit: number, range: number): number {
  const base = limit > 0 ? limit : range;
  return Math.max(1, Math.round((distance / base) * 100));
}
