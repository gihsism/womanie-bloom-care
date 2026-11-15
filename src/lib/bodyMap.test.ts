import { describe, it, expect } from 'vitest';
import { parseRange, pickFlaggedLab, medsToday, kicksToday, weekWord, fmtGrams } from './bodyMap';

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
