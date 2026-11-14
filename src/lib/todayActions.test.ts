import { describe, it, expect } from 'vitest';
import { actionsFor } from './todayActions';

const labels = (m: string, w: number | null = null) => actionsFor(m, w).map(a => a.label);

describe('actionsFor (dashboard quick-log row)', () => {
  it('pregnancy shows kick count from week 28 and contractions from week 36', () => {
    expect(labels('pregnancy', 20)).not.toContain('Kick count');
    expect(labels('pregnancy', 30)).toContain('Kick count');
    expect(labels('pregnancy', 30)).not.toContain('Contractions');
    expect(labels('pregnancy', 37)[0]).toBe('Contractions');
  });
  it('never shows more than four buttons', () => {
    for (const w of [10, 30, 34, 38]) expect(actionsFor('pregnancy', w).length).toBeLessThanOrEqual(4);
  });
  it('postpartum opens the baby tracker on the right tab', () => {
    const a = actionsFor('postpartum', null);
    expect(a.find(x => x.label === 'Feed')?.target).toBe('/dashboard/baby?tab=feed');
    expect(a.find(x => x.label === 'Nappy')?.target).toBe('/dashboard/baby?tab=nappy');
  });
  it('every stage offers medicines', () => {
    for (const m of ['menstrual-cycle', 'conception', 'pre-menstrual', 'pregnancy', 'postpartum', 'menopause', 'post-menopause', 'ivf', 'contraception']) {
      expect(labels(m, 30)).toContain('Medicines');
    }
  });
});
