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
import { flagRank, labFlag, latestPerTest, normTestTitle } from './labFlags';

export const MAX_PREP_RESULTS = 10;

// "Outside range" / "borderline" come from the shared definition (labFlags).
const FLAG_WORD = { urgent: 'outside range (marked urgent)', outside: 'outside range', borderline: 'borderline' } as const;
const STATUS_WORD: Record<string, string> = {
  normal: 'within range',
  expected: 'expected for life stage',
};
const statusWord = (s: string | null | undefined) => {
  const f = labFlag(s);
  if (f) return FLAG_WORD[f];
  return s ? STATUS_WORD[s.trim().toLowerCase()] ?? null : null;
};

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

const norm = normTestTitle;
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
  // Latest reading per test (shared rule, labFlags; undated readings only
  // count when nothing is dated).
  const latest = new Map(latestPerTest(labs.map(r => ({ ...r, data_type: 'lab_result' }))).map(r => [norm(r.title), r] as const));
  const trends = new Map(computeTrends(labs).map(t => [norm(t.title), t]));

  const out: Array<PrepResult & { rank: number }> = [];
  for (const [k, r] of latest) {
    const t = trends.get(k);
    const notes: string[] = [];
    let rank = 9;
    if (labFlag(r.status)) {
      notes.push(`Marked ${statusWord(r.status)}`);
      rank = flagRank(r.status);
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
