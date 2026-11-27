import { describe, it, expect } from 'vitest';
import { supplyEnd, supplyReminders, supplyNote, REFILL_WINDOW_DAYS } from './medicineSupply';

const now = new Date(2026, 10, 27, 9); // 27 Nov 2026

describe('supplyEnd', () => {
  it('pack: start + doses / doses a day, last day inclusive', () => {
    // 30 tablets, 1 a day from 1 Nov -> last dose 30 Nov.
    expect(supplyEnd({ name: 'Iron', times_per_day: 1, pack_size: 30, pack_started_on: '2026-11-01' }))
      .toEqual({ kind: 'pack', lastDay: '2026-11-30' });
    // 28 doses, 2 a day -> 14 days; 29 doses -> 15 days (a half day still needs a dose).
    expect(supplyEnd({ name: 'X', times_per_day: 2, pack_size: 28, pack_started_on: '2026-11-01' })?.lastDay).toBe('2026-11-14');
    expect(supplyEnd({ name: 'X', times_per_day: 2, pack_size: 29, pack_started_on: '2026-11-01' })?.lastDay).toBe('2026-11-15');
  });

  it('course end date; the earlier of the two wins', () => {
    expect(supplyEnd({ name: 'A', ends_on: '2026-12-05' })).toEqual({ kind: 'course', lastDay: '2026-12-05' });
    expect(supplyEnd({ name: 'A', ends_on: '2026-12-05', times_per_day: 1, pack_size: 10, pack_started_on: '2026-11-20' }))
      .toEqual({ kind: 'pack', lastDay: '2026-11-29' });
  });

  it('needs every pack field; no guessing doses a day', () => {
    expect(supplyEnd({ name: 'A' })).toBeNull();
    expect(supplyEnd({ name: 'A', pack_size: 30, pack_started_on: '2026-11-01' })).toBeNull();
    expect(supplyEnd({ name: 'A', times_per_day: 1, pack_size: 0, pack_started_on: '2026-11-01' })).toBeNull();
    expect(supplyEnd({ name: 'A', times_per_day: 1, pack_size: 30, pack_started_on: 'soon' })).toBeNull();
  });
});

describe('supplyReminders', () => {
  it(`shows from ${REFILL_WINDOW_DAYS} days before up to the last day, soonest first`, () => {
    const meds = [
      { name: 'Iron', times_per_day: 1, pack_size: 30, pack_started_on: '2026-11-01' }, // 30 Nov: 3 days
      { name: 'Antibiotic', ends_on: '2026-11-28' }, // tomorrow
      { name: 'Vitamin D', ends_on: '2026-11-27' }, // today
      { name: 'Later', ends_on: '2026-12-01' }, // 4 days: not yet
      { name: 'Past', ends_on: '2026-11-26' }, // yesterday: gone
    ];
    expect(supplyReminders(meds, now).map(r => r.label)).toEqual([
      'Vitamin D: last day of the course today',
      'Antibiotic: last day of the course tomorrow',
      'Iron: pack runs out in 3 days',
    ]);
  });

  it('says "last dose of this pack today" on the day', () => {
    const [r] = supplyReminders([{ name: 'Iron', times_per_day: 1, pack_size: 27, pack_started_on: '2026-11-01' }], now);
    expect(r.label).toBe('Iron: last dose of this pack today');
    expect(r.daysLeft).toBe(0);
  });

  it('skips medicines without a name or without supply data', () => {
    expect(supplyReminders([{ name: ' ', ends_on: '2026-11-27' }, { name: 'Iron' }], now)).toEqual([]);
  });
});

describe('supplyNote', () => {
  it('names the kind of end date', () => {
    expect(supplyNote({ name: 'A', ends_on: '2026-12-05' }, 'en-GB')).toBe('Course ends 5 Dec');
    expect(supplyNote({ name: 'A', times_per_day: 1, pack_size: 30, pack_started_on: '2026-11-01' }, 'en-GB')).toBe('Pack lasts until 30 Nov');
    expect(supplyNote({ name: 'A' })).toBeNull();
  });
});
