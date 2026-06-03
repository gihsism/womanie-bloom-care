import { describe, it, expect } from 'vitest';
import { normalizeUnit } from './normalize-unit';

describe('normalizeUnit', () => {
  it('returns null for nullish or blank input', () => {
    expect(normalizeUnit(null)).toBeNull();
    expect(normalizeUnit(undefined)).toBeNull();
    expect(normalizeUnit('')).toBeNull();
    expect(normalizeUnit('   ')).toBeNull();
  });

  it('canonicalizes casing of common per-volume units', () => {
    expect(normalizeUnit('mg/dl')).toBe('mg/dL');
    expect(normalizeUnit('MG/DL')).toBe('mg/dL');
    expect(normalizeUnit('ng/ml')).toBe('ng/mL');
    expect(normalizeUnit('miu/l')).toBe('mIU/L');
    expect(normalizeUnit('mmol/l')).toBe('mmol/L');
    expect(normalizeUnit('pg/ml')).toBe('pg/mL');
  });

  it('unifies all micro variants to the Greek mu', () => {
    expect(normalizeUnit('mcg/L')).toBe('μg/L'); // "mc" prefix
    expect(normalizeUnit('ug/L')).toBe('μg/L'); // ascii u
    expect(normalizeUnit('µg/L')).toBe('μg/L'); // micro sign
    expect(normalizeUnit('umol/L')).toBe('μmol/L');
    expect(normalizeUnit('µmol/L')).toBe('μmol/L');
  });

  it('strips spaces around the divider', () => {
    expect(normalizeUnit('g / dL')).toBe('g/dL');
    expect(normalizeUnit('ng /  mL')).toBe('ng/mL');
  });

  it('handles bare units without a divider', () => {
    expect(normalizeUnit('%')).toBe('%');
    expect(normalizeUnit('fl')).toBe('fL');
  });

  it('leaves exotic or unclassifiable units untouched (notation, not values)', () => {
    expect(normalizeUnit('10^9/L')).toBe('10^9/L');
    expect(normalizeUnit('mIU/mL')).toBe('mIU/mL');
  });

  it('never converts between unit systems', () => {
    // mg/dL stays mg/dL — it is not rewritten to mmol/L.
    expect(normalizeUnit('mg/dL')).toBe('mg/dL');
  });
});
