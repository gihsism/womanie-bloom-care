import { describe, it, expect } from 'vitest';
import { postnatalCheckDue, pickBirthDate, POSTNATAL_LABEL } from './postnatalCheck';

const now = new Date(2026, 10, 27, 10, 0);
const daysAgo = (n: number) => new Date(2026, 10, 27 - n);

describe('postnatalCheckDue', () => {
  it('shows from week 5 to week 8 after the birth', () => {
    expect(postnatalCheckDue({ birthDate: daysAgo(34), visits: [], now })).toBe(false);
    expect(postnatalCheckDue({ birthDate: daysAgo(35), visits: [], now })).toBe(true);
    expect(postnatalCheckDue({ birthDate: daysAgo(42), visits: [], now })).toBe(true);
    expect(postnatalCheckDue({ birthDate: daysAgo(56), visits: [], now })).toBe(true);
    expect(postnatalCheckDue({ birthDate: daysAgo(57), visits: [], now })).toBe(false);
  });

  it('hides without a birth date or once the milestone is ticked', () => {
    expect(postnatalCheckDue({ birthDate: null, visits: [], now })).toBe(false);
    expect(postnatalCheckDue({ birthDate: daysAgo(40), visits: [], ticked: true, now })).toBe(false);
  });

  it('hides when any visit after the birth is logged, booked or past', () => {
    expect(postnatalCheckDue({ birthDate: daysAgo(40), visits: [daysAgo(-5)], now })).toBe(false);
    expect(postnatalCheckDue({ birthDate: daysAgo(40), visits: [daysAgo(10)], now })).toBe(false);
  });

  it('a visit from before the birth does not count', () => {
    expect(postnatalCheckDue({ birthDate: daysAgo(40), visits: [daysAgo(60), daysAgo(40)], now })).toBe(true);
  });

  it('label fits one Today row', () => {
    expect(POSTNATAL_LABEL.length).toBeLessThanOrEqual(60);
  });
});

describe('pickBirthDate', () => {
  it('prefers the birth record, then the youngest baby, then the device copy', () => {
    expect(pickBirthDate('2026-10-15T14:30:00Z', ['2026-01-01'], '2025-01-01')?.getDate()).toBe(15);
    expect(pickBirthDate(null, ['2024-03-02', '2026-10-20', null], '2025-01-01')?.getMonth()).toBe(9);
    expect(pickBirthDate(null, [], '2026-10-18')?.getDate()).toBe(18);
    expect(pickBirthDate(null, ['garbage'], null)).toBeNull();
  });
});
