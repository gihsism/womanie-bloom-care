import { describe, it, expect } from 'vitest';
import { parseRange, pickFlaggedLab, medsToday, kicksToday, weekWord, fmtGrams, lastFeed, nappiesToday, sleepTodayMin, fmtAgo, dayOfLife, countToday } from './bodyMap';

const now = new Date(2026, 10, 15, 14, 0);
const at = (h: number, dayOffset = 0) => new Date(2026, 10, 15 + dayOffset, h, 0).toISOString();

describe('parseRange', () => {
  it('reads common reference range shapes', () => {
    expect(parseRange('15-150')).toEqual({ low: 15, high: 150 });
    expect(parseRange('11.0 – 15.0 g/dL')).toEqual({ low: 11, high: 15 });
    expect(parseRange('0,3 - 3,0')).toEqual({ low: 0.3, high: 3 });
    expect(parseRange('<5')).toEqual({ low: null, high: 5 });
    expect(parseRange('> 30')).toEqual({ low: 30, high: null });
    expect(parseRange('negative')).toBeNull();
    expect(parseRange(null)).toBeNull();
  });
});

describe('pickFlaggedLab', () => {
  const lab = (title: string, value: string | number | null, status: string | null, range = '15-150') =>
    ({ title, value, unit: 'ng/mL', reference_range: range, status });

  it('returns null when everything is normal', () => {
    expect(pickFlaggedLab([lab('Ferritin', 40, 'normal')])).toBeNull();
  });

  it('prefers critical over abnormal and works out the direction', () => {
    const r = pickFlaggedLab([lab('TSH', 4.2, 'abnormal', '0.3-3.0'), lab('Ferritin', 14, 'critical')]);
    expect(r).toMatchObject({ title: 'Ferritin', value: '14', direction: 'low', critical: true });
    expect(pickFlaggedLab([lab('TSH', 4.2, 'abnormal', '0.3-3.0')])?.direction).toBe('high');
  });

  it('falls back to "out" when the range cannot be read, and skips empty values', () => {
    expect(pickFlaggedLab([lab('Urine', 'positive', 'abnormal', 'negative')])?.direction).toBe('out');
    expect(pickFlaggedLab([lab('X', null, 'critical')])).toBeNull();
  });
});

describe('medsToday', () => {
  const meds = [{ id: 'a', name: 'Iron' }, { id: 'b', name: 'Folic acid' }];
  it('counts distinct medicines taken today and the latest dose', () => {
    const s = medsToday(meds, [
      { occurred_at: at(8), data: { medication_id: 'a' } },
      { occurred_at: at(9), data: { medication_id: 'a' } },
      { occurred_at: at(8, -1), data: { medication_id: 'b' } },
    ], now);
    expect(s).toMatchObject({ total: 2, takenToday: 1, lastName: 'Iron' });
    expect(s.lastAt).toBe(at(9));
  });
  it('ignores doses of deleted medicines in the count', () => {
    expect(medsToday(meds, [{ occurred_at: at(8), data: { medication_id: 'zzz', name: 'Old' } }], now).takenToday).toBe(0);
  });
});

describe('kicksToday', () => {
  it('returns the latest session today with its length', () => {
    const r = kicksToday([
      { occurred_at: at(9), ended_at: new Date(Date.parse(at(9)) + 40 * 60000).toISOString(), data: { count: 10 } },
      { occurred_at: at(12), ended_at: null, data: { count: 6 } },
      { occurred_at: at(20, -1), ended_at: null, data: { count: 10 } },
    ], now);
    expect(r).toEqual({ count: 6, minutes: null });
  });
  it('null when nothing today', () => {
    expect(kicksToday([{ occurred_at: at(9, -1), data: { count: 10 } }], now)).toBeNull();
  });
});

describe('weekWord / fmtGrams', () => {
  it('spells weeks', () => {
    expect(weekWord(30)).toBe('thirty');
    expect(weekWord(27)).toBe('twenty-seven');
    expect(weekWord(8)).toBe('eight');
    expect(weekWord(40)).toBe('forty');
  });
  it('formats grams', () => {
    expect(fmtGrams(780)).toEqual({ value: '780', unit: 'g' });
    expect(fmtGrams(1559)).toEqual({ value: '1.6', unit: 'kg' });
  });
});


describe('baby body map helpers', () => {
  const ev = (h: number, data: Record<string, unknown>, endMin?: number, dayOffset = 0) => {
    const iso = new Date(2026, 10, 15 + dayOffset, h, 0).toISOString();
    return { occurred_at: iso, ended_at: endMin ? new Date(Date.parse(iso) + endMin * 60000).toISOString() : null, data };
  };
  it('last feed: time ago, duration and the other side next', () => {
    const r = lastFeed([ev(9, { method: 'breast_r' }, 10), ev(12, { method: 'breast_l' }, 14)], now);
    expect(r).toMatchObject({ minutesAgo: 120, method: 'breast_l', durationMin: 14, nextSide: 'right' });
    expect(lastFeed([ev(13, { method: 'bottle', ml: 90 })], now)).toMatchObject({ ml: 90, nextSide: null });
    expect(lastFeed([], now)).toBeNull();
  });
  it('counts today only', () => {
    expect(countToday([ev(8, {}), ev(9, {}), ev(9, {}, undefined, -1)], now)).toBe(2);
    expect(nappiesToday([ev(8, { type: 'both' }), ev(9, { type: 'wet' }), ev(9, { type: 'dirty' }, undefined, -1)], now)).toEqual({ wet: 2, dirty: 1 });
  });
  it('sleep today sums finished sleeps', () => {
    expect(sleepTodayMin([ev(1, {}, 90), ev(10, {}, 30), ev(12, {})], now)).toBe(120);
  });
  it('formats and counts days of life', () => {
    expect(fmtAgo(42)).toEqual({ value: '42', unit: 'min' });
    expect(fmtAgo(80)).toEqual({ value: '1h 20', unit: '' });
    expect(fmtAgo(120)).toEqual({ value: '2h', unit: '' });
    expect(dayOfLife('2026-11-04', now)).toBe(12);
    expect(dayOfLife(null, now)).toBeNull();
  });
});
