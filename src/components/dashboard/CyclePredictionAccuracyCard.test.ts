import { describe, it, expect } from 'vitest';
import { showsPredictionAccuracy } from './CyclePredictionAccuracyCard';

describe('CyclePredictionAccuracyCard stages', () => {
  it('is hidden before a first period (nothing to predict yet)', () => {
    expect(showsPredictionAccuracy('pre-menstrual')).toBe(false);
  });

  it('still shows for the cycle-tracking stages', () => {
    expect(showsPredictionAccuracy('menstrual-cycle')).toBe(true);
    expect(showsPredictionAccuracy('conception')).toBe(true);
    expect(showsPredictionAccuracy('contraception')).toBe(true);
  });

  it('stays hidden in pregnancy and menopause', () => {
    expect(showsPredictionAccuracy('pregnancy')).toBe(false);
    expect(showsPredictionAccuracy('menopause')).toBe(false);
  });
});
