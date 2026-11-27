// Visit prep sheet: one printable page for ONE upcoming visit
// (/dashboard/appointments/:id/prep). Reuses the visit-summary helpers
// for the stage line and medicines; adds the questions saved to that
// visit and the results worth bringing up. Pure, unit-tested.
//
// Wording rule (as visitSummary): figures and dates only, no verdicts.
// A result is listed when her latest reading is marked outside the range
// or borderline, when its status moved since the previous reading, or when
// it moved the same way at each of the last 3+ tests (the Records trend).

import { computeTrends, describeRun, formatLabDay, type ExtractedItem } from './health-trends';
import { parseQuestions } from './visitQuestions';

export const MAX_PREP_RESULTS = 10;

const FLAGGED = new Set(['critical', 'abnormal', 'borderline']);
const STATUS_WORD: Record<string, string> = {
  critical: 'outside range (marked urgent)',
  abnormal: 'outside range',
  borderline: 'borderline',
  normal: 'within range',
  expected: 'expected for life stage',
};
const statusWord = (s: string | null | undefined) => (s ? STATUS_WORD[s] ?? null : null);

export interface PrepResultRow extends ExtractedItem {
  reference_range?: string | null;
}

export interface PrepResult {
  name: string;
  /** "18 ng/mL" */
  value: string;
  range: string;
  /** yyyy-mm-dd of the latest reading. */
  date: string;
  /** Why it is on the sheet, as plain facts. */
  note: string;
}

const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');
const day = (raw: string | null) => (raw ? /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1] ?? null : null);

/**
 * The results to discuss: one line per test (latest reading), urgent ones
 * first, then other out-of-range, borderline, status changes and steady
 * runs; newest first within each group.
 */
export function resultsToDiscuss(
  rows: PrepResultRow[],
  nameOf: (t: string) => string = t => t,
  max = MAX_PREP_RESULTS,
): PrepResult[] {
  const labs = rows.filter(r => (!r.data_type || r.data_type === 'lab_result') && r.title && r.value != null && String(r.value).trim() !== '');
  // Latest reading per test (undated readings only count when nothing is dated).
  const latest = new Map<string, PrepResultRow>();
  for (const r of labs) {
    const k = norm(r.title);
    const prev = latest.get(k);
    if (!prev || (day(r.date_recorded) ?? '') > (day(prev.date_recorded) ?? '')) latest.set(k, r);
  }
  const trends = new Map(computeTrends(labs).map(t => [norm(t.title), t]));

  const out: Array<PrepResult & { rank: number }> = [];
  for (const [k, r] of latest) {
    const status = (r.status ?? '').toLowerCase();
    const t = trends.get(k);
    const notes: string[] = [];
    let rank = 9;
    if (FLAGGED.has(status)) {
      notes.push(`Marked ${statusWord(status)}`);
      rank = status === 'critical' ? 0 : status === 'abnormal' ? 1 : 2;
    }
    if (t && t.statusShift !== 'same') {
      const was = statusWord(t.prevStatus);
      notes.push(`was ${t.prevRawValue}${t.unit ? ` ${t.unit}` : ''}${was ? ` (${was})` : ''} on ${formatLabDay(t.prevDate)}`);
      rank = Math.min(rank, 3);
    } else if (t?.run) {
      notes.push(describeRun(t.run, t.unit).replace(/^Gone/, 'gone').replace(/your last/, 'the last'));
      rank = Math.min(rank, 4);
    }
    if (notes.length === 0) continue;
    const note = notes.join('; ');
    out.push({
      name: nameOf(r.title.trim()),
      value: `${String(r.value).trim()}${r.unit ? ` ${r.unit}` : ''}`,
      range: r.reference_range?.trim() || '',
      date: day(r.date_recorded) ?? '',
      note: note[0].toUpperCase() + note.slice(1),
      rank,
    });
  }
  return out
    .sort((a, b) => a.rank - b.rank || b.date.localeCompare(a.date) || a.name.localeCompare(b.name))
    .slice(0, max)
    .map(({ rank: _rank, ...r }) => r);
}

/**
 * The questions for this visit: the open ones saved to it; when nothing
 * was saved to it, the open questions she saved before any visit was
 * booked. `fromVisit` says which list it is.
 */
export function prepQuestions(
  visitRow: { questions: unknown } | null | undefined,
  unscheduledRow: { questions: unknown } | null | undefined,
): { questions: string[]; fromVisit: boolean } {
  const open = (row: { questions: unknown } | null | undefined) =>
    row ? parseQuestions(row.questions).filter(q => !q.asked).map(q => q.text) : [];
  if (visitRow) return { questions: open(visitRow), fromVisit: true };
  return { questions: open(unscheduledRow), fromVisit: false };
}
