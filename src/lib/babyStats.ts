// Pure statistics for the baby tracker Stats tab (feeds + nappies).
// Inputs are life_events rows; all maths here so it can be unit-tested.

export interface StatEvent {
  occurred_at: string; // ISO
  ended_at: string | null;
  data: Record<string, unknown> | null;
}

export interface DayRow {
  date: string; // yyyy-mm-dd (local)
  label: string; // e.g. "Mon"
  feeds: number;
  breastMin: number;
  bottleMl: number;
  wet: number;
  dirty: number;
}

export interface FeedSummary {
  feeds24h: number;
  avgGapMin: number | null; // start-to-start, last 24h
  longestStretchMin: number | null; // longest gap between feeds, last 24h
  avgFeedsPerDay: number | null; // over days in the window that have any feed
  left: number; // breast-side counts in the window
  right: number;
  bottle: number;
  bottleMlWindow: number;
}

const localDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_GAP_MIN = 12 * 60; // ignore gaps that are clearly missed logging

/** One row per day for the last `days` days (oldest first), ending today. */
export function dailyRows(feeds: StatEvent[], nappies: StatEvent[], now: Date, days = 7): DayRow[] {
  const rows: DayRow[] = [];
  const index = new Map<string, DayRow>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const row: DayRow = { date: localDate(d), label: i === 0 ? 'Today' : DOW[d.getDay()], feeds: 0, breastMin: 0, bottleMl: 0, wet: 0, dirty: 0 };
    rows.push(row);
    index.set(row.date, row);
  }
  for (const f of feeds) {
    const row = index.get(localDate(new Date(f.occurred_at)));
    if (!row) continue;
    row.feeds += 1;
    const ml = Number(f.data?.ml);
    if (Number.isFinite(ml) && ml > 0) row.bottleMl += ml;
    if (f.data?.method !== 'bottle' && f.ended_at) {
      const min = (Date.parse(f.ended_at) - Date.parse(f.occurred_at)) / 60000;
      if (min > 0 && min < 180) row.breastMin += Math.round(min);
    }
  }
  for (const n of nappies) {
    const row = index.get(localDate(new Date(n.occurred_at)));
    if (!row) continue;
    const t = n.data?.type;
    if (t === 'wet' || t === 'both') row.wet += 1;
    if (t === 'dirty' || t === 'both') row.dirty += 1;
  }
  return rows;
}

export function feedSummary(feeds: StatEvent[], now: Date, days = 7): FeedSummary {
  const nowMs = now.getTime();
  const dayAgo = nowMs - 24 * 3600_000;
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime();
  const starts = feeds.map(f => Date.parse(f.occurred_at)).filter(t => t <= nowMs).sort((a, b) => a - b);
  const last24 = starts.filter(t => t >= dayAgo);

  const gaps: number[] = [];
  for (let i = 1; i < last24.length; i++) {
    const g = (last24[i] - last24[i - 1]) / 60000;
    if (g > 0 && g <= MAX_GAP_MIN) gaps.push(g);
  }
  const inWindow = feeds.filter(f => Date.parse(f.occurred_at) >= windowStart && Date.parse(f.occurred_at) <= nowMs);
  const perDay = new Map<string, number>();
  for (const f of inWindow) {
    const k = localDate(new Date(f.occurred_at));
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const count = (m: string) => inWindow.filter(f => f.data?.method === m).length;
  return {
    feeds24h: last24.length,
    avgGapMin: gaps.length ? gaps.reduce((s, v) => s + v, 0) / gaps.length : null,
    longestStretchMin: gaps.length ? Math.max(...gaps) : null,
    avgFeedsPerDay: perDay.size ? inWindow.length / perDay.size : null,
    left: count('breast_l'),
    right: count('breast_r'),
    bottle: count('bottle'),
    bottleMlWindow: inWindow.reduce((s, f) => s + (Number(f.data?.ml) > 0 ? Number(f.data?.ml) : 0), 0),
  };
}
