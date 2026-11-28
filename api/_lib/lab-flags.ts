// One definition of "outside the range" / "borderline" for every screen
// (Home, Records, visit prep sheet, doctor chart, Ask AI context) and the
// server's AI retrieval. Pure: no DB, no React. src/lib/labFlags.ts
// re-exports this file for the browser.
//
// Rules:
// - A result is "outside the range" when its status is critical (marked
//   urgent) or abnormal. Extraction is asked for normal|abnormal|critical|
//   expected|informational, but older rows and doctor-entered rows also
//   say high / low / elevated / decreased / out of range: same tier as
//   abnormal.
// - "Borderline" is its own tier: shown on the prep sheet and doctor
//   chart, never counted as outside the range.
// - "expected" (normal for her life stage) is never flagged.
// - Only the LATEST reading of each test counts: a high TSH re-tested
//   normal is no longer something to talk about. Tests are matched the
//   way the trend logic matches them (health-trends.ts): title trimmed,
//   lower-cased, spaces collapsed, within the same kind of record.

export type LabFlag = 'urgent' | 'outside' | 'borderline';

const OUTSIDE = new Set(['abnormal', 'high', 'low', 'elevated', 'decreased', 'out of range']);

/** The flag for one status word, or null when it is not flagged. */
export function labFlag(status: string | null | undefined): LabFlag | null {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === 'critical') return 'urgent';
  if (OUTSIDE.has(s)) return 'outside';
  if (s === 'borderline') return 'borderline';
  return null;
}

/** Marked outside the range (abnormal or critical). Borderline is not. */
export function isOutsideRange(status: string | null | undefined): boolean {
  const f = labFlag(status);
  return f === 'urgent' || f === 'outside';
}

/** Outside the range or borderline. */
export function isFlaggedOrBorderline(status: string | null | undefined): boolean {
  return labFlag(status) !== null;
}

/** 0 = urgent, 1 = outside the range, 2 = borderline, 9 = not flagged. */
export function flagRank(status: string | null | undefined): number {
  const f = labFlag(status);
  return f === 'urgent' ? 0 : f === 'outside' ? 1 : f === 'borderline' ? 2 : 9;
}

// Same matching as the trend logic (health-trends.ts uses these).
/** "Ferritin" and "ferritin " from two labs are one test. */
export const normTestTitle = (t: string | null | undefined) => String(t ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
/** Same unit written two ways ("µg/L", "ug/l", "mcg/L") counts as one. */
export const normLabUnit = (u: string | null | undefined) =>
  (u ?? '').trim().toLowerCase().replace(/\s+/g, '').replace(/[µμ]|mc(?=g)/g, 'u');

export interface TestRowLike {
  title: string | null;
  data_type?: string | null;
  date_recorded?: string | null;
}

/** Key of the test a row belongs to (kind of record + normalised title). */
export function testKey(r: TestRowLike): string {
  return `${String(r.data_type || 'lab_result').toLowerCase()}|${normTestTitle(r.title)}`;
}

const when = (d: string | null | undefined) => {
  const t = d ? Date.parse(d) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
};

/**
 * The latest reading of each test, in the order each test first appears.
 * Newest date_recorded wins; an undated reading only counts when the test
 * has no dated one; on the same date the row listed first wins (as the
 * trend logic's stable sort).
 */
export function latestPerTest<T extends TestRowLike>(rows: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const r of rows) {
    if (!r || !normTestTitle(r.title)) continue;
    const k = testKey(r);
    const prev = latest.get(k);
    if (!prev || when(r.date_recorded) > when(prev.date_recorded)) latest.set(k, r);
  }
  return [...latest.values()];
}

/**
 * What to talk to the doctor about right now: the latest reading of each
 * test when it is outside the range (or borderline, when asked), most
 * urgent first, newest first within a tier.
 */
export function currentFlagged<T extends TestRowLike & { status?: string | null }>(
  rows: readonly T[],
  opts: { borderline?: boolean } = {},
): T[] {
  const keep = opts.borderline ? isFlaggedOrBorderline : isOutsideRange;
  return latestPerTest(rows)
    .filter(r => keep(r.status))
    .sort((a, b) => flagRank(a.status) - flagRank(b.status) || when(b.date_recorded) - when(a.date_recorded));
}

/**
 * Tests that are outside the range NOW (latest reading, shared rule) and
 * whose latest reading reached the chart after `since` (ms): what the
 * doctor's day calls "N results out of range" new since her last visit.
 * `arrivedAt` is when the reading arrived (its document's upload time).
 * A high value on an old report that a newer test supersedes is not
 * counted, so the day list agrees with the chart and the patient's Home.
 */
export function outsideRangeSince<T extends TestRowLike & { status?: string | null }>(
  rows: readonly T[],
  since: number,
  arrivedAt: (r: T) => number,
): T[] {
  return currentFlagged(rows).filter(r => {
    const at = arrivedAt(r);
    return Number.isFinite(at) && at > since;
  });
}
