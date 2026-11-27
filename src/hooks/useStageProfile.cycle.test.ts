import { describe, it, expect } from 'vitest';
import { usableCycleLength } from './useStageProfile';

// A period row with no cycle_length froze the stage page (endless loop in
// FertilityForecast) and crashed Home's cycle dial; found by the local e2e
// suite (e2e-local/edge-cases.spec.ts).
describe('usableCycleLength', () => {
  it('keeps a stored length in range', () => {
    expect(usableCycleLength(31)).toBe(31);
    expect(usableCycleLength('26')).toBe(26);
  });

  it('falls back to 28 for missing, zero or implausible values', () => {
    for (const v of [null, undefined, 0, '', 'abc', 3, 120, NaN]) expect(usableCycleLength(v)).toBe(28);
  });
});
