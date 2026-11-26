import { describe, it, expect } from 'vitest';
import { summarise, type DryRunRow } from './lab-value-backfill-dry-run';

const row = (document_id: string, title: string, value: string | null, reference_range: string | null, unit: string | null = null): DryRunRow =>
  ({ document_id, title, value, unit, reference_range, raw_data: null });

describe('lab value backfill dry run', () => {
  it('counts what the shared parser reads differently (counts only)', () => {
    const s = summarise([
      row('ch', 'TSH', '1,250', '0,27 - 4,20', 'mU/l'),
      row('ch', 'Thrombozyten', "265'000", "150'000 - 400'000", '/µl'),
      row('en', 'Estradiol', '1,250', '45.5-854.5', 'pmol/L'),
      row('y', 'Lipase', '1,250', 'see comment', 'U/L'),
      row('x', 'HIV', 'negativ', 'Norm: negativ'),
      row('x', 'CRP', '< 5', 'F: <5 / M: <8', 'mg/l'),
    ]);
    expect(s.labRows).toBe(6);
    // 'x' has German words ("Norm: negativ") -> Swiss decimal comma
    expect(s.documentStyle).toEqual({ comma: 2, point: 1, unknown: 1 });
    // TSH 1.25 = old comma->point reading; platelets/estradiol differ
    expect(s.values.changedVsCommaToPointReader).toBe(2);
    expect(s.values.ambiguousTwoReadings).toBe(1);
    expect(s.values.qualitativeRecognised).toBe(1);
    expect(s.values.boundsRecognised).toBe(1);
    expect(s.ranges.present).toBe(6);
    expect(s.ranges.stillUnreadable).toBe(1);
    expect(s.ranges.qualitative).toBe(1);
    expect(s.ranges.sexSpecificPicked).toBe(1);
    expect(JSON.stringify(s)).not.toMatch(/TSH|Lipase|1,250/);
  });
});
