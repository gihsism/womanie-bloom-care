import { describe, it, expect } from 'vitest';
import {
  keyLabFor, labMetrics, cycleMetric, weightMetric, bpMetric, buildHealthOverview,
  rangeState, sparkGeometry, MAX_POINTS, type LabRow,
} from './healthOverview';

const lab = (title: string, value: string | null, date: string | null, extra: Partial<LabRow> = {}): LabRow => ({
  title, value, unit: 'ng/mL', reference_range: '15-150', status: 'normal', date_recorded: date, document_id: 'doc1', ...extra,
});

describe('keyLabFor', () => {
  it('matches the key labs by name, including common spellings', () => {
    expect(keyLabFor('Ferritin')?.id).toBe('ferritin');
    expect(keyLabFor('Serum Ferritin')?.id).toBe('ferritin');
    expect(keyLabFor('TSH')?.id).toBe('tsh');
    expect(keyLabFor('Thyroid Stimulating Hormone')?.id).toBe('tsh');
    expect(keyLabFor('Vitamin D (25-OH)')?.id).toBe('vitamin-d');
    expect(keyLabFor('25-OH Vitamin D')?.id).toBe('vitamin-d');
    expect(keyLabFor('25-hydroxy D')?.id).toBe('vitamin-d');
    expect(keyLabFor('Vitamin B12')?.id).toBe('b12');
    expect(keyLabFor('Free T4')?.id).toBe('free-t4');
    expect(keyLabFor('AMH')?.id).toBe('amh');
  });

  it('never confuses HbA1c with hemoglobin, or matches unrelated tests', () => {
    expect(keyLabFor('Hemoglobin')?.id).toBe('hemoglobin');
    expect(keyLabFor('Haemoglobin (Hb)')?.id).toBe('hemoglobin');
    expect(keyLabFor('HbA1c')?.id).toBe('hba1c');
    expect(keyLabFor('Hemoglobin A1c')?.id).toBe('hba1c');
    expect(keyLabFor('Mean corpuscular hemoglobin')).toBeNull();
    expect(keyLabFor('Free T3')).toBeNull();
    expect(keyLabFor('Iron')).toBeNull();
    expect(keyLabFor('')).toBeNull();
    expect(keyLabFor(null)).toBeNull();
  });
});

describe('rangeState', () => {
  it('judges against both or one bound', () => {
    expect(rangeState(10, { low: 15, high: 150 })).toBe('low');
    expect(rangeState(200, { low: 15, high: 150 })).toBe('high');
    expect(rangeState(15, { low: 15, high: 150 })).toBe('in');
    expect(rangeState(3, { low: null, high: 4 })).toBe('in');
    expect(rangeState(5, null)).toBe('none');
  });
});

describe('labMetrics', () => {
  it('builds a series per key lab, last value + date + range state, link to the latest document', () => {
    const [m] = labMetrics([
      lab('Ferritin', '40', '2025-03-01', { document_id: 'a' }),
      lab('Ferritin', '9', '2026-02-01', { document_id: 'b', status: 'abnormal' }),
      lab('Ferritin', '22', '2025-09-01', { document_id: 'c' }),
    ]);
    expect(m.id).toBe('ferritin');
    expect(m.points.map(p => p.value)).toEqual([40, 22, 9]);
    expect(m.last).toEqual({ display: '9', date: '2026-02-01' });
    expect(m.state).toBe('low');
    expect(m.rangeText).toBe('15–150');
    expect(m.link).toBe('/dashboard/medical-history?doc=b');
  });

  it('uses the latest reading\'s range (one-sided ranges too)', () => {
    const [m] = labMetrics([lab('TSH', '5.2', '2026-01-01', { unit: 'mIU/L', reference_range: '< 4.0' })]);
    expect(m.state).toBe('high');
    expect(m.rangeText).toBe('under 4');
  });

  it('falls back to the stored status when the report gives no parseable range', () => {
    const [a] = labMetrics([lab('Ferritin', '9', '2026-01-01', { reference_range: null, status: 'abnormal' })]);
    expect(a.state).toBe('out');
    const [b] = labMetrics([lab('Ferritin', '30', '2026-01-01', { reference_range: 'see note', status: 'normal' })]);
    expect(b.state).toBe('in');
    expect(b.rangeText).toBe('see note');
    const [c] = labMetrics([lab('Ferritin', '30', '2026-01-01', { reference_range: null, status: null })]);
    expect(c.state).toBe('none');
  });

  it('keeps only readings in the latest unit on one line (vitamin D ng/mL vs nmol/L)', () => {
    const [m] = labMetrics([
      lab('Vitamin D', '20', '2025-01-01', { unit: 'ng/mL', reference_range: '30-100' }),
      lab('Vitamin D', '75', '2026-01-01', { unit: 'nmol/L', reference_range: '75-250' }),
      lab('Vitamin D', '60', '2025-06-01', { unit: 'nmol / l', reference_range: '75-250' }),
    ]);
    expect(m.points).toEqual([{ date: '2025-06-01', value: 60 }, { date: '2026-01-01', value: 75 }]);
    expect(m.unit).toBe('nmol/L');
    expect(m.state).toBe('in');
  });

  it('skips non-numeric values, missing dates and tests that are not key labs; orders by KEY_LABS', () => {
    const out = labMetrics([
      lab('TSH', '2.1', '2026-01-01', { reference_range: '0.4-4.0' }),
      lab('Ferritin', 'pending', '2026-01-01'),
      lab('Ferritin', '30', null),
      lab('Glucose', '90', '2026-01-01'),
      lab('Ferritin', '30,5', '2026-01-02'),
    ]);
    expect(out.map(m => m.id)).toEqual(['ferritin', 'tsh']);
    expect(out[0].points).toEqual([{ date: '2026-01-02', value: 30.5 }]);
  });

  it('one point per date, capped at MAX_POINTS', () => {
    const rows: LabRow[] = [];
    for (let i = 0; i < 40; i++) rows.push(lab('Ferritin', String(i), `2024-01-${String((i % 28) + 1).padStart(2, '0')}`));
    rows.push(...Array.from({ length: 30 }, (_, i) => lab('Ferritin', '50', `2025-${String((i % 12) + 1).padStart(2, '0')}-${String(Math.floor(i / 12) + 1).padStart(2, '0')}`)));
    const [m] = labMetrics(rows);
    expect(m.points.length).toBe(MAX_POINTS);
    expect(new Set(m.points.map(p => p.date)).size).toBe(m.points.length);
  });
});

describe('cycleMetric', () => {
  it('cycle length between consecutive starts, judged against 21–35', () => {
    const m = cycleMetric(['2026-01-01', '2026-01-29', '2026-03-10'])!;
    expect(m.points).toEqual([{ date: '2026-01-01', value: 28 }, { date: '2026-01-29', value: 40 }]);
    expect(m.last).toEqual({ display: '40', date: '2026-01-29' });
    expect(m.state).toBe('high');
    expect(m.link).toBe('/dashboard');
  });

  it('ignores gaps that are missed logs, duplicates and bad dates; null with fewer than two starts', () => {
    const m = cycleMetric(['2025-01-01', '2025-07-01', '2025-07-29', '2025-07-29', 'nope', null])!;
    expect(m.points).toEqual([{ date: '2025-07-01', value: 28 }]);
    expect(m.state).toBe('in');
    expect(cycleMetric(['2026-01-01'])).toBeNull();
    expect(cycleMetric([])).toBeNull();
  });
});

describe('weightMetric', () => {
  it('merges the pregnancy and postpartum logs by date, no range', () => {
    const m = weightMetric(
      [{ date: '2026-01-01', kg: 60 }, { date: '2026-02-01', kg: '62.44' }],
      { entries: [{ date: '2026-05-01', kg: 64 }, { date: '2026-06-01', kg: 5 }] },
    )!;
    expect(m.points.map(p => p.value)).toEqual([60, 62.4, 64]);
    expect(m.last).toEqual({ display: '64.0', date: '2026-05-01' });
    expect(m.state).toBe('none');
    expect(m.rangeText).toBeNull();
  });

  it('null without readings or with junk', () => {
    expect(weightMetric(null, null)).toBeNull();
    expect(weightMetric('x', { entries: 'y' })).toBeNull();
  });
});

describe('bpMetric', () => {
  it('systolic + diastolic lines, last reading per day, high at 140/90', () => {
    const m = bpMetric([
      { date: '2026-01-01', systolic: 118, diastolic: 76 },
      { date: '2026-01-02', systolic: 135, diastolic: 85 },
      { date: '2026-01-02', systolic: 142, diastolic: 88 },
    ])!;
    expect(m.points.map(p => p.value)).toEqual([118, 142]);
    expect(m.secondary!.map(p => p.value)).toEqual([76, 88]);
    expect(m.last).toEqual({ display: '142/88', date: '2026-01-02' });
    expect(m.state).toBe('high');
    expect(m.rangeText).toBe('under 140/90');
  });

  it('diastolic alone can make it high; in range below both', () => {
    expect(bpMetric([{ date: '2026-01-01', systolic: 120, diastolic: 92 }])!.state).toBe('high');
    expect(bpMetric([{ date: '2026-01-01', systolic: 120, diastolic: 80 }])!.state).toBe('in');
  });

  it('drops implausible readings; null without any', () => {
    expect(bpMetric([{ date: '2026-01-01', systolic: 400, diastolic: 80 }])).toBeNull();
    expect(bpMetric(undefined)).toBeNull();
  });
});

describe('buildHealthOverview', () => {
  it('body measures first, then labs; leaves out what she has no data for', () => {
    const out = buildHealthOverview({
      labs: [lab('TSH', '2', '2026-01-01', { reference_range: '0.4-4' }), lab('Ferritin', '30', '2026-01-01')],
      periodStarts: ['2026-01-01', '2026-01-29'],
      pregWeightLog: null,
      maternalWeight: null,
      bpLog: [{ date: '2026-01-01', systolic: 110, diastolic: 70 }],
    });
    expect(out.map(m => m.id)).toEqual(['cycle', 'bp', 'ferritin', 'tsh']);
  });

  it('empty when she has nothing yet (any stage)', () => {
    expect(buildHealthOverview({ labs: [], periodStarts: [], pregWeightLog: null, maternalWeight: null, bpLog: null })).toEqual([]);
  });
});

describe('sparkGeometry', () => {
  it('spaces points by time and puts higher values higher', () => {
    const g = sparkGeometry([[{ date: '2026-01-01', value: 10 }, { date: '2026-01-02', value: 20 }, { date: '2026-01-11', value: 10 }]], null, 100, 20, 0)!;
    expect(g.paths[0]).toBe('M0 20 L10 0 L100 20');
    expect(g.end).toEqual({ x: 100, y: 20 });
    expect(g.band).toBeNull();
  });

  it('includes the range in the scale and returns the band', () => {
    const g = sparkGeometry([[{ date: '2026-01-01', value: 10 }, { date: '2026-02-01', value: 12 }]], { low: 15, high: 20 }, 100, 20, 0)!;
    expect(g.band).toEqual({ y1: 0, y2: 10 });
    // Both values below the band.
    expect(g.end.y).toBeGreaterThan(g.band!.y2);
  });

  it('a single reading sits in the middle; empty input gives null', () => {
    const g = sparkGeometry([[{ date: '2026-01-01', value: 5 }]], null, 100, 20, 0)!;
    expect(g.end).toEqual({ x: 50, y: 10 });
    expect(sparkGeometry([[]], null, 100, 20)).toBeNull();
  });

  it('draws a second series (diastolic) in the same scale', () => {
    const g = sparkGeometry([
      [{ date: '2026-01-01', value: 120 }, { date: '2026-01-02', value: 130 }],
      [{ date: '2026-01-01', value: 80 }, { date: '2026-01-02', value: 90 }],
    ], null, 100, 50, 0)!;
    expect(g.paths).toHaveLength(2);
    expect(g.paths[1]).toBe('M0 50 L100 40');
  });
});
