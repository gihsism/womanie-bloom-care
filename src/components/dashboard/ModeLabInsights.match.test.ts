import { describe, it, expect } from 'vitest';
import { matchesTest } from './ModeLabInsights';

const total = { names: ['cholesterol', 'total cholesterol'], exclude: ['ldl', 'hdl', 'vldl'] };
const ldl = { names: ['ldl'] };

describe('lab row matching', () => {
  it('an LDL result fills only the LDL row, not total cholesterol', () => {
    expect(matchesTest('LDL Cholesterol', total)).toBe(false);
    expect(matchesTest('LDL Cholesterol', ldl)).toBe(true);
    expect(matchesTest('HDL-Cholesterol', total)).toBe(false);
  });
  it('total cholesterol still matches', () => {
    expect(matchesTest('Total Cholesterol', total)).toBe(true);
    expect(matchesTest('Cholesterol', total)).toBe(true);
  });
});
