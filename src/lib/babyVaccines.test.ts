import { describe, it, expect } from 'vitest';
import { addMonthsLocal, babyVaccineReminders } from './babyVaccines';
import { lastMoodLogFrom } from '@/hooks/useTodaySignals';

// Local dates throughout (no UTC): 2026-11-23, 09:00
const NOW = new Date(2026, 10, 23, 9, 0);

describe('babyVaccineReminders', () => {
  it('shows from 3 days before a common age until 3 weeks after', () => {
    // 2 months on 2026-11-26 (3 days ahead) -> shown
    expect(babyVaccineReminders([{ name: 'Mia', birth_date: '2026-09-26' }], NOW)).toEqual([{ name: 'Mia', age: '2 months' }]);
    // 2 months on 2026-11-27 (4 days ahead) -> not yet
    expect(babyVaccineReminders([{ name: 'Mia', birth_date: '2026-09-27' }], NOW)).toEqual([]);
    // 2 months on 2026-11-02 (21 days ago) -> still shown; 22 days -> gone
    expect(babyVaccineReminders([{ name: 'Mia', birth_date: '2026-09-02' }], NOW)).toHaveLength(1);
    expect(babyVaccineReminders([{ name: 'Mia', birth_date: '2026-09-01' }], NOW)).toEqual([]);
  });

  it('covers 4 months and 1 year; nothing between ages', () => {
    expect(babyVaccineReminders([{ name: 'Leo', birth_date: '2026-07-20' }], NOW)).toEqual([{ name: 'Leo', age: '4 months' }]);
    expect(babyVaccineReminders([{ name: 'Leo', birth_date: '2025-11-20' }], NOW)).toEqual([{ name: 'Leo', age: '1 year' }]);
    expect(babyVaccineReminders([{ name: 'Leo', birth_date: '2026-08-15' }], NOW)).toEqual([]); // about 3 months
  });

  it('a vaccination logged around the age (from 2 weeks before) hides it', () => {
    const b = { name: 'Mia', birth_date: '2026-09-20' }; // 2 months on 2026-11-20
    expect(babyVaccineReminders([{ ...b, lastVaccineAt: new Date(2026, 10, 21, 10) }], NOW)).toEqual([]);
    expect(babyVaccineReminders([{ ...b, lastVaccineAt: new Date(2026, 10, 6, 10) }], NOW)).toEqual([]); // 14 days before
    expect(babyVaccineReminders([{ ...b, lastVaccineAt: new Date(2026, 9, 1) }], NOW)).toHaveLength(1); // an older dose
  });

  it('unnamed baby, unknown birth date, several babies', () => {
    expect(babyVaccineReminders([{ name: '  ', birth_date: '2026-09-23' }], NOW)).toEqual([{ name: 'Baby', age: '2 months' }]);
    expect(babyVaccineReminders([{ name: 'Mia', birth_date: null }], NOW)).toEqual([]);
    expect(babyVaccineReminders([
      { name: 'A', birth_date: '2026-09-23' }, { name: 'B', birth_date: '2026-09-23' },
    ], NOW)).toHaveLength(2);
  });

  it('adds months on local calendar days, clamping to the month end', () => {
    expect(addMonthsLocal(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
    expect(addMonthsLocal(new Date(2026, 10, 30), 2)).toEqual(new Date(2027, 0, 30));
  });
});

describe('lastMoodLogFrom (weekly mood row)', () => {
  it('newest day with at least one mood ticked, as a local date', () => {
    expect(lastMoodLogFrom([
      { signal_date: '2026-11-10', mood: ['calm'] },
      { signal_date: '2026-11-18T00:00:00.000Z', mood: '["tired"]' },
      { signal_date: '2026-11-20', mood: [] },
      { signal_date: '2026-11-21', mood: null },
    ])).toEqual(new Date(2026, 10, 18));
    expect(lastMoodLogFrom([{ signal_date: '2026-11-20', mood: [] }])).toBeNull();
    expect(lastMoodLogFrom(null)).toBeNull();
  });
});
