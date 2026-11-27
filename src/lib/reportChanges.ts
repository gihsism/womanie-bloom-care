// "What changed since your last report": for one analysed lab report, how
// its results compare with her previous readings of the same tests (from
// earlier reports). Built on computeTrends (health-trends), run over the
// readings up to this report's date, so an old report uploaded late is
// compared with the reports before it, not with newer ones. Pure.
//
// Wording rule (as visitPrep / visitSummary): figures and dates only, no
// verdicts. "Outside the range" means the report marked it abnormal or
// critical; "within range" normal or expected.

import { computeTrends, describeRun, formatLabDay, type ExtractedItem } from './health-trends';

const OUT = new Set(['critical', 'abnormal']);
const IN = new Set(['normal', 'expected']);
const day = (raw: string | null | undefined) => (raw ? /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1] ?? null : null);

export interface ReportChange {
  title: string;
  /** "12 ng/mL" */
  value: string;
  /** "was 40 ng/mL on 1 Jun 2026" / the run sentence. */
  detail: string;
}

export interface ReportChanges {
  /** Tests on this report that also appear on an earlier report. */
  compared: number;
  newlyOut: ReportChange[];
  backInRange: ReportChange[];
  /** Same direction at each of the last 3+ tests, ending with this report. */
  steady: ReportChange[];
}

/**
 * Null when nothing on this report can be compared (no lab values, or no
 * earlier reading of any of its tests).
 */
export function changesSinceLastReport(
  documentId: string,
  rows: ExtractedItem[],
  nameOf: (t: string) => string = t => t,
): ReportChanges | null {
  const mine = rows.filter(r => r.document_id === documentId && r.data_type === 'lab_result' && day(r.date_recorded));
  if (mine.length === 0) return null;
  const upTo = mine.map(r => day(r.date_recorded) as string).sort().at(-1) as string;
  const trends = computeTrends(rows.filter(r => {
    const d = day(r.date_recorded);
    return d != null && d <= upTo;
  })).filter(t => t.latestDocumentId === documentId && day(t.prevDate) !== day(t.latestDate));
  if (trends.length === 0) return null;

  const out: ReportChanges = { compared: trends.length, newlyOut: [], backInRange: [], steady: [] };
  for (const t of trends) {
    const u = t.unit?.trim() ? ` ${t.unit.trim()}` : '';
    const now = (t.latestStatus ?? '').toLowerCase();
    const prev = (t.prevStatus ?? '').toLowerCase();
    const base = { title: nameOf(t.title), value: `${t.latestRawValue.trim()}${u}` };
    const was = `was ${t.prevRawValue.trim()}${u} on ${formatLabDay(day(t.prevDate) as string)}`;
    if (OUT.has(now) && IN.has(prev)) out.newlyOut.push({ ...base, detail: `${was} (within range)` });
    else if (IN.has(now) && OUT.has(prev)) out.backInRange.push({ ...base, detail: `${was} (outside range)` });
    else if (t.run) out.steady.push({ ...base, detail: describeRun(t.run, t.unit) });
  }
  return out;
}
