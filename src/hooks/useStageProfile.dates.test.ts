import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { localDay, storedCycleLength } from './useStageProfile';
import { periodDaysUntil } from './useTodaySignals';

// Dates come back from /api/db as 'YYYY-MM-DD'. new Date() on that is UTC
// midnight, i.e. the evening BEFORE in New York: the due date and the last
// period sat a day early, so the period showed "1 day late" a day too soon.
const tz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/New_York'; });
afterAll(() => { process.env.TZ = tz; });

describe('localDay keeps the stored calendar day west of UTC', () => {
  it('a date-only string is local midnight of that day', () => {
    const d = localDay('2027-01-24')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2027, 0, 24, 0]);
  });

  it('a UTC-midnight timestamp keeps its date', () => {
    expect(localDay('2026-11-01T00:00:00.000Z')!.getDate()).toBe(1);
  });

  it('empty and unreadable values are null', () => {
    expect(localDay(null)).toBeNull();
    expect(localDay('')).toBeNull();
    expect(localDay('soon')).toBeNull();
  });

  it('a period due today is not reported as late in New York', () => {
    const period = { lastPeriodStart: localDay('2026-10-28')!, cycleLength: 28 };
    // 25 Nov, 18:00 New York: next period is due today (28 Oct + 28 days).
    expect(periodDaysUntil(period, new Date(2026, 10, 25, 18)) === 0).toBe(true); // -0 across the DST change is fine
    // The old parse put the start on 27 Oct: "1 day late".
    const old = { lastPeriodStart: new Date('2026-10-28'), cycleLength: 28 };
    expect(periodDaysUntil(old, new Date(2026, 10, 25, 18))).toBe(-1);
  });
});

describe('storedCycleLength', () => {
  it('keeps a usable stored length, numbers or numeric strings', () => {
    expect(storedCycleLength(31)).toBe(31);
    expect(storedCycleLength('26')).toBe(26);
  });
  it('a missing or unusable length falls back to 28 (Home crashed on undefined)', () => {
    for (const v of [null, undefined, '', 0, 'abc', 5, 400, NaN]) expect(storedCycleLength(v)).toBe(28);
  });
});
