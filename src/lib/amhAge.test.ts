import { describe, it, expect } from 'vitest';
import { amhAgeComparison, amhTypicalAge } from './hormone-reference';

describe('amhAgeComparison (soft wording with age)', () => {
  it('typical value for age', () => {
    expect(amhAgeComparison(1.8, 'ng/mL', 36)).toMatchObject({ verdict: 'typical', headline: 'Typical for 36' });
  });
  it('lower value names the age where it is usual', () => {
    const r = amhAgeComparison(0.8, 'ng/mL', 33)!;
    expect(r.verdict).toBe('lower');
    expect(r.headline).toBe('Lower than typical for 33');
    expect(r.typicalAround).toBe('40–42');
    expect(r.detail).not.toMatch(/reserve age/i);
  });
  it('converts pmol/L', () => {
    expect(amhAgeComparison(12.85, 'pmol/L', 36)?.verdict).toBe('typical'); // 1.8 ng/mL
  });
  it('higher value and FSH note', () => {
    expect(amhAgeComparison(5, 'ng/mL', 38)).toMatchObject({ verdict: 'higher', typicalAround: 'under 25' });
    expect(amhAgeComparison(0.3, 'ng/mL', 35, 12)!.detail).toMatch(/FSH/);
  });
  it('typical-age curve is monotone', () => {
    expect(amhTypicalAge(2.5)).toBeCloseTo(32);
    expect(amhTypicalAge(1.2)).toBeCloseTo(39);
    expect(amhTypicalAge(0.01)).toBe(52);
  });
});
