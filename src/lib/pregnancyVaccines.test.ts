import { describe, it, expect } from 'vitest';
import { gestationalWeek, vaccinesDueNow } from './pregnancyVaccines';
import { pillPackDay, parsePillStatus } from './pillLog';
import { lastMoodCheckFrom } from '@/hooks/useTodaySignals';

describe('pregnancy vaccines due now', () => {
  it('lists vaccines in their window that are not marked received or "not now"', () => {
    expect(vaccinesDueNow({}, 20).map(v => v.key)).toEqual(['flu', 'covid']);
    expect(vaccinesDueNow({}, 33).map(v => v.key)).toEqual(['tdap', 'flu', 'rsv', 'covid']);
    expect(vaccinesDueNow({ tdap: { receivedDate: '2026-11-01' }, flu: { declined: true } }, 33).map(v => v.key)).toEqual(['rsv', 'covid']);
    expect(vaccinesDueNow({}, null)).toEqual([]);
  });

  it('gestational week from the due date', () => {
    const now = new Date(2026, 10, 23);
    expect(gestationalWeek(new Date(2027, 0, 25), now)).toBe(31); // 63 days before due = day 217 = week 31
    expect(gestationalWeek(null, now)).toBeNull();
    expect(gestationalWeek(new Date(2028, 0, 1), now)).toBeNull();
  });
});

describe('pill log helpers', () => {
  it('reads the pill tick from the notes text', () => {
    expect(parsePillStatus('Tired. Pill: late')).toBe('late');
    expect(parsePillStatus('Tired')).toBeNull();
    expect(parsePillStatus(null)).toBeNull();
  });
  it('pack day cycles through 28 days', () => {
    const now = new Date(2026, 10, 23);
    expect(pillPackDay('2026-11-23', now)).toBe(1);
    expect(pillPackDay('2026-10-26', now)).toBe(1); // 28 days later = a new pack
    expect(pillPackDay('2026-11-01', now)).toBe(23);
    expect(pillPackDay(null, now)).toBeNull();
    expect(pillPackDay('2026-12-01', now)).toBeNull();
  });
});

describe('last mood check', () => {
  it('takes the newest valid date; null when never taken', () => {
    expect(lastMoodCheckFrom([{ date: '2026-11-01' }, { date: '2026-11-10' }])).toEqual(new Date(2026, 10, 10));
    expect(lastMoodCheckFrom([])).toBeNull();
    expect(lastMoodCheckFrom(null)).toBeNull();
    expect(lastMoodCheckFrom([{ nope: 1 }])).toBeNull();
  });
});
