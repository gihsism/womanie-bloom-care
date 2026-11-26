import { describe, it, expect } from 'vitest';
import {
  computeCycleInsights,
  normaliseSymptom,
  phaseOfDay,
  pregnancyBreaksFromBirths,
  regularityVerdict,
  symptomLabel,
  type PeriodLog,
  type SymptomLog,
} from './cycleInsights';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const add = (s: string, n: number) => iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * DAY));

/** Period starts from a first date and a list of cycle lengths. */
function periodsFrom(first: string, lengths: number[], periodDays: number | null = 5): PeriodLog[] {
  const out: PeriodLog[] = [];
  let d = first;
  for (let i = 0; i <= lengths.length; i++) {
    out.push({ period_start_date: d, period_end_date: periodDays == null ? null : add(d, periodDays - 1) });
    if (i < lengths.length) d = add(d, lengths[i]);
  }
  return out;
}

describe('regularityVerdict (FIGO 2018)', () => {
  it('≤7 days regular, 8–9 a bit variable, ≥10 irregular', () => {
    expect(regularityVerdict(0)).toBe('regular');
    expect(regularityVerdict(7)).toBe('regular');
    expect(regularityVerdict(8)).toBe('a bit variable');
    expect(regularityVerdict(9)).toBe('a bit variable');
    expect(regularityVerdict(10)).toBe('irregular');
  });
});

describe('phaseOfDay', () => {
  it('classifies by period length and days before the next period', () => {
    expect(phaseOfDay(0, 28, 5)).toBe('period');
    expect(phaseOfDay(4, 24, 5)).toBe('period');
    expect(phaseOfDay(5, 23, 5)).toBe('follicular');
    expect(phaseOfDay(14, 14, 5)).toBe('ovulation');
    expect(phaseOfDay(20, 8, 5)).toBe('luteal');
    expect(phaseOfDay(26, 2, 5)).toBe('premenstrual');
    expect(phaseOfDay(27, 1, 5)).toBe('premenstrual');
  });
  it('returns null when the next start is unknown outside the period', () => {
    expect(phaseOfDay(10, null, 5)).toBeNull();
    expect(phaseOfDay(2, null, 5)).toBe('period');
    expect(phaseOfDay(-1, 10, 5)).toBeNull();
  });
});

describe('symptom names', () => {
  it('normalises the different spellings the app has stored', () => {
    expect(normaliseSymptom('Breast tenderness')).toBe('breast_tenderness');
    expect(normaliseSymptom('tender_breasts')).toBe('breast_tenderness');
    expect(normaliseSymptom(' Headache ')).toBe('headache');
    expect(normaliseSymptom('Headaches')).toBe('headache');
    expect(normaliseSymptom('Back pain')).toBe('back_pain');
    expect(normaliseSymptom('Hot flashes')).toBe('hot_flashes');
  });
  it('labels known and unknown symptoms', () => {
    expect(symptomLabel('headache')).toBe('Headaches');
    expect(symptomLabel('something_new')).toBe('Something new');
  });
});

describe('computeCycleInsights: averages and regularity', () => {
  it('nothing logged: empty, no notes, no doctor line', () => {
    const r = computeCycleInsights({ periods: [], today: '2026-06-01' });
    expect(r.cycleCount).toBe(0);
    expect(r.avgCycleLength).toBeNull();
    expect(r.summary).toBeNull();
    expect(r.confidenceNote).toBeNull();
    expect(r.doctorLine).toBeNull();
  });

  it('one period only: confidence note, period length, no cycle length', () => {
    const r = computeCycleInsights({
      periods: [{ period_start_date: '2026-05-20', period_end_date: '2026-05-24' }],
      today: '2026-06-01',
    });
    expect(r.cycleCount).toBe(0);
    expect(r.avgCycleLength).toBeNull();
    expect(r.avgPeriodLength).toBe(5);
    expect(r.confidenceNote).toMatch(/one period logged/);
    expect(r.summary).toBe('Your period lasted about 5 days.');
  });

  it('a single cycle: average but no regularity verdict, first-look note', () => {
    const r = computeCycleInsights({ periods: periodsFrom('2026-04-01', [29]), today: '2026-05-05' });
    expect(r.cycleCount).toBe(1);
    expect(r.avgCycleLength).toBe(29);
    expect(r.regularity).toBeNull();
    expect(r.variation).toBeNull();
    expect(r.confidenceNote).toMatch(/1 cycle so far/);
    expect(r.summary).toMatch(/averages 29 days/);
  });

  it('two cycles still carries the confidence note', () => {
    const r = computeCycleInsights({ periods: periodsFrom('2026-03-01', [28, 30]), today: '2026-04-30' });
    expect(r.cycleCount).toBe(2);
    expect(r.confidenceNote).toMatch(/2 cycles so far/);
    expect(r.regularity).toBe('regular');
  });

  it('regular cycles: verdict, range and normal-range sentence; no note at 3+', () => {
    const r = computeCycleInsights({ periods: periodsFrom('2026-01-01', [28, 30, 27, 29]), today: '2026-05-10' });
    expect(r.cycleCount).toBe(4);
    expect(r.avgCycleLength).toBe(28.5);
    expect(r.variation).toBe(3);
    expect(r.regularity).toBe('regular');
    expect(r.confidenceNote).toBeNull();
    expect(r.summary).toContain('regular: your cycles ranged from 27 to 30 days');
    expect(r.summary).toContain('anywhere from 24 to 38 days');
    expect(r.avgPeriodLength).toBe(5);
    expect(r.doctorLine).toBeNull();
  });

  it('a bit variable and irregular', () => {
    expect(computeCycleInsights({ periods: periodsFrom('2026-01-01', [26, 34, 30]), today: '2026-04-15' }).regularity)
      .toBe('a bit variable');
    const irr = computeCycleInsights({ periods: periodsFrom('2026-01-01', [25, 37, 30]), today: '2026-04-15' });
    expect(irr.regularity).toBe('irregular');
    expect(irr.summary).toContain('irregular');
  });

  it('uses only the 6 most recent cycles', () => {
    const r = computeCycleInsights({ periods: periodsFrom('2025-01-01', [45, 45, 28, 28, 28, 28, 28, 28]), today: '2025-12-01' });
    expect(r.cycleCount).toBe(6);
    expect(r.avgCycleLength).toBe(28);
  });

  it('period length ignores missing or implausible end dates', () => {
    const periods: PeriodLog[] = [
      { period_start_date: '2026-01-01', period_end_date: '2026-01-04' },
      { period_start_date: '2026-01-29', period_end_date: null },
      { period_start_date: '2026-02-26', period_end_date: '2026-04-30' }, // forgot to end it
      { period_start_date: '2026-03-26', period_end_date: '2026-03-31' },
    ];
    const r = computeCycleInsights({ periods, today: '2026-04-10' });
    expect(r.periodCount).toBe(2);
    expect(r.avgPeriodLength).toBe(5);
  });

  it('duplicate start dates and unparseable dates are ignored', () => {
    const periods: PeriodLog[] = [
      ...periodsFrom('2026-01-01', [28, 28, 28]),
      { period_start_date: '2026-01-29', period_end_date: null },
      { period_start_date: 'garbage' },
    ];
    const r = computeCycleInsights({ periods, today: '2026-04-01' });
    expect(r.cycleCount).toBe(3);
    expect(r.avgCycleLength).toBe(28);
  });

  it('accepts timestamps as well as plain dates', () => {
    const periods = periodsFrom('2026-01-01', [28, 28]).map(p => ({ ...p, period_start_date: `${p.period_start_date}T00:00:00.000Z` }));
    expect(computeCycleInsights({ periods, today: '2026-03-01' }).avgCycleLength).toBe(28);
  });
});

describe('computeCycleInsights: gaps in logging', () => {
  it('a long gap between logged periods is skipped, not counted as a cycle', () => {
    // 28, 28, then 4 months not logged, then 29, 29
    const periods = [
      ...periodsFrom('2025-09-01', [28, 28]),
      ...periodsFrom('2026-01-27', [29, 29]),
    ];
    const r = computeCycleInsights({ periods, today: '2026-03-30' });
    expect(r.skippedGaps).toBe(1);
    expect(r.cycleCount).toBe(4);
    expect(r.longestCycle).toBe(29);
    expect(r.doctorFlags).toEqual([]);
  });

  it('a spotting entry a few days after a period does not create a short cycle', () => {
    const periods = [...periodsFrom('2026-01-01', [28, 28, 28]), { period_start_date: '2026-01-10' }];
    const r = computeCycleInsights({ periods, today: '2026-04-01' });
    expect(r.shortestCycle).toBeGreaterThanOrEqual(24);
    expect(r.doctorFlags).toEqual([]);
  });
});

describe('computeCycleInsights: pregnancy break', () => {
  it('a gap that contains a birth is left out quietly (not a skipped gap, no flag)', () => {
    const before = periodsFrom('2024-01-01', [28, 28, 28]);
    const after = periodsFrom('2025-08-01', [30, 30]);
    const breaks = pregnancyBreaksFromBirths(['2025-05-01']);
    const r = computeCycleInsights({ periods: [...before, ...after], breaks, today: '2025-10-15' });
    expect(r.skippedGaps).toBe(0);
    expect(r.cycleCount).toBe(5);
    expect(r.doctorFlags).toEqual([]);
  });

  it('no 90-day flag while she is inside a pregnancy break', () => {
    const periods = periodsFrom('2025-01-01', [28, 28]);
    const breaks = [{ start: '2025-02-20', end: '2025-12-31' }];
    const r = computeCycleInsights({ periods, breaks, today: '2025-08-01' });
    expect(r.doctorFlags.find(f => f.kind === 'no-period')).toBeUndefined();
  });

  it('builds breaks from birth dates and ignores empty ones', () => {
    expect(pregnancyBreaksFromBirths(['2025-05-01', null, '', undefined])).toEqual([
      { start: '2024-07-25', end: '2025-06-26' },
    ]);
  });

  it('symptoms logged inside the break are not counted', () => {
    const periods = periodsFrom('2024-01-01', [28, 28]);
    const breaks = [{ start: '2024-02-20', end: '2024-12-01' }];
    const symptoms: SymptomLog[] = [{ signal_date: '2024-03-01', symptoms: ['Nausea'] }];
    const r = computeCycleInsights({ periods, symptoms, breaks, today: '2024-06-01' });
    expect(Object.keys(r.symptomsByPhase)).toEqual([]);
  });
});

describe('computeCycleInsights: symptoms per phase', () => {
  const periods = periodsFrom('2026-01-01', [28, 28, 28, 28]); // starts Jan 1, Jan 29, Feb 26, Mar 26, Apr 23
  const starts = periods.map(p => p.period_start_date);

  it('finds a pre-period headache pattern across cycles', () => {
    const symptoms: SymptomLog[] = [];
    for (const s of starts.slice(1)) {
      symptoms.push({ signal_date: add(s, -1), symptoms: ['Headache'] });
      symptoms.push({ signal_date: add(s, -2), symptoms: ['headache', 'Bloating'] });
    }
    // Cramps on day 1 of each period
    for (const s of starts.slice(0, 4)) symptoms.push({ signal_date: s, symptoms: ['Cramps'] });
    const r = computeCycleInsights({ periods, symptoms, today: '2026-04-25' });
    const headache = r.symptomSentences.find(x => x.key === 'headache');
    expect(headache?.sentence).toBe('Headaches show up mostly 1–2 days before your period.');
    expect(headache?.phase).toBe('premenstrual');
    expect(r.symptomSentences.find(x => x.key === 'bloating')?.sentence).toBe('Bloating shows up mostly 2 days before your period.');
    expect(r.symptomSentences.find(x => x.key === 'cramps')?.sentence).toBe('Cramps show up mostly on day 1 of your period.');
    expect(r.symptomsByPhase.premenstrual?.[0]).toEqual({ label: 'Headaches', count: 8 });
    expect(r.symptomsByPhase.period?.[0].label).toBe('Cramps');
  });

  it('counts period days of the current cycle (start known) but not later days', () => {
    const symptoms: SymptomLog[] = [
      { signal_date: '2026-04-23', symptoms: ['Cramps'] },
      { signal_date: '2026-04-24', symptoms: ['Cramps'] },
      { signal_date: '2026-05-05', symptoms: ['Acne'] },
      { signal_date: '2026-05-06', symptoms: ['Acne'] },
    ];
    const r = computeCycleInsights({ periods, symptoms, today: '2026-05-10' });
    expect(r.symptomsByPhase.period?.[0]).toEqual({ label: 'Cramps', count: 2 });
    expect(JSON.stringify(r.symptomsByPhase)).not.toContain('Breakouts');
  });

  it('needs repetition: one cycle only or scattered phases give no sentence', () => {
    const oneCycle: SymptomLog[] = [
      { signal_date: add(starts[1], -1), symptoms: ['Headache'] },
      { signal_date: add(starts[1], -2), symptoms: ['Headache'] },
      { signal_date: add(starts[1], -3), symptoms: ['Headache'] },
    ];
    expect(computeCycleInsights({ periods, symptoms: oneCycle, today: '2026-04-25' }).symptomSentences).toEqual([]);

    const scattered: SymptomLog[] = [
      { signal_date: add(starts[0], 0), symptoms: ['Fatigue'] },
      { signal_date: add(starts[0], 8), symptoms: ['Fatigue'] },
      { signal_date: add(starts[1], -14), symptoms: ['Fatigue'] },
      { signal_date: add(starts[2], -8), symptoms: ['Fatigue'] },
      { signal_date: add(starts[3], -2), symptoms: ['Fatigue'] },
    ];
    expect(computeCycleInsights({ periods, symptoms: scattered, today: '2026-04-25' }).symptomSentences).toEqual([]);
  });

  it('ignores symptoms across a logging gap, future days, empty and duplicate days', () => {
    const gapPeriods = [...periodsFrom('2025-06-01', [28]), ...periodsFrom('2025-12-01', [28, 28])];
    const symptoms: SymptomLog[] = [
      { signal_date: '2025-09-01', symptoms: ['Headache'] }, // inside the unlogged gap
      { signal_date: '2025-09-02', symptoms: ['Headache'] },
      { signal_date: '2025-09-03', symptoms: ['Headache'] },
      { signal_date: '2025-12-02', symptoms: null },
      { signal_date: '2025-12-02', symptoms: [] },
      { signal_date: '2027-01-01', symptoms: ['Cramps'] },
    ];
    const r = computeCycleInsights({ periods: gapPeriods, symptoms, today: '2026-02-01' });
    expect(r.symptomSentences).toEqual([]);
    expect(Object.keys(r.symptomsByPhase)).toEqual([]);
  });

  it('describes ovulation, luteal and follicular timing in plain words', () => {
    const symptoms: SymptomLog[] = [];
    for (const s of starts.slice(1)) {
      symptoms.push({ signal_date: add(s, -14), symptoms: ['Back pain'] });
      symptoms.push({ signal_date: add(s, -8), symptoms: ['Cravings'] });
    }
    for (const s of starts.slice(0, 4)) symptoms.push({ signal_date: add(s, 7), symptoms: ['Acne'] });
    const r = computeCycleInsights({ periods, symptoms, today: '2026-04-25' });
    const by = Object.fromEntries(r.symptomSentences.map(x => [x.key, x.sentence]));
    expect(by.back_pain).toMatch(/around ovulation/);
    expect(by.cravings).toMatch(/second half of your cycle/);
    expect(by.acne).toMatch(/after your period ends/);
  });
});

describe('computeCycleInsights: talk-to-a-doctor line', () => {
  it('silent when everything is inside FIGO ranges', () => {
    const r = computeCycleInsights({ periods: periodsFrom('2026-01-01', [24, 38, 30], 8), today: '2026-04-15' });
    expect(r.doctorFlags).toEqual([]);
    expect(r.doctorLine).toBeNull();
  });

  it('one short or long cycle is not "repeatedly"', () => {
    const r = computeCycleInsights({ periods: periodsFrom('2026-01-01', [22, 28, 42, 28]), today: '2026-05-15' });
    expect(r.doctorFlags).toEqual([]);
  });

  it('repeated short cycles (<24 days)', () => {
    const r = computeCycleInsights({ periods: periodsFrom('2026-01-01', [21, 22, 28]), today: '2026-03-20' });
    expect(r.doctorFlags.map(f => f.kind)).toEqual(['short-cycles']);
    expect(r.doctorLine).toMatch(/isn’t a diagnosis/);
    expect(r.doctorLine).not.toMatch(/haven’t logged/);
  });

  it('repeated long cycles (>38 days)', () => {
    const r = computeCycleInsights({ periods: periodsFrom('2026-01-01', [40, 45, 30]), today: '2026-05-10' });
    expect(r.doctorFlags.map(f => f.kind)).toEqual(['long-cycles']);
    expect(r.doctorFlags[0].text).toBe('2 of your recent cycles were longer than 38 days.');
  });

  it('repeated periods longer than 8 days', () => {
    const r = computeCycleInsights({ periods: periodsFrom('2026-01-01', [28, 28], 10), today: '2026-03-01' });
    expect(r.doctorFlags.map(f => f.kind)).toEqual(['long-periods']);
  });

  it('no period for 90 days, with a hint to log a missed one', () => {
    const r = computeCycleInsights({ periods: periodsFrom('2026-01-01', [28, 28]), today: '2026-05-27' });
    const flag = r.doctorFlags.find(f => f.kind === 'no-period');
    expect(flag?.text).toBe('Your last logged period started 90 days ago.');
    expect(r.doctorLine).toMatch(/add it and this note will go away/);
    expect(computeCycleInsights({ periods: periodsFrom('2026-01-01', [28, 28]), today: '2026-05-26' }).doctorFlags).toEqual([]);
  });

  it('the wording stays calm (no alarming words)', () => {
    const r = computeCycleInsights({ periods: periodsFrom('2026-01-01', [21, 21, 21], 10), today: '2026-08-01' });
    const all = [r.doctorLine, ...r.doctorFlags.map(f => f.text)].join(' ');
    expect(all).not.toMatch(/urgent|danger|abnormal|disease|immediately|warning/i);
  });
});
