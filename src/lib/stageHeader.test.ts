import { describe, it, expect } from 'vitest';
import { LIFE_STAGES } from '@/lib/lifeStage';
import { LIFE_STAGE_LABELS } from '@/lib/lifeStageLabels';
import { cycleDial } from '@/lib/bodyMap';
import { headerFor, visitValue, POST_MENOPAUSE_BLEED_SHORT, ago } from './stageHeader';

const now = new Date(2026, 10, 24, 10, 42); // Tue 24 Nov 2026
const days = (n: number) => new Date(2026, 10, 24 + n);

describe('Home header: one big fact, one sentence (facts kept in the model)', () => {
  it.each(LIFE_STAGES)('%s, with and without data', (mode) => {
    for (const facts of [{}, {
      dueDate: days(70), kicksToday: 12, cycle: cycleDial(days(-17), 28, now),
      pill: { isPill: true, packDay: 12, streak: 11, takenToday: 'taken' as const },
      ivf: { phase: 'Stimulation', next: 'Trigger Shot', day: 6 }, doses: { taken: 1, total: 3 },
      baby: { name: 'Mia', dayOfLife: 12, lastFeedMin: 95, feedsToday: 6, wet: 4, dirty: 2, sleepMin: 320 },
      hotFlushesToday: 4, hotFlushes7: 20, monthsSincePeriod: 8,
    }]) {
      const h = headerFor(mode, { now, stageName: LIFE_STAGE_LABELS[mode], ...facts });
      expect(h.chip).toBe(LIFE_STAGE_LABELS[mode]);
      expect(h.big.length).toBeLessThanOrEqual(24);
      expect(h.sentence.length).toBeLessThanOrEqual(44);
      expect(h.facts).toHaveLength(2);
      for (const f of h.facts) {
        expect(f.label.length).toBeLessThanOrEqual(18);
        expect(f.value.length).toBeLessThanOrEqual(16);
      }
      // no spelled-out numbers, no cycle jargon or lab abbreviations
      const text = [h.big, h.sentence, ...h.facts.flatMap(f => [f.label, f.value])].join(' ');
      expect(text).not.toMatch(/\b(twenty|thirty|forty)\b|of (twenty-eight|forty)/i);
      expect(text).not.toMatch(/\b(Luteal|Follicular|TSH|AMH|EPDS|BBT)\b/);
    }
  });

  it('pregnancy week 30 reads like the mock', () => {
    const h = headerFor('pregnancy', { now, stageName: 'Pregnancy', dueDate: days(70), kicksToday: 12, nextVisit: new Date(2026, 10, 26, 10, 30) });
    expect(h.big).toBe('Week 30');
    expect(h.sentence).toBe('70 days to go · due 2 Feb');
    expect(h.facts).toEqual([{ label: 'Next visit', value: 'Thu 10:30' }, { label: 'Kicks today', value: '12' }]);
  });

  it('period tracking day 18 of 28 reads like the mock', () => {
    const h = headerFor('menstrual-cycle', { now, stageName: 'Period tracking', cycle: cycleDial(days(-17), 28, now) });
    expect(h.big).toBe('Day 18');
    expect(h.sentence).toBe('Period in about 11 days');
    expect(h.facts[0].label).toBe('Next period');
    expect(h.facts[1]).toEqual({ label: 'Fertile window', value: 'Ended' });
  });

  it('visit values are short', () => {
    expect(visitValue(null, now)).toBe('None booked');
    expect(visitValue(new Date(2026, 10, 24, 14, 0), now)).toBe('Today 14:00');
    expect(visitValue(new Date(2026, 10, 25, 9, 0), now)).toBe('Tomorrow 09:00');
    expect(visitValue(new Date(2026, 11, 20, 9, 0), now)).toBe('Sun 20 Dec');
  });
});

describe('after menopause, a recent period is flagged, not counted', () => {
  it('shows the see-your-doctor line when a period was logged within 12 months', () => {
    const h = headerFor('post-menopause', { now, stageName: 'After menopause', monthsSincePeriod: 0 });
    expect(h.sentence).toBe(POST_MENOPAUSE_BLEED_SHORT);
  });
  it('keeps the normal line after 12+ months, and in menopause', () => {
    expect(headerFor('post-menopause', { now, stageName: 'After menopause', monthsSincePeriod: 14 }).sentence).not.toBe(POST_MENOPAUSE_BLEED_SHORT);
    expect(headerFor('menopause', { now, stageName: 'Menopause', monthsSincePeriod: 2 }).sentence).not.toBe(POST_MENOPAUSE_BLEED_SHORT);
  });
});

describe('no data, no made-up numbers', () => {
  const dial = cycleDial(days(-17), 28, now);
  it('before a first period: no cycle day or next period until one is logged', () => {
    const h = headerFor('pre-menstrual', { now, stageName: 'Before first period', cycle: dial, nextVisit: null,
      lastSymptom: { name: 'Headache', date: now } });
    expect(h.big).toBe('No period yet');
    expect(h.sentence).toBe('Log your first period when it comes.');
    expect(h.facts).toEqual([{ label: 'Last symptom', value: 'Headache' }, { label: 'Next visit', value: 'None booked' }]);
    const text = [h.big, h.sentence, ...h.facts.flatMap(f => [f.label, f.value])].join(' ');
    expect(text).not.toMatch(/Day \d+ of|Period in|Next period/);
  });
  it('before a first period, without symptoms, falls back to what was logged today', () => {
    const h = headerFor('pre-menstrual', { now, stageName: 'Before first period', loggedToday: 0 });
    expect(h.facts[0]).toEqual({ label: 'Logged today', value: '0' });
  });
  it('before a first period, once one is logged, the cycle shows', () => {
    const h = headerFor('pre-menstrual', { now, stageName: 'Before first period', cycle: dial, cycleStart: days(-17) });
    expect(h.big).toBe('Day 18');
  });
  it('a period overdue counts on instead of wrapping round', () => {
    const h = headerFor('menstrual-cycle', { now, stageName: 'Period tracking', cycle: cycleDial(days(-33), 28, now), cycleStart: days(-33) });
    expect(h.big).toBe('Day 34');
    expect(h.sentence).toBe('Period 6 days late');
    expect(h.facts[0]).toEqual({ label: 'Last period', value: '22 Oct' });
  });
  it('a period logged months ago asks for the next one', () => {
    const h = headerFor('conception', { now, stageName: 'Trying to conceive', cycle: cycleDial(days(-120), 28, now), cycleStart: days(-120) });
    expect(h.big).toBe('Log your period');
    expect(h.sentence).toBe('Last one logged 120 days ago');
  });
  it('IVF without a cycle start, or one far off, shows no day count', () => {
    expect(headerFor('ivf', { now, stageName: 'IVF' }).big).toBe('Your IVF cycle');
    const soon = headerFor('ivf', { now, stageName: 'IVF', ivf: { phase: 'Stimulation', next: 'Trigger Shot', day: -2 } });
    expect(soon.big).toBe('Your IVF cycle');
    expect(soon.sentence).toBe('Starts in 3 days');
    expect(headerFor('ivf', { now, stageName: 'IVF', ivf: { phase: 'Stimulation', next: null, day: 200 } }).big).toBe('Your IVF cycle');
  });
  it('after birth without a baby, or with a birth date still to come', () => {
    const none = headerFor('postpartum', { now, stageName: 'After birth' });
    expect(none.sentence).toBe('Add your baby to log feeds and nappies.');
    expect(none.facts.map(f => f.label)).not.toContain('Nappies today');
    const unborn = headerFor('postpartum', { now, stageName: 'After birth',
      baby: { name: 'Mia', dayOfLife: -3, lastFeedMin: null, feedsToday: 0, wet: 0, dirty: 0, sleepMin: 0 } });
    expect(unborn.big).toBe('Mia');
    expect(unborn.sentence).toBe('No feeds logged yet');
  });
  it('pregnancy: no "Week 0" or "Week 42 of 40" from a wrong or old due date', () => {
    expect(headerFor('pregnancy', { now, stageName: 'Pregnancy', dueDate: days(300) }).big).toBe('Your pregnancy');
    expect(headerFor('pregnancy', { now, stageName: 'Pregnancy', dueDate: days(-30) }).big).toBe('Is your baby here?');
    expect(headerFor('pregnancy', { now, stageName: 'Pregnancy', dueDate: days(-3) }).big).toBe('Week 40');
  });
  it('menopause without any period logged says so', () => {
    const h = headerFor('menopause', { now, stageName: 'Menopause' });
    expect(h.big).toBe('No hot flushes');
    expect(h.facts[0]).toEqual({ label: 'Since last period', value: 'Not logged' });
  });
});

describe('round 6: one big fact per stage', () => {
  const big = (mode: Parameters<typeof headerFor>[0], extra: Record<string, unknown>) => headerFor(mode, { now, stageName: 'S', ...extra });
  it('cycle: the period while it is on, or when it is close', () => {
    expect(big('menstrual-cycle', { cycle: cycleDial(days(-1), 28, now), cycleStart: days(-1) }).big).toBe('Period day 2');
    const close = big('menstrual-cycle', { cycle: cycleDial(days(-25), 28, now), cycleStart: days(-25) });
    expect(close.big).toBe('Period in 3 days');
    expect(close.sentence).toBe('Day 26 of 28');
    expect(big('menstrual-cycle', { cycle: cycleDial(days(-27), 28, now), cycleStart: days(-27) }).big).toBe('Period tomorrow');
  });
  it('trying: the fertile window leads', () => {
    expect(big('conception', { cycle: cycleDial(days(-13), 28, now), cycleStart: days(-13) }).big).toBe('Fertile today');
    const before = big('conception', { cycle: cycleDial(days(-5), 28, now), cycleStart: days(-5) });
    expect(before.big).toBe('Day 6');
    expect(before.sentence).toMatch(/^Fertile window in \d+ days$/);
  });
  it('pill, IVF, baby and menopause read as short facts', () => {
    expect(big('contraception', { pill: { isPill: true, packDay: 12, streak: 11, takenToday: null } }).big).toBe('Pack day 12');
    const ivf = big('ivf', { ivf: { phase: 'Stimulation', next: 'Trigger Shot', day: 6 } });
    expect([ivf.big, ivf.sentence]).toEqual(['Day 6', 'Stimulation · next: Trigger Shot']);
    const baby = big('postpartum', { baby: { name: 'Mia', dayOfLife: 12, lastFeedMin: 7, feedsToday: 3, wet: 2, dirty: 1, sleepMin: 95 } });
    expect([baby.big, baby.sentence]).toEqual(['Day 12', 'Mia · last feed 7 min ago']);
    const meno = big('menopause', { hotFlushesToday: 4, hotFlushes7: 23 });
    expect([meno.big, meno.sentence]).toEqual(['4 hot flushes', 'Today · 23 this week']);
  });
});

describe('ago()', () => {
  it('switches to days after 24 hours', () => {
    expect(ago(95)).toBe('1 h 35 min ago');
    expect(ago(24 * 60 + 30)).toBe('yesterday');
    expect(ago(217 * 60 + 25)).toBe('9 days ago');
  });
});
