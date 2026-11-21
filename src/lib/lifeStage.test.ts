import { describe, it, expect } from 'vitest';
import { LIFE_STAGES, normalizeLifeStage } from './lifeStage';

describe('normalizeLifeStage', () => {
  it('keeps every real mode as-is', () => {
    for (const m of LIFE_STAGES) expect(normalizeLifeStage(m)).toBe(m);
  });

  it('maps aliases that older rows / onboarding ids hold onto a real mode', () => {
    expect(normalizeLifeStage('perimenopause')).toBe('menopause');
    expect(normalizeLifeStage('pregnant')).toBe('pregnancy');
    expect(normalizeLifeStage('trying-to-conceive')).toBe('conception');
    expect(normalizeLifeStage('regular-cycle')).toBe('menstrual-cycle');
    expect(normalizeLifeStage(' Pregnancy ')).toBe('pregnancy');
  });

  it('falls back to the cycle mode for empty or unknown values', () => {
    expect(normalizeLifeStage(null)).toBe('menstrual-cycle');
    expect(normalizeLifeStage(undefined)).toBe('menstrual-cycle');
    expect(normalizeLifeStage('')).toBe('menstrual-cycle');
    expect(normalizeLifeStage('something-else')).toBe('menstrual-cycle');
  });
});
