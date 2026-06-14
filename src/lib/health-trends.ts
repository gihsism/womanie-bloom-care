// Pure cross-document lab-trend logic, split out of the HealthTrends
// dashboard card so it can be unit-tested without pulling in React (and
// so the component file only exports a component — keeps react-refresh
// happy). For any test that appears in two or more documents with a
// parseable numeric value and date, computeTrends pairs the most recent
// reading with the previous one and describes the change.

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

export function parseNumeric(raw: string | null): number | null {
  if (raw == null) return null;
  const match = String(raw).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = parseFloat(match[0]);
  return Number.isFinite(n) ? n : null;
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
    const list = byTitle.get(r.title) ?? [];
    list.push(r);
    byTitle.set(r.title, list);
  }

  const trends: TrendRow[] = [];
  for (const [title, list] of byTitle) {
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

    trends.push({
      title,
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
    });
  }

  // Rank: status shifts first (improved/worsened both interesting),
  // then larger absolute % changes, then recency of the latest reading.
  trends.sort((a, b) => {
    const aShift = a.statusShift === 'same' ? 1 : 0;
    const bShift = b.statusShift === 'same' ? 1 : 0;
    if (aShift !== bShift) return aShift - bShift;
    const absDelta = Math.abs(b.pctChange) - Math.abs(a.pctChange);
    if (Math.abs(absDelta) > 1) return absDelta;
    return Date.parse(b.latestDate) - Date.parse(a.latestDate);
  });

  return trends;
}
