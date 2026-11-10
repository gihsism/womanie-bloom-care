import { describe, it, expect } from 'vitest';
import { dailyRows, feedSummary, type StatEvent } from './babyStats';

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
