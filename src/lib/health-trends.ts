// Pure cross-document lab-trend logic, split out of the HealthTrends
// dashboard card so it can be unit-tested without pulling in React (and
// so the component file only exports a component — keeps react-refresh
// happy). For any test that appears in two or more documents with a
// parseable numeric value and date, computeTrends pairs the most recent
// reading with the previous one and describes the change. When the last
// three or more readings all moved the same way, detectRun adds that run
// with its dates ("gone down at each of your last 3 tests").

import { labNumber, type LabParseContext } from './labValue';
import { normLabUnit, normTestTitle } from './labFlags';
export interface ExtractedItem {
  title: string;
  value: string | null;
  unit: string | null;
  status: string | null;
  data_type: string;
  date_recorded: string | null;
  document_id: string | null;
}

export interface TrendRow {
  title: string;
  unit: string | null;
  latestValue: number;
  latestRawValue: string;
  latestStatus: string | null;
  latestDate: string;
  latestDocumentId: string | null;
  prevValue: number;
  prevRawValue: string;
  prevStatus: string | null;
  prevDate: string;
  count: number;
  direction: 'up' | 'down' | 'flat';
  pctChange: number;
  statusShift: 'improved' | 'worsened' | 'same';
  /** Set when the last 3+ readings (same unit, different days) all moved the same way. */
  run?: TrendRun;
}

export interface RunPoint {
  value: number;
  raw: string;
  /** YYYY-MM-DD */
  date: string;
}

export interface TrendRun {
  direction: 'rising' | 'falling';
  /** Oldest first, ending with the latest reading. */
  points: RunPoint[];
}

export const MIN_RUN = 3;
export const MAX_RUN_POINTS = 6;

// Test matching shared with the "outside the range" rule (labFlags):
// same unit written two ways counts as one; "Ferritin" and "ferritin "
// from two labs are one test.
const normUnit = normLabUnit;
const normTitle = normTestTitle;

/**
 * Readings newest first -> the run that ends at the newest reading, when
 * each step moved the same way by at least FLAT_THRESHOLD_PCT. Only
 * readings in the newest reading's unit count, one per calendar day
 * (the first listed). Returns null under MIN_RUN points.
 */
export function detectRun(
  newestFirst: Array<{ value: number; raw: string; date: string; unit: string | null }>,
): TrendRun | null {
  if (newestFirst.length < MIN_RUN) return null;
  const unit = normUnit(newestFirst[0].unit);
  const seen = new Set<string>();
  const pts: RunPoint[] = [];
  for (const r of newestFirst) {
    const day = r.date.slice(0, 10);
    if (normUnit(r.unit) !== unit || seen.has(day)) continue;
    seen.add(day);
    pts.push({ value: r.value, raw: r.raw, date: day });
  }
  const step = (newer: RunPoint, older: RunPoint): 'rising' | 'falling' | null => {
    const diff = newer.value - older.value;
    if (diff === 0) return null;
    if (older.value !== 0 && Math.abs(diff / older.value) * 100 < FLAT_THRESHOLD_PCT) return null;
    return diff > 0 ? 'rising' : 'falling';
  };
  if (pts.length < MIN_RUN) return null;
  const direction = step(pts[0], pts[1]);
  if (!direction) return null;
  let len = 2;
  while (len < pts.length && len < MAX_RUN_POINTS && step(pts[len - 1], pts[len]) === direction) len++;
  if (len < MIN_RUN) return null;
  return { direction, points: pts.slice(0, len).reverse() };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-03-12" -> "12 Mar 2026", read as a calendar day (no time-zone shift). */
export function formatLabDay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/**
 * Plain sentence for a run, e.g. "Gone down at each of your last 3 tests:
 * 45 (12 Mar 2026) → 30 (5 Jun 2026) → 18 ng/mL (2 Sep 2026)". States the
 * readings only; says nothing about whether the change is good or bad.
 */
export function describeRun(run: TrendRun, unit: string | null): string {
  const u = unit?.trim() ? ` ${unit.trim()}` : '';
  const verb = run.direction === 'rising' ? 'Gone up' : 'Gone down';
  const chain = run.points
    .map((p, i) => `${p.raw}${i === run.points.length - 1 ? u : ''} (${formatLabDay(p.date)})`)
    .join(' → ');
  return `${verb} at each of your last ${run.points.length} tests: ${chain}`;
}

export const FLAT_THRESHOLD_PCT = 2; // under ±2% we treat as flat

// Lower number = healthier, so a drop in severity is an improvement.
export const SEVERITY: Record<string, number> = {
  critical: 3,
  abnormal: 2,
  normal: 1,
  expected: 1,
  informational: 0,
};

// Shared lab parser: "3,4" is 3.4 and "1'250" is 1250 (the old regex read
// "3,4" as 3).
export function parseNumeric(raw: string | null, ctx?: LabParseContext): number | null {
  return labNumber(raw, ctx);
}

export function statusShift(prev: string | null, next: string | null): TrendRow['statusShift'] {
  const p = SEVERITY[prev ?? 'informational'] ?? 0;
  const n = SEVERITY[next ?? 'informational'] ?? 0;
  if (n < p) return 'improved';
  if (n > p) return 'worsened';
  return 'same';
}

export function computeTrends(rows: ExtractedItem[]): TrendRow[] {
  const labs = rows.filter(r =>
    r.data_type === 'lab_result' && r.title && r.value && r.date_recorded
  );

  const byTitle = new Map<string, ExtractedItem[]>();
  for (const r of labs) {
    const key = normTitle(r.title);
    const list = byTitle.get(key) ?? [];
    list.push(r);
    byTitle.set(key, list);
  }

  const trends: TrendRow[] = [];
  for (const list of byTitle.values()) {
    // Drop anything we can't parse; sort newest-first.
    const parsed = list
      .map(r => ({
        item: r,
        n: parseNumeric(r.value),
        t: r.date_recorded ? Date.parse(r.date_recorded) : NaN,
      }))
      .filter(x => x.n != null && Number.isFinite(x.t))
      .sort((a, b) => b.t - a.t);
    if (parsed.length < 2) continue;

    const latest = parsed[0];
    const prev = parsed[1];
    const latestValue = latest.n as number;
    const prevValue = prev.n as number;
    const pctChange = prevValue === 0
      ? 0
      : ((latestValue - prevValue) / Math.abs(prevValue)) * 100;

    let direction: TrendRow['direction'];
    if (Math.abs(pctChange) < FLAT_THRESHOLD_PCT) direction = 'flat';
    else direction = latestValue > prevValue ? 'up' : 'down';

    const run = detectRun(parsed.map(x => ({
      value: x.n as number,
      raw: String(x.item.value).trim(),
      date: x.item.date_recorded as string,
      unit: x.item.unit,
    })));

    trends.push({
      title: latest.item.title.trim(),
      unit: latest.item.unit,
      latestValue,
      latestRawValue: String(latest.item.value),
      latestStatus: latest.item.status,
      latestDate: latest.item.date_recorded as string,
      latestDocumentId: latest.item.document_id,
      prevValue,
      prevRawValue: String(prev.item.value),
      prevStatus: prev.item.status,
      prevDate: prev.item.date_recorded as string,
      count: parsed.length,
      direction,
      pctChange,
      statusShift: statusShift(prev.item.status, latest.item.status),
      ...(run ? { run } : {}),
    });
  }

  // Rank: status shifts first (improved/worsened both interesting), then
  // a steady rise or fall over 3+ tests, then larger absolute % changes,
  // then recency of the latest reading.
  trends.sort((a, b) => {
    const aShift = a.statusShift === 'same' ? 1 : 0;
    const bShift = b.statusShift === 'same' ? 1 : 0;
    if (aShift !== bShift) return aShift - bShift;
    const aRun = a.run ? 0 : 1;
    const bRun = b.run ? 0 : 1;
    if (aRun !== bRun) return aRun - bRun;
    const absDelta = Math.abs(b.pctChange) - Math.abs(a.pctChange);
    if (Math.abs(absDelta) > 1) return absDelta;
    return Date.parse(b.latestDate) - Date.parse(a.latestDate);
  });

  return trends;
}
