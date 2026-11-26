import { describe, it, expect } from 'vitest';
import {
  vomitWindowHours,
  classifyLate, missedPillGuidance, hoursLateSince, choiceForHours, LATE_CHOICES,
  isPillType, MISSED_AFTER_HOURS, EC_OPTIONS, UNSURE_FOOTER, PILL_TYPES,
} from './missedPill';

describe('classifyLate: hour limits by pill type (FSRH)', () => {
  it('combined: under 24 h is late, 24–48 h one missed, 48 h+ two or more', () => {
    expect(classifyLate('combined', 0)).toBe('not-late');
    expect(classifyLate('combined', 23.9)).toBe('late');
    expect(classifyLate('combined', 24)).toBe('missed');
    expect(classifyLate('combined', 47.9)).toBe('missed');
    expect(classifyLate('combined', 48)).toBe('missed-2plus');
  });
  it('traditional mini-pill: missed at more than 3 h', () => {
    expect(classifyLate('pop-traditional', 3)).toBe('late');
    expect(classifyLate('pop-traditional', 3.1)).toBe('missed');
    expect(classifyLate('pop-traditional', 60)).toBe('missed');
  });
  it('desogestrel: missed at more than 12 h', () => {
    expect(classifyLate('pop-desogestrel', 11)).toBe('late');
    expect(classifyLate('pop-desogestrel', 12)).toBe('late');
    expect(classifyLate('pop-desogestrel', 12.5)).toBe('missed');
  });
  it('drospirenone: missed at more than 24 h', () => {
    expect(classifyLate('pop-drospirenone', 24)).toBe('late');
    expect(classifyLate('pop-drospirenone', 25)).toBe('missed');
  });
  it('break-week pills never count as missed', () => {
    expect(classifyLate('combined', 60, 23)).toBe('break');
    expect(classifyLate('pop-drospirenone', 60, 25)).toBe('break');
    expect(classifyLate('pop-drospirenone', 60, 24)).toBe('missed');
    // Desogestrel has no break: every day is a hormone pill.
    expect(classifyLate('pop-desogestrel', 60, 27)).toBe('missed');
  });
});

describe('missedPillGuidance', () => {
  it('a late pill is still protected: take it now, no extra protection, no EC', () => {
    const g = missedPillGuidance('combined', 10);
    expect(g.title).toMatch(/still protected/);
    expect(g.extraProtection).toBeNull();
    expect(g.emergency).toBeNull();
    expect(g.footer).toBe(UNSURE_FOOTER);
  });
  it('combined, one missed: carry on, EC usually not needed', () => {
    const g = missedPillGuidance('combined', 30, 10);
    expect(g.level).toBe('missed');
    expect(g.extraProtection).toBeNull();
    expect(g.emergency?.consider).toBe(false);
  });
  it('combined, two+ missed in week 1: 7 days condoms and consider EC', () => {
    const g = missedPillGuidance('combined', 50, 3);
    expect(g.extraProtection).toMatch(/7 hormone pills/);
    expect(g.emergency?.consider).toBe(true);
    expect(g.emergency?.text).toContain(EC_OPTIONS);
  });
  it('combined, two+ missed in week 2: EC not usually needed', () => {
    const g = missedPillGuidance('combined', 50, 10);
    expect(g.emergency?.consider).toBe(false);
    expect(g.steps.join(' ')).not.toMatch(/skip the break/);
  });
  it('combined, two+ missed in week 3: skip the break', () => {
    const g = missedPillGuidance('combined', 50, 17);
    expect(g.steps.join(' ')).toMatch(/skip the break/);
  });
  it('desogestrel / traditional missed: one pill only, 48 h condoms, EC if sex', () => {
    for (const t of ['pop-desogestrel', 'pop-traditional'] as const) {
      const g = missedPillGuidance(t, MISSED_AFTER_HOURS[t] + 1);
      expect(g.steps[0]).toMatch(/take only one/);
      expect(g.extraProtection).toMatch(/2 days/);
      expect(g.emergency?.consider).toBe(true);
    }
  });
  it('drospirenone missed: 7 days condoms; late in pack skips the hormone-free pills', () => {
    const g = missedPillGuidance('pop-drospirenone', 30, 20);
    expect(g.extraProtection).toMatch(/7 days/);
    expect(g.steps.join(' ')).toMatch(/Skip the 4 pills/);
  });
  it('never names a product', () => {
    const all = PILL_TYPES.flatMap(t => [2, 8, 18, 36, 60].map(h => missedPillGuidance(t.id, h, 3)));
    const text = JSON.stringify(all);
    expect(text).not.toMatch(/NorLevo|ellaOne|Postinor|Cerazette|Slynd|Slinda|Microlut|levonelle/i);
  });
});

describe('hours late helpers', () => {
  it('counts hours since the usual time on the due day', () => {
    expect(hoursLateSince('2026-11-25', '21:00', new Date(2026, 10, 26, 9, 0))).toBe(12);
    expect(hoursLateSince('2026-11-26', '21:00', new Date(2026, 10, 26, 9, 0))).toBe(0);
  });
  it('maps hours to the quick choice and back to the same band', () => {
    for (const c of LATE_CHOICES) expect(choiceForHours(c.hours)).toBe(c.id);
    expect(choiceForHours(12)).toBe('12-24');
    expect(choiceForHours(48)).toBe('48plus');
  });
  it('validates stored pill types', () => {
    expect(isPillType('combined')).toBe(true);
    expect(isPillType('pill')).toBe(false);
    expect(isPillType(null)).toBe(false);
  });
});

describe('vomitWindowHours', () => {
  it('is 2 h for the combined pill and 3 h for every mini-pill (the reminders card used to say 2 h for all)', () => {
    expect(vomitWindowHours('combined')).toBe(2);
    expect(vomitWindowHours('pop-desogestrel')).toBe(3);
    expect(vomitWindowHours('pop-drospirenone')).toBe(3);
    expect(vomitWindowHours('pop-traditional')).toBe(3);
  });
});
