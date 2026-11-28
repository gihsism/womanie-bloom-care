// The one-line results summary on Records' Health Overview card:
// "3 of 24 latest results outside the lab's range · 2 moved in or out of
// range since the previous test". Facts only, no score: it replaced a
// "wellness %" (share of results marked normal) that had no clinical basis.
//
// Same rules as every other screen (lab-flags): only the latest reading of
// each test counts, "outside" = the lab marked it abnormal / critical (or
// high / low ...), borderline is not outside. Pure.

import { isOutsideRange, labFlag, latestPerTest, testKey, type TestRowLike } from './labFlags';

export interface SummaryRow extends TestRowLike {
  status: string | null;
}

export interface ResultsSummary {
  /** Tests with a latest reading. */
  total: number;
  /** Latest readings outside the lab's range (urgent included). */
  outside: number;
  /** Of those, marked urgent (critical) by the lab. */
  urgent: number;
  /** Tests whose latest reading moved into or out of the lab's range
   *  compared with the reading before it (an earlier day). */
  changed: number;
}

const IN = new Set(['normal', 'expected']);
const side = (status: string | null | undefined): 'in' | 'out' | null => {
  const s = String(status ?? '').trim().toLowerCase();
  if (isOutsideRange(s)) return 'out';
  if (IN.has(s)) return 'in';
  return null; // borderline, informational, unknown: not a crossing either way
};
const day = (d: string | null | undefined) => (d ? /^(\d{4}-\d{2}-\d{2})/.exec(d)?.[1] ?? null : null);

export function summarizeResults(rows: readonly SummaryRow[]): ResultsSummary {
  const latest = latestPerTest(rows);
  const outside = latest.filter(r => isOutsideRange(r.status)).length;
  const urgent = latest.filter(r => labFlag(r.status) === 'urgent').length;

  const byTest = new Map<string, SummaryRow[]>();
  for (const r of rows) {
    if (!day(r.date_recorded)) continue;
    const k = testKey(r);
    byTest.set(k, [...(byTest.get(k) ?? []), r]);
  }
  let changed = 0;
  for (const r of latest) {
    const now = day(r.date_recorded);
    if (!now) continue;
    const before = (byTest.get(testKey(r)) ?? [])
      .filter(x => (day(x.date_recorded) as string) < now)
      .sort((a, b) => (day(b.date_recorded) as string).localeCompare(day(a.date_recorded) as string))[0];
    if (!before) continue;
    const a = side(before.status);
    const b = side(r.status);
    if (a && b && a !== b) changed++;
  }
  return { total: latest.length, outside, urgent, changed };
}

/** "3 of 24 latest results outside the lab's range (1 marked urgent)" */
export function summaryHeadline(s: ResultsSummary): string {
  if (s.outside === 0) {
    return s.total === 1 ? 'Your latest result is within the lab\'s range' : `All ${s.total} latest results within the lab's range`;
  }
  return `${s.outside} of ${s.total} latest result${s.total === 1 ? '' : 's'} outside the lab's range${s.urgent > 0 ? ` (${s.urgent} marked urgent)` : ''}`;
}

/** "2 moved in or out of range since the previous test", or null. */
export function summaryChanges(s: ResultsSummary): string | null {
  if (s.changed === 0) return null;
  return `${s.changed} moved in or out of range since the previous test`;
}
