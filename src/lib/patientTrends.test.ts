import { describe, it, expect } from 'vitest';
import { bbtTrend, bpTrend, buildTrends, cycleTrend, hasAnyTrend, periodTrend, symptomTrend, weightTrend } from './patientTrends';

const starts = (...d: string[]) => d.map(start => ({ start, end: null }));

describe('cycleTrend', () => {
  it('summarises regular cycles', () => {
    const t = cycleTrend(starts('2026-05-01', '2026-05-29', '2026-06-27', '2026-07-24', '2026-08-23'))!;
    expect(t.points.map(p => p.value)).toEqual([28, 29, 27, 30]);
    expect(t.summary).toBe('Cycles 27–30 days, regular (last 4).');
  });

  it('flags irregular cycles and ones outside 24–38', () => {
    const t = cycleTrend(starts('2026-03-01', '2026-03-25', '2026-05-05', '2026-06-02'))!;
    expect(t.summary).toMatch(/irregular \(varies by 17 days\); 1 outside 24–38 days \(FIGO\)/);
  });

  it('drops gaps that are missed logs and needs two cycles', () => {
    expect(cycleTrend(starts('2026-01-01', '2026-06-01', '2026-06-29'))).toBeNull();
    expect(cycleTrend(starts('2026-06-01'))).toBeNull();
  });

  it('keeps the last 12 cycles', () => {
    const d: string[] = [];
    for (let i = 0; i < 16; i++) d.push(new Date(Date.UTC(2025, 0, 1 + i * 28)).toISOString().slice(0, 10));
    expect(cycleTrend(starts(...d))!.points).toHaveLength(12);
  });
});

describe('periodTrend', () => {
  it('counts start and end day, notes long periods', () => {
    const t = periodTrend([
      { start: '2026-06-01', end: '2026-06-05' },
      { start: '2026-06-29', end: '2026-07-07' },
      { start: '2026-07-27', end: null },
    ])!;
    expect(t.points.map(p => p.value)).toEqual([5, 9]);
    expect(t.summary).toBe('Periods 5–9 days, 1 longer than 7 days (last 2).');
  });
  it('is null without two logged ends', () => {
    expect(periodTrend([{ start: '2026-06-01', end: '2026-06-05' }])).toBeNull();
  });
});

describe('weight, blood pressure, temperature', () => {
  it('weight change over weeks', () => {
    const t = weightTrend([{ date: '2026-06-01', kg: 62 }, { date: '2026-09-07', kg: 65.5 }])!;
    expect(t.summary).toBe('62.0 → 65.5 kg over 14 weeks (+3.5 kg).');
    expect(weightTrend([{ date: '2026-06-01', kg: 62 }])).toBeNull();
  });

  it('blood pressure counts readings at or above 140/90', () => {
    const t = bpTrend([
      { date: '2026-10-01', systolic: 118, diastolic: 76 },
      { date: '2026-10-08', systolic: 142, diastolic: 88 },
      { date: '2026-10-15', systolic: 130, diastolic: 90 },
    ])!;
    expect(t.summary).toBe('Latest 130/90 (15 Oct); 2 of 3 readings at or above 140/90.');
    expect(bpTrend([
      { date: '2026-10-01', systolic: 118, diastolic: 76 },
      { date: '2026-10-08', systolic: 120, diastolic: 78 },
    ])!.summary).toMatch(/all 2 readings below 140\/90/);
  });

  it('temperature needs three readings', () => {
    const sig = (date: string, bbt: number | null) => ({ date, symptoms: [], bbt });
    expect(bbtTrend([sig('2026-10-01', 36.4), sig('2026-10-02', 36.5)])).toBeNull();
    expect(bbtTrend([sig('2026-10-01', 36.4), sig('2026-10-02', null), sig('2026-10-03', 36.5), sig('2026-10-04', 36.8)])!.summary)
      .toBe('3 readings in 90 days, 36.40–36.80 °C.');
  });
});

describe('symptomTrend', () => {
  it('counts days per symptom, most frequent first', () => {
    const t = symptomTrend([
      { date: '2026-10-01', symptoms: ['cramps', 'headache'], bbt: null },
      { date: '2026-10-02', symptoms: ['cramps'], bbt: null },
      { date: '2026-10-03', symptoms: [], bbt: null },
      { date: '2026-10-04', symptoms: ['Cramps', 'mood_swings'], bbt: null },
    ])!;
    expect(t.counts[0]).toEqual({ name: 'Cramps', days: 3 });
    expect(t.counts.map(c => c.name)).toContain('Mood swings');
    expect(t.summary).toBe('Most often: cramps (3 days), headache (1 day). Symptoms logged on 3 of the last 90 days.');
  });
});

describe('buildTrends', () => {
  it('copes with an empty or broken payload', () => {
    expect(hasAnyTrend(buildTrends(null))).toBe(false);
    expect(hasAnyTrend(buildTrends({ periods: 'x' as never }))).toBe(false);
  });
});
