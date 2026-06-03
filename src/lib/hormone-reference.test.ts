import { describe, it, expect } from 'vitest';
import {
  assessAmh,
  hormoneKeyForTitle,
  cyclePhaseForDay,
  parseLabValue,
  getPhaseRange,
} from './hormone-reference';

describe('assessAmh', () => {
  it('returns null without a value or age', () => {
    expect(assessAmh(null, 30)).toBeNull();
    expect(assessAmh(2.0, null)).toBeNull();
  });

  it('returns null for out-of-plausible-range values or ages', () => {
    expect(assessAmh(-1, 30)).toBeNull();
    expect(assessAmh(51, 30)).toBeNull();
    expect(assessAmh(2.0, 9)).toBeNull();
    expect(assessAmh(2.0, 101)).toBeNull();
    expect(assessAmh(Number.NaN, 30)).toBeNull();
  });

  // Age 30 → bracket 30–34: p5 0.7, median 2.5, p95 5.5.
  it('flags below-p5 as diminished reserve', () => {
    const r = assessAmh(0.5, 30);
    expect(r?.reserveLabel).toBe('diminished');
    expect(r?.percentileBucket).toBe('very_low');
    expect(r?.ageBracket).toBe('30–34');
    expect(r?.note).toMatch(/5th percentile/i);
  });

  it('labels below half-median (but above p5) as low_average', () => {
    const r = assessAmh(1.0, 30); // >= 0.7, < 1.25 (median*0.5)
    expect(r?.reserveLabel).toBe('low_average');
    expect(r?.percentileBucket).toBe('low');
  });

  it('labels around the median as average', () => {
    const r = assessAmh(2.0, 30); // within [1.25, 3.5]
    expect(r?.reserveLabel).toBe('average');
    expect(r?.percentileBucket).toBe('average');
  });

  it('labels above median (but <= p95) as good', () => {
    const r = assessAmh(4.0, 30); // > 3.5, <= 5.5
    expect(r?.reserveLabel).toBe('good');
    expect(r?.percentileBucket).toBe('high');
  });

  it('labels above p95 as high', () => {
    const r = assessAmh(6.0, 30); // > 5.5
    expect(r?.reserveLabel).toBe('high');
    expect(r?.percentileBucket).toBe('very_high');
    expect(r?.note).toMatch(/PCOS/i);
  });

  it('renders the open-ended bracket as "50+"', () => {
    const r = assessAmh(0.1, 55);
    expect(r?.ageBracket).toBe('50+');
  });
});

describe('hormoneKeyForTitle', () => {
  it('maps canonical abbreviations', () => {
    expect(hormoneKeyForTitle('AMH')).toBe('amh');
    expect(hormoneKeyForTitle('FSH')).toBe('fsh');
    expect(hormoneKeyForTitle('LH')).toBe('lh');
    expect(hormoneKeyForTitle('TSH')).toBe('tsh');
    expect(hormoneKeyForTitle('E2')).toBe('estradiol');
  });

  it('maps spelled-out names including the umlaut form', () => {
    expect(hormoneKeyForTitle('Anti-Müllerian Hormone')).toBe('amh');
    expect(hormoneKeyForTitle('Follicle-stimulating hormone')).toBe('fsh');
    expect(hormoneKeyForTitle('Luteinizing hormone')).toBe('lh');
  });

  it('distinguishes free vs total testosterone', () => {
    expect(hormoneKeyForTitle('Testosterone')).toBe('testosterone_total');
    expect(hormoneKeyForTitle('Testosterone Total')).toBe('testosterone_total');
    expect(hormoneKeyForTitle('Free Testosterone')).toBe('testosterone_free');
    expect(hormoneKeyForTitle('Testosterone Free')).toBe('testosterone_free');
  });

  it('returns null for unknown or empty titles', () => {
    expect(hormoneKeyForTitle('Vitamin D')).toBeNull();
    expect(hormoneKeyForTitle('')).toBeNull();
    expect(hormoneKeyForTitle(null)).toBeNull();
    expect(hormoneKeyForTitle(undefined)).toBeNull();
  });
});

describe('cyclePhaseForDay', () => {
  // 28-day cycle → ovulation at day 14.
  it('treats day 0 and negatives as follicular', () => {
    expect(cyclePhaseForDay(0, 28)).toBe('follicular');
    expect(cyclePhaseForDay(-3, 28)).toBe('follicular');
  });

  it('treats the early-mid first half as follicular', () => {
    expect(cyclePhaseForDay(7, 28)).toBe('follicular');
  });

  it('treats the ovulation window (±2 days) as midcycle', () => {
    expect(cyclePhaseForDay(12, 28)).toBe('midcycle');
    expect(cyclePhaseForDay(14, 28)).toBe('midcycle');
    expect(cyclePhaseForDay(16, 28)).toBe('midcycle');
  });

  it('treats the post-ovulation stretch as luteal', () => {
    expect(cyclePhaseForDay(17, 28)).toBe('luteal');
    expect(cyclePhaseForDay(26, 28)).toBe('luteal');
  });

  it('shifts the ovulation window with cycle length', () => {
    // 35-day cycle → ovulation at day 21.
    expect(cyclePhaseForDay(21, 35)).toBe('midcycle');
    expect(cyclePhaseForDay(14, 35)).toBe('follicular');
  });
});

describe('parseLabValue', () => {
  it('passes through finite numbers', () => {
    expect(parseLabValue(3.4)).toBe(3.4);
    expect(parseLabValue(0)).toBe(0);
    expect(parseLabValue(Number.NaN)).toBeNull();
  });

  it('parses plain and unit-suffixed strings', () => {
    expect(parseLabValue('3.4')).toBe(3.4);
    expect(parseLabValue('3.4 ng/mL')).toBe(3.4);
  });

  it('strips comparator prefixes', () => {
    expect(parseLabValue('<0.1')).toBe(0.1);
    expect(parseLabValue('>100')).toBe(100);
    expect(parseLabValue('≥ 5.5')).toBe(5.5);
  });

  it('handles the European decimal comma', () => {
    expect(parseLabValue('3,4')).toBe(3.4);
  });

  it('parses negatives', () => {
    expect(parseLabValue('-2.5')).toBe(-2.5);
  });

  it('returns null when no number is present', () => {
    expect(parseLabValue('not detected')).toBeNull();
    expect(parseLabValue(null)).toBeNull();
    expect(parseLabValue(undefined)).toBeNull();
  });
});

describe('getPhaseRange', () => {
  it('returns the phase-specific range when one exists', () => {
    expect(getPhaseRange('fsh', 'follicular')).toMatchObject({ low: 3, high: 10 });
  });

  it('falls back to the "any" range for single-range hormones', () => {
    expect(getPhaseRange('tsh', 'follicular')).toMatchObject({ low: 0.4, high: 4.0 });
    expect(getPhaseRange('prolactin', 'midcycle')).toMatchObject({ low: 4, high: 23 });
  });
});
