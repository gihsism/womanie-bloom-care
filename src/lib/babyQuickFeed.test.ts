import { describe, it, expect } from 'vitest';
import { quickFeedFrom, quickFeedLabel, quickFeedEvent, readActiveTimer, feedDetail, fmtClock, FEED_ACTIVE_KEY, SLEEP_ACTIVE_KEY } from './babyQuickFeed';

const store = (o: Record<string, string>) => ({ getItem: (k: string) => o[k] ?? null });

describe('quick feed (Feed tab and Home card)', () => {
  it('repeats the last bottle, or offers the other breast for as long as last time', () => {
    const bottle = quickFeedFrom({ occurred_at: '2026-11-28T08:00:00Z', data: { method: 'bottle', ml: 90, milk: 'formula' } });
    expect(bottle).toEqual({ method: 'bottle', minutes: 0, ml: 90, milk: 'formula' });
    expect(quickFeedLabel(bottle!)).toBe('Bottle · 90 ml · formula');
    const breast = quickFeedFrom({ occurred_at: '2026-11-28T08:00:00Z', ended_at: '2026-11-28T08:12:40Z', data: { method: 'breast_l' } });
    expect(breast).toEqual({ method: 'breast_r', minutes: 12, ml: null, milk: null });
    expect(quickFeedLabel(breast!)).toBe('Right breast · 12 min');
    // No length (or an implausible one): 15 minutes.
    expect(quickFeedFrom({ occurred_at: '2026-11-28T08:00:00Z', data: { method: 'breast_r' } })?.minutes).toBe(15);
    expect(quickFeedFrom(undefined)).toBeNull();
    expect(quickFeedFrom({ occurred_at: '2026-11-28T08:00:00Z', data: { method: 'spoon' } })).toBeNull();
  });

  it('saves a bottle as given now and a breastfeed as just finished', () => {
    const now = Date.parse('2026-11-28T10:00:00Z');
    expect(quickFeedEvent({ method: 'bottle', minutes: 0, ml: 90, milk: null }, now))
      .toEqual({ occurred_at: '2026-11-28T10:00:00.000Z', data: { method: 'bottle', ml: 90, milk: null } });
    expect(quickFeedEvent({ method: 'breast_l', minutes: 12, ml: null, milk: null }, now))
      .toEqual({ occurred_at: '2026-11-28T09:48:00.000Z', ended_at: '2026-11-28T10:00:00.000Z', data: { method: 'breast_l' } });
  });

  it('last-feed detail and clock', () => {
    expect(feedDetail('bottle', 90, null)).toBe('bottle 90 ml');
    expect(feedDetail('bottle', null, null)).toBe('bottle');
    expect(feedDetail('breast_l', null, 15)).toBe('left side, 15 min');
    expect(feedDetail('breast_r', null, null)).toBe('right side');
    expect(fmtClock(247_000)).toBe('4:07');
    expect(fmtClock(3_725_000)).toBe('1:02:05');
  });

  it('reads the running feed or sleep timer kept on the device', () => {
    expect(readActiveTimer('b1', store({}))).toBeNull();
    expect(readActiveTimer('b1', store({ [FEED_ACTIVE_KEY('b1')]: JSON.stringify({ side: 'breast_l', start: 1000 }) })))
      .toEqual({ kind: 'feed', side: 'breast_l', start: 1000 });
    expect(readActiveTimer('b1', store({ [SLEEP_ACTIVE_KEY('b1')]: '2000' }))).toEqual({ kind: 'sleep', start: 2000 });
    // Another baby's timer, or a broken value, is not hers.
    expect(readActiveTimer('b1', store({ [SLEEP_ACTIVE_KEY('b2')]: '2000' }))).toBeNull();
    expect(readActiveTimer('b1', store({ [FEED_ACTIVE_KEY('b1')]: '{oops' }))).toBeNull();
    expect(readActiveTimer('b1', null)).toBeNull();
  });
});
