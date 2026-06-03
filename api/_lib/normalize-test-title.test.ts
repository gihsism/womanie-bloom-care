import { describe, it, expect } from 'vitest';
import { normalizeTestTitle } from './normalize-test-title';

describe('normalizeTestTitle', () => {
  it('returns empty string for nullish or blank input', () => {
    expect(normalizeTestTitle(null)).toBe('');
    expect(normalizeTestTitle(undefined)).toBe('');
    expect(normalizeTestTitle('')).toBe('');
    expect(normalizeTestTitle('   ')).toBe('');
  });

  it('collapses hematology aliases to one canonical title', () => {
    expect(normalizeTestTitle('Hb')).toBe('Hemoglobin');
    expect(normalizeTestTitle('HGB')).toBe('Hemoglobin');
    expect(normalizeTestTitle('haemoglobin')).toBe('Hemoglobin');
    expect(normalizeTestTitle('Hemoglobin')).toBe('Hemoglobin');
  });

  it('is case- and punctuation-insensitive on the lookup key', () => {
    expect(normalizeTestTitle('free t4')).toBe('Free T4');
    expect(normalizeTestTitle('Free-T4')).toBe('Free T4');
    expect(normalizeTestTitle('E2')).toBe('Estradiol');
    expect(normalizeTestTitle('anti-tpo')).toBe('Anti-TPO');
    expect(normalizeTestTitle('HbA1c')).toBe('HbA1c');
  });

  it('canonicalizes multi-word aliases', () => {
    expect(normalizeTestTitle('fasting glucose')).toBe('Fasting Glucose');
    expect(normalizeTestTitle('follicle stimulating hormone')).toBe('FSH');
    expect(normalizeTestTitle('Total Testosterone')).toBe('Total Testosterone');
  });

  it('trims and still matches', () => {
    expect(normalizeTestTitle('  Hb  ')).toBe('Hemoglobin');
  });

  it('passes unknown titles through trimmed and unchanged', () => {
    expect(normalizeTestTitle('Some Exotic Marker')).toBe('Some Exotic Marker');
    expect(normalizeTestTitle('  XYZ Panel  ')).toBe('XYZ Panel');
  });
});
