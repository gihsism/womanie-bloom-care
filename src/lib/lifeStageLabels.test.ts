import { describe, it, expect } from 'vitest';
import { LIFE_STAGES } from './lifeStage';
import { LIFE_STAGE_LABELS, LIFE_STAGE_DESCRIPTIONS, lifeStageLabel } from './lifeStageLabels';

describe('life stage labels', () => {
  it('the stored life_stage keys are unchanged (user data depends on them)', () => {
    expect([...LIFE_STAGES]).toEqual([
      'pre-menstrual',
      'menstrual-cycle',
      'contraception',
      'conception',
      'ivf',
      'pregnancy',
      'postpartum',
      'menopause',
      'post-menopause',
    ]);
  });

  it('covers every stored key, and nothing else', () => {
    expect(Object.keys(LIFE_STAGE_LABELS).sort()).toEqual([...LIFE_STAGES].sort());
    expect(Object.keys(LIFE_STAGE_DESCRIPTIONS).sort()).toEqual([...LIFE_STAGES].sort());
  });

  it('uses the plain names from the copy rules', () => {
    expect(LIFE_STAGES.map((s) => LIFE_STAGE_LABELS[s])).toEqual([
      'Before first period',
      'Period tracking',
      'Birth control',
      'Trying to conceive',
      'IVF',
      'Pregnancy',
      'After birth',
      'Menopause',
      'After menopause',
    ]);
    for (const label of Object.values(LIFE_STAGE_LABELS)) {
      expect(label).not.toMatch(/mode/i);
    }
  });

  it('labels aliases and keeps unknown values as written', () => {
    expect(lifeStageLabel('conception')).toBe('Trying to conceive');
    expect(lifeStageLabel(' Pre-Menstrual ')).toBe('Before first period');
    expect(lifeStageLabel('pregnant')).toBe('Pregnancy');
    expect(lifeStageLabel('perimenopause')).toBe('Menopause');
    expect(lifeStageLabel('something-else')).toBe('Something else');
    expect(lifeStageLabel(null)).toBe('');
    expect(lifeStageLabel('')).toBe('');
  });
});
