import { describe, it, expect } from 'vitest';
import { periodLateHelp, LATE_HELP_FROM_DAYS } from './periodLate';
import { MAX_LATE_DAYS } from './todayItems';

describe('periodLateHelp', () => {
  it('stays hidden until the period is clearly late', () => {
    expect(periodLateHelp('menstrual-cycle', 3)).toBeNull();
    expect(periodLateHelp('menstrual-cycle', 0)).toBeNull();
    expect(periodLateHelp('menstrual-cycle', -(LATE_HELP_FROM_DAYS - 1))).toBeNull();
    expect(periodLateHelp('menstrual-cycle', -LATE_HELP_FROM_DAYS)?.lateBy).toBe(LATE_HELP_FROM_DAYS);
  });

  it('stops where the Today row stops (a stale log)', () => {
    expect(periodLateHelp('menstrual-cycle', -MAX_LATE_DAYS)).not.toBeNull();
    expect(periodLateHelp('menstrual-cycle', -(MAX_LATE_DAYS + 1))).toBeNull();
  });

  it('only for period tracking and trying to conceive', () => {
    expect(periodLateHelp('conception', -7)?.title).toBe('Your period is 7 days later than predicted');
    for (const m of ['pregnancy', 'postpartum', 'contraception', 'menopause', null]) {
      expect(periodLateHelp(m, -7)).toBeNull();
    }
    expect(periodLateHelp('menstrual-cycle', null)).toBeNull();
  });

  it('is neutral: a test as one option, ask your doctor, no diagnosis', () => {
    const text = periodLateHelp('menstrual-cycle', -6)!.lines.join(' ');
    expect(text).toMatch(/pregnancy test/);
    expect(text).toMatch(/Ask your doctor/);
    expect(text).toMatch(/If you could be pregnant/);
    expect(text).not.toMatch(/\byou are pregnant\b|\byou have\b|PCOS|thyroid|amenorrh|diagnos|should take/i);
  });
});
