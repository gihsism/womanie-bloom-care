import { describe, it, expect } from 'vitest';
import { parseRange, pickFlaggedLab, medsToday, kicksToday, weekWord, fmtGrams, lastFeed, nappiesToday, sleepTodayMin, fmtAgo, dayOfLife, postMenopauseBleed, countToday, cycleDial, pillRing, pillFromNotes, hotFlushes, monthsSince } from './bodyMap';

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
    expect(fmtAgo(23 * 60 + 59)).toEqual({ value: '23h 59', unit: '' });
    expect(fmtAgo(24 * 60 + 5)).toEqual({ value: '1', unit: 'day' });
    expect(fmtAgo(217 * 60 + 25)).toEqual({ value: '9', unit: 'days' });
    expect(dayOfLife('2026-11-04', now)).toBe(12);
    expect(dayOfLife(null, now)).toBeNull();
  });
});

describe('cycleDial', () => {
  const start = new Date(2026, 10, 4); // day 1
  it('day, phase and next period in a 28-day cycle', () => {
    const d = cycleDial(start, 28, new Date(2026, 10, 15, 9));
    expect(d).toMatchObject({ day: 12, length: 28, ovulationDay: 14, fertileStart: 9, fertileEnd: 15, phase: 'fertile', daysToPeriod: 17, daysToFertile: 0 });
    expect(d.nextPeriod.getDate()).toBe(2); // 2 Dec
  });
  it('wraps into the next cycle when the period was not logged', () => {
    const d = cycleDial(start, 28, new Date(2026, 11, 3));
    expect(d.day).toBe(2);
    expect(d.phase).toBe('period');
  });
  it('follicular counts down to the fertile window; late cycle is pms', () => {
    expect(cycleDial(start, 28, new Date(2026, 10, 10))).toMatchObject({ day: 7, phase: 'follicular', daysToFertile: 2 });
    expect(cycleDial(start, 28, new Date(2026, 10, 29))).toMatchObject({ day: 26, phase: 'pms', daysToFertile: null });
  });
});

describe('pillRing', () => {
  const now2 = new Date(2026, 10, 15, 20);
  const m = new Map<string, 'taken' | 'late' | 'missed'>([
    ['2026-11-15', 'taken'], ['2026-11-14', 'late'], ['2026-11-13', 'taken'], ['2026-11-12', 'missed'], ['2026-11-11', 'taken'],
  ]);
  it('reads notes', () => {
    expect(pillFromNotes('Mood: ok; Pill: on-time')).toBe('taken');
    expect(pillFromNotes('Pill: Missed')).toBe('missed');
    expect(pillFromNotes(null)).toBeNull();
  });
  it('aligns to the pack and marks the break week', () => {
    const r = pillRing(m, '2026-11-04', now2);
    expect(r.packDay).toBe(12);
    expect(r.pills[11]).toMatchObject({ date: '2026-11-15', mark: 'taken', today: true, placebo: false });
    expect(r.pills[12].mark).toBe('future');
    expect(r.pills[21].placebo).toBe(true);
    expect(r.streak).toBe(3); // missed on the 12th breaks it
  });
  it('without a pack start shows the last 28 days; untaken today does not break the streak yet', () => {
    const m2 = new Map(m); m2.delete('2026-11-15');
    const r = pillRing(m2, null, now2);
    expect(r.packDay).toBeNull();
    expect(r.pills[27]).toMatchObject({ date: '2026-11-15', today: true, mark: 'none' });
    expect(r.streak).toBe(2);
    expect(r.todayMark).toBe('none');
  });
});

describe('menopause helpers', () => {
  it('counts hot flushes today and over 7 days', () => {
    const r = hotFlushes([
      { signal_date: '2026-11-15', notes: 'Hot flashes: 4; Mood: ok' },
      { signal_date: '2026-11-12', notes: 'Hot flashes: 6' },
      { signal_date: '2026-11-01', notes: 'Hot flashes: 9' },
      { signal_date: '2026-11-14', notes: 'Slept badly' },
    ], now);
    expect(r).toEqual({ today: 4, total7: 10, daysLogged7: 2 });
  });
  it('months since last period', () => {
    expect(monthsSince(new Date(2026, 3, 20), now)).toBe(6);
    expect(monthsSince(new Date(2026, 3, 10), now)).toBe(7);
    expect(monthsSince(null, now)).toBeNull();
  });
});

describe('postMenopauseBleed', () => {
  it('flags a period within 12 months only for post-menopause', () => {
    expect(postMenopauseBleed('post-menopause', 0)).toBe(true);
    expect(postMenopauseBleed('post-menopause', 11)).toBe(true);
    expect(postMenopauseBleed('post-menopause', 12)).toBe(false);
    expect(postMenopauseBleed('post-menopause', null)).toBe(false);
    expect(postMenopauseBleed('menopause', 0)).toBe(false);
  });
});

describe('parseRange: Swiss lab formats (shared parser)', () => {
  it.each([
    ['5,0 - 7,0', { low: 5, high: 7 }],
    ["150'000 - 400'000", { low: 150000, high: 400000 }],
    ['Referenzbereich: 15 - 150', { low: 15, high: 150 }],
    ['bis 5', { low: null, high: 5 }],
    ['< 0,5', { low: null, high: 0.5 }],
    ['M: 30-400 / F: 15-150', { low: 15, high: 150 }],
  ])('%s', (raw, want) => {
    expect(parseRange(raw)).toEqual(want);
  });
  it('no bounds for qualitative or unreadable ranges', () => {
    expect(parseRange('negativ')).toBeNull();
    expect(parseRange('siehe Kommentar')).toBeNull();
  });
  it('reads a Swiss thousands value against its range', () => {
    expect(pickFlaggedLab([{ title: 'Thrombozyten', value: "512'000", unit: '/µl', reference_range: "150'000 - 400'000", status: 'abnormal' }])?.direction).toBe('high');
  });
});
