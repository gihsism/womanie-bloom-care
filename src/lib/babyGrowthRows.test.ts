import { describe, it, expect } from 'vitest';
import { measurementRows, percentileOf, percentileShort } from './babyGrowth';

const local = (iso: string) => iso.slice(0, 10);

describe('percentileShort', () => {
  it('ordinal, clamped like the sentence', () => {
    expect(percentileShort(42.4)).toBe('42nd');
    expect(percentileShort(1.2)).toBe('1st');
    expect(percentileShort(13)).toBe('13th');
    expect(percentileShort(0.3)).toBe('<1st');
    expect(percentileShort(99.7)).toBe('>99th');
  });
});

describe('measurementRows', () => {
  const events = [
    { id: 'a', occurred_at: '2026-01-01T12:00:00.000Z', data: { weight_g: 3346 } },
    { id: 'b', occurred_at: '2026-01-29T12:00:00.000Z', data: { weight_g: 4500, length_cm: 54, head_cm: 37 } },
    { id: 'c', occurred_at: '2026-01-15T12:00:00.000Z', data: { length_cm: 52 } },
    { id: 'd', occurred_at: '2026-01-20T12:00:00.000Z', data: {} },
  ];
  it('newest first, each value with its WHO percentile; empty records left out', () => {
    const rows = measurementRows('2026-01-01', 'male', events, local);
    expect(rows.map(r => r.id)).toEqual(['b', 'c', 'a']);
    expect(rows[0].day).toBe(28);
    expect(rows[0].weight?.value).toBe(4.5);
    expect(rows[0].weight?.percentile).toBeCloseTo(percentileOf('weight', 'male', 28, 4.5) as number, 6);
    expect(rows[0].length?.percentile).toBeCloseTo(percentileOf('length', 'male', 28, 54) as number, 6);
    expect(rows[0].head?.percentile).toBeCloseTo(percentileOf('head', 'male', 28, 37) as number, 6);
    expect(rows[1].weight).toBeNull();
    // The WHO median at birth is the 50th.
    expect(percentileShort(rows[2].weight?.percentile as number)).toBe('50th');
  });
  it('no percentile without the sex or the birth date', () => {
    expect(measurementRows('2026-01-01', null, events, local)[0].weight).toEqual({ value: 4.5, percentile: null });
    const noBirth = measurementRows(null, 'female', events, local);
    expect(noBirth[0].day).toBeNull();
    expect(noBirth[0].weight?.percentile).toBeNull();
  });
  it('no percentile past 24 months', () => {
    const rows = measurementRows('2023-01-01', 'female', [{ id: 'x', occurred_at: '2026-01-01T12:00:00.000Z', data: { weight_g: 14000 } }], local);
    expect(rows[0].weight).toEqual({ value: 14, percentile: null });
  });
});
