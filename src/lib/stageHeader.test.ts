import { describe, it, expect } from 'vitest';
import { LIFE_STAGES } from '@/lib/lifeStage';
import { LIFE_STAGE_LABELS } from '@/lib/lifeStageLabels';
import { cycleDial } from '@/lib/bodyMap';
import { headerFor, visitValue } from './stageHeader';

const now = new Date(2026, 10, 24, 10, 42); // Tue 24 Nov 2026
const days = (n: number) => new Date(2026, 10, 24 + n);

describe('Home header: one big line, one sentence, two facts', () => {
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
    expect(h.big).toBe('Week 30 of 40');
    expect(h.sentence).toBe('70 days to go · due 2 Feb');
    expect(h.facts).toEqual([{ label: 'Next visit', value: 'Thu 10:30' }, { label: 'Kicks today', value: '12' }]);
  });

  it('period tracking day 18 of 28 reads like the mock', () => {
    const h = headerFor('menstrual-cycle', { now, stageName: 'Period tracking', cycle: cycleDial(days(-17), 28, now) });
    expect(h.big).toBe('Day 18 of 28');
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
