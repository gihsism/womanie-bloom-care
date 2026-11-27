import { describe, it, expect } from 'vitest';
import { dailyRows, feedSummary, weeklySummary, weeklyLines, hoursMin, type StatEvent } from './babyStats';

const now = new Date(2026, 10, 10, 20, 0); // Tue 10 Nov 2026, 20:00 local
const at = (dayOffset: number, h: number, m = 0) => new Date(2026, 10, 10 + dayOffset, h, m).toISOString();
const feed = (iso: string, method: string, extra: Record<string, unknown> = {}, endMin?: number): StatEvent => ({
  occurred_at: iso,
  ended_at: endMin ? new Date(Date.parse(iso) + endMin * 60000).toISOString() : null,
  data: { method, ...extra },
});
const nappy = (iso: string, type: string): StatEvent => ({ occurred_at: iso, ended_at: null, data: { type } });

describe('dailyRows', () => {
  it('builds 7 days oldest first, ending Today', () => {
    const rows = dailyRows([], [], now);
    expect(rows).toHaveLength(7);
    expect(rows[6].label).toBe('Today');
    expect(rows[0].date).toBe('2026-11-04');
  });

  it('counts feeds, breast minutes and bottle ml per day', () => {
    const rows = dailyRows([
      feed(at(0, 8), 'breast_l', {}, 15),
      feed(at(0, 11), 'bottle', { ml: 90 }),
      feed(at(-1, 9), 'breast_r', {}, 20),
    ], [], now);
    expect(rows[6]).toMatchObject({ feeds: 2, breastMin: 15, bottleMl: 90 });
    expect(rows[5]).toMatchObject({ feeds: 1, breastMin: 20, bottleMl: 0 });
  });

  it('counts "both" nappies as wet and dirty, ignores days outside the window', () => {
    const rows = dailyRows([], [nappy(at(0, 7), 'wet'), nappy(at(0, 9), 'both'), nappy(at(0, 12), 'dirty'), nappy(at(-9, 9), 'wet')], now);
    expect(rows[6]).toMatchObject({ wet: 2, dirty: 2 });
    expect(rows.reduce((s, r) => s + r.wet, 0)).toBe(2);
  });
});

describe('feedSummary', () => {
  it('average gap and longest stretch over the last 24 hours', () => {
    const s = feedSummary([
      feed(at(0, 8), 'breast_l'), feed(at(0, 11), 'breast_r'), feed(at(0, 13), 'bottle', { ml: 60 }), feed(at(0, 19), 'breast_l'),
    ], now);
    expect(s.feeds24h).toBe(4);
    expect(s.avgGapMin).toBeCloseTo((180 + 120 + 360) / 3);
    expect(s.longestStretchMin).toBe(360);
  });

  it('ignores gaps over 12 hours (missed logging) and future entries', () => {
    const s = feedSummary([feed(at(-1, 6), 'breast_l'), feed(at(0, 19), 'breast_l'), feed(at(0, 23), 'bottle')], now);
    expect(s.longestStretchMin).toBeNull();
    expect(s.feeds24h).toBe(1);
  });

  it('side split, bottle total and average feeds per logged day', () => {
    const s = feedSummary([
      feed(at(0, 8), 'breast_l'), feed(at(0, 10), 'breast_l'), feed(at(0, 12), 'breast_r'),
      feed(at(-2, 9), 'bottle', { ml: 120 }),
    ], now);
    expect([s.left, s.right, s.bottle]).toEqual([2, 1, 1]);
    expect(s.bottleMlWindow).toBe(120);
    expect(s.avgFeedsPerDay).toBe(2); // 4 feeds over 2 logged days
  });

  it('empty log gives nulls, not zeros pretending to be data', () => {
    const s = feedSummary([], now);
    expect(s.avgGapMin).toBeNull();
    expect(s.avgFeedsPerDay).toBeNull();
  });
});

const sleep = (iso: string, min: number | null): StatEvent => ({
  occurred_at: iso,
  ended_at: min == null ? null : new Date(Date.parse(iso) + min * 60000).toISOString(),
  data: {},
});

describe('weeklySummary', () => {
  it('covers the 7 complete days before today, oldest first; today is left out', () => {
    const s = weeklySummary([feed(at(0, 8), 'bottle', { ml: 90 })], [], [], now);
    expect(s.days).toHaveLength(7);
    expect(s.days[0].date).toBe('2026-11-03');
    expect(s.days[6].date).toBe('2026-11-09');
    expect(s.totals.feeds).toBe(0);
    expect(s.feedsPerDay).toBeNull();
  });

  it('averages over the days that have entries of that kind', () => {
    const s = weeklySummary(
      [feed(at(-1, 8), 'breast_l'), feed(at(-1, 11), 'bottle', { ml: 60 }), feed(at(-1, 14), 'breast_r'), feed(at(-2, 9), 'breast_l')],
      [nappy(at(-1, 9), 'wet'), nappy(at(-1, 10), 'both'), nappy(at(-3, 10), 'dirty')],
      [],
      now,
    );
    expect(s.feedDays).toBe(2);
    expect(s.feedsPerDay).toBe(2);
    expect(s.totals.bottleMl).toBe(60);
    expect(s.nappyDays).toBe(2);
    expect(s.wetPerDay).toBe(1);
    expect(s.dirtyPerDay).toBe(1);
    expect(s.sleepMinPerDay).toBeNull();
    expect(weeklyLines(s)).toEqual([
      'Feeds: 2 a day (2 of 7 days logged). Bottle: 60 ml in total.',
      'Nappies: 1 wet and 1 dirty a day (2 of 7 days logged).',
      'Sleep: none logged.',
    ]);
  });

  it('splits a sleep over midnight and skips running or never-stopped sleeps', () => {
    const s = weeklySummary([], [], [
      sleep(at(-2, 23), 120), // 60 min on day -2, 60 on day -1
      sleep(at(-1, 13), 90),
      sleep(at(-1, 15), null), // still running
      sleep(at(-3, 1), 17 * 60), // never stopped
    ], now);
    const d1 = s.days.find(d => d.date === '2026-11-09')!;
    const d2 = s.days.find(d => d.date === '2026-11-08')!;
    expect(d2.sleepMin).toBe(60);
    expect(d1.sleepMin).toBe(150);
    expect(d2.sleeps).toBe(1);
    expect(d1.sleeps).toBe(1);
    expect(s.days.find(d => d.date === '2026-11-07')!.sleepMin).toBe(0);
    expect(s.sleepDays).toBe(2);
    expect(hoursMin(s.sleepMinPerDay)).toBe('1h 45m');
    expect(weeklyLines(s)[2]).toBe('Sleep: 1h 45m a day (2 of 7 days logged).');
  });

  it('says plainly when nothing is logged', () => {
    expect(weeklyLines(weeklySummary([], [], [], now))).toEqual(['Feeds: none logged.', 'Nappies: none logged.', 'Sleep: none logged.']);
  });
});
