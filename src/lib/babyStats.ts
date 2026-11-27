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

// ---------------------------------------------------------------- weekly summary
// "Last 7 days" for the paediatrician visit: the 7 COMPLETE days before
// today (a half-logged today would pull the averages down). Neutral
// numbers only - counts, totals and averages, no "enough" / "normal".
// Averages are over the days that have entries of that kind, so a day she
// did not log is not read as a day with no feeds or no sleep.

export interface WeekDay {
  date: string; // yyyy-mm-dd (local)
  day: Date; // local midnight
  feeds: number;
  bottleMl: number;
  wet: number;
  dirty: number;
  /** Minutes asleep that fall on this calendar day (a sleep over midnight is split). */
  sleepMin: number;
  /** Sleeps that started on this day. */
  sleeps: number;
}

export interface WeeklySummary {
  from: Date;
  to: Date;
  days: WeekDay[]; // oldest first
  feedDays: number;
  nappyDays: number;
  sleepDays: number;
  feedsPerDay: number | null;
  wetPerDay: number | null;
  dirtyPerDay: number | null;
  sleepMinPerDay: number | null;
  totals: { feeds: number; bottleMl: number; wet: number; dirty: number; sleepMin: number };
}

export const MAX_SLEEP_MIN = 16 * 60; // longer = a sleep that was never stopped

export function weeklySummary(feeds: StatEvent[], nappies: StatEvent[], sleeps: StatEvent[], now: Date, n = 7): WeeklySummary {
  const days: WeekDay[] = [];
  const index = new Map<string, WeekDay>();
  for (let i = n; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const row: WeekDay = { date: localDate(d), day: d, feeds: 0, bottleMl: 0, wet: 0, dirty: 0, sleepMin: 0, sleeps: 0 };
    days.push(row);
    index.set(row.date, row);
  }
  for (const f of feeds) {
    const row = index.get(localDate(new Date(f.occurred_at)));
    if (!row) continue;
    row.feeds += 1;
    const ml = Number(f.data?.ml);
    if (Number.isFinite(ml) && ml > 0) row.bottleMl += ml;
  }
  for (const x of nappies) {
    const row = index.get(localDate(new Date(x.occurred_at)));
    if (!row) continue;
    const t = x.data?.type;
    if (t === 'wet' || t === 'both') row.wet += 1;
    if (t === 'dirty' || t === 'both') row.dirty += 1;
  }
  for (const s of sleeps) {
    if (!s.ended_at) continue;
    const a = Date.parse(s.occurred_at);
    const b = Date.parse(s.ended_at);
    if (!(b > a) || (b - a) / 60000 > MAX_SLEEP_MIN) continue;
    const startRow = index.get(localDate(new Date(a)));
    if (startRow) startRow.sleeps += 1;
    // Split the sleep over the calendar days it covers.
    let cur = a;
    while (cur < b) {
      const c = new Date(cur);
      const nextMidnight = new Date(c.getFullYear(), c.getMonth(), c.getDate() + 1).getTime();
      const end = Math.min(b, nextMidnight);
      const row = index.get(localDate(c));
      if (row) row.sleepMin += (end - cur) / 60000;
      cur = end;
    }
  }
  for (const d of days) d.sleepMin = Math.round(d.sleepMin);
  const sum = (k: 'feeds' | 'bottleMl' | 'wet' | 'dirty' | 'sleepMin') => days.reduce((t, d) => t + d[k], 0);
  const totals = { feeds: sum('feeds'), bottleMl: sum('bottleMl'), wet: sum('wet'), dirty: sum('dirty'), sleepMin: sum('sleepMin') };
  const feedDays = days.filter(d => d.feeds > 0).length;
  const nappyDays = days.filter(d => d.wet + d.dirty > 0).length;
  const sleepDays = days.filter(d => d.sleepMin > 0).length;
  const avg = (total: number, over: number) => (over ? total / over : null);
  return {
    from: days[0].day,
    to: days[days.length - 1].day,
    days,
    feedDays, nappyDays, sleepDays,
    feedsPerDay: avg(totals.feeds, feedDays),
    wetPerDay: avg(totals.wet, nappyDays),
    dirtyPerDay: avg(totals.dirty, nappyDays),
    sleepMinPerDay: avg(totals.sleepMin, sleepDays),
    totals,
  };
}

/** "14h 20m" / "45m" / "—". */
export function hoursMin(m: number | null): string {
  if (m == null) return '—';
  const r = Math.round(m);
  const h = Math.floor(r / 60);
  const min = r % 60;
  return h === 0 ? `${min}m` : min === 0 ? `${h}h` : `${h}h ${min}m`;
}

const oneDecimal = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, '');

/** One neutral line per kind: the average a day and how many days it rests on. */
export function weeklyLines(s: WeeklySummary): string[] {
  const n = s.days.length;
  const based = (k: number) => `(${k} of ${n} days logged)`;
  return [
    s.feedsPerDay == null
      ? 'Feeds: none logged.'
      : `Feeds: ${oneDecimal(s.feedsPerDay)} a day ${based(s.feedDays)}.${s.totals.bottleMl ? ` Bottle: ${s.totals.bottleMl} ml in total.` : ''}`,
    s.wetPerDay == null || s.dirtyPerDay == null
      ? 'Nappies: none logged.'
      : `Nappies: ${oneDecimal(s.wetPerDay)} wet and ${oneDecimal(s.dirtyPerDay)} dirty a day ${based(s.nappyDays)}.`,
    s.sleepMinPerDay == null
      ? 'Sleep: none logged.'
      : `Sleep: ${hoursMin(s.sleepMinPerDay)} a day ${based(s.sleepDays)}.`,
  ];
}
