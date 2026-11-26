import { describe, it, expect } from 'vitest';
import {
  stageLines, lastCycles, medicineLines, summariseSignals, countSentence, openQuestions,
  recentResults, documentNames, footerLine, defaultSelection, selectedSections, localDate,
  humanLabel, parseDay, isoDay, SECTION_ORDER,
} from './visitSummary';

const NOW = new Date(2026, 10, 25, 10, 0); // 25 Nov 2026, local
const L = 'en-GB';

describe('stageLines', () => {
  it('pregnancy: week+day from the due date', () => {
    // due 280 days after 2026-05-01 -> today is day 208 = 29+5
    const due = new Date(2026, 4, 1 + 280);
    const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    const lines = stageLines({ stage: 'pregnancy', dueDate: iso, now: NOW, locale: L });
    expect(lines[0]).toMatch(/^Life stage: /);
    expect(lines[1]).toBe(`Pregnancy week 29+5 (estimated due date ${localDate(due, L)})`);
  });
  it('pregnancy with an implausible due date shows the date only', () => {
    expect(stageLines({ stage: 'pregnancy', dueDate: '2030-01-01', now: NOW, locale: L })[1]).toBe('Estimated due date 1 January 2030');
  });
  it('cycle stages: cycle day counts the start as day 1', () => {
    expect(stageLines({ stage: 'menstrual-cycle', lastPeriodStart: '2026-11-25', now: NOW, locale: L })[1])
      .toBe('Cycle day 1 (last period started 25 November 2026)');
    expect(stageLines({ stage: 'conception', lastPeriodStart: '2026-11-14', now: NOW, locale: L })[1]).toMatch(/^Cycle day 12 /);
  });
  it('TTC: how long she has been trying, for the doctor', () => {
    const lines = stageLines({ stage: 'conception', lastPeriodStart: '2026-11-14', ttcStartDate: '2025-10-01', now: NOW, locale: L });
    expect(lines[2]).toBe('Trying to conceive since 1 October 2025 (13 months)');
    expect(stageLines({ stage: 'menstrual-cycle', ttcStartDate: '2025-10-01', now: NOW })).toHaveLength(1);
    expect(stageLines({ stage: 'conception', ttcStartDate: '2027-01-01', now: NOW })).toHaveLength(1);
  });
  it('a very old period is not a cycle day', () => {
    expect(stageLines({ stage: 'menstrual-cycle', lastPeriodStart: '2026-01-01', now: NOW, locale: L })[1])
      .toBe('Last recorded period started 1 January 2026');
  });
  it('other stages and missing data: just the stage', () => {
    expect(stageLines({ stage: 'menopause', lastPeriodStart: '2026-11-20', now: NOW })).toHaveLength(1);
    expect(stageLines({ stage: null, now: NOW })).toEqual(['Life stage: not set']);
  });
});

describe('lastCycles', () => {
  const rows = [
    { period_start_date: '2026-08-01', period_end_date: '2026-08-05' },
    { period_start_date: '2026-11-20', period_end_date: null },
    { period_start_date: '2026-09-29', period_end_date: '2026-10-03' },
    { period_start_date: '2026-10-27', period_end_date: '2026-10-31' },
    { period_start_date: '2026-08-30', period_end_date: '2026-09-04' },
    { period_start_date: '2026-10-27', period_end_date: '2026-10-31' }, // duplicate
  ];
  it('current cycle + 3 completed, newest first, lengths to the next start', () => {
    const c = lastCycles(rows);
    expect(c.map(r => r.start.getDate())).toEqual([20, 27, 29, 30]);
    expect(c.map(r => r.cycleLength)).toEqual([null, 24, 28, 30]);
    expect(c.map(r => r.periodLength)).toEqual([null, 5, 5, 6]);
  });
  it('a gap over 90 days (missed logs) is left blank', () => {
    const c = lastCycles([{ period_start_date: '2026-11-01', period_end_date: null }, { period_start_date: '2026-03-01', period_end_date: null }]);
    expect(c[1].cycleLength).toBeNull();
  });
  it('no rows -> empty', () => expect(lastCycles([])).toEqual([]));
});

describe('medicineLines', () => {
  it('name, dose, frequency; drops inactive and nameless', () => {
    expect(medicineLines([
      { name: 'Folic acid', dose: '400 µg', times_per_day: 1 },
      { name: 'Iron', dose: null, times_per_day: null },
      { name: 'Old pill', active: false },
      { name: '  ' },
    ])).toEqual(['Folic acid 400 µg, 1× daily', 'Iron']);
  });
});

describe('summariseSignals', () => {
  it('counts days in the last 30 days only, one per day', () => {
    const s = summariseSignals([
      { signal_date: '2026-11-24', symptoms: ['cramps', 'headache'], mood: ['calm'] },
      { signal_date: '2026-11-24', symptoms: ['cramps'], mood: null }, // same day twice
      { signal_date: '2026-11-10', symptoms: '["cramps","back_pain"]', mood: '["anxious"]' },
      { signal_date: '2026-10-26', symptoms: ['tender_breasts'], mood: [] }, // day 30 ago: outside
      { signal_date: '2026-11-01', symptoms: [], mood: [] }, // empty day
    ], NOW);
    expect(s.daysLogged).toBe(2);
    expect(s.symptoms).toEqual([{ label: 'Cramps', days: 2 }, { label: 'Back pain', days: 1 }, { label: 'Headache', days: 1 }]);
    expect(s.moods.map(m => m.label)).toEqual(['Anxious', 'Calm']);
    expect(countSentence(s.symptoms)).toBe('Cramps on 2 days, Back pain on 1 day, Headache on 1 day');
  });
  it('labels', () => {
    expect(humanLabel('tender_breasts')).toBe('Breast tenderness');
    expect(humanLabel('low-energy')).toBe('Low energy');
  });
});

describe('openQuestions', () => {
  it('unasked, de-duplicated across visits', () => {
    expect(openQuestions([
      { questions: [{ id: 'a', text: 'Is my iron low?', asked: false }, { id: 'b', text: 'Done one', asked: true }] },
      { questions: JSON.stringify([{ id: 'c', text: 'is my iron low?', asked: false }, { id: 'd', text: 'Cycle length?', asked: false }]) },
      { questions: 'junk' },
    ])).toEqual(['Is my iron low?', 'Cycle length?']);
  });
});

describe('recentResults', () => {
  it('latest reading per test, newest first, labs only, capped', () => {
    const r = recentResults([
      { title: 'TSH', value: '2.1', unit: 'mIU/L', reference_range: '0.4-4', status: 'normal', date_recorded: '2026-06-01', data_type: 'lab_result' },
      { title: 'TSH', value: '5.2', unit: 'mIU/L', reference_range: '0.4-4', status: 'abnormal', date_recorded: '2026-10-01', data_type: 'lab_result' },
      { title: 'Ferritin', value: 12, unit: 'ng/mL', reference_range: null, status: 'critical', date_recorded: '2026-09-01', data_type: 'lab_result' },
      { title: 'Diagnosis', value: 'x', unit: null, reference_range: null, status: null, date_recorded: '2026-11-01', data_type: 'diagnosis' },
      { title: 'Empty', value: null, unit: null, reference_range: null, status: null, date_recorded: '2026-11-01' },
    ], t => t.toUpperCase());
    expect(r.map(x => x.name)).toEqual(['TSH', 'FERRITIN']);
    expect(r[0]).toMatchObject({ value: '5.2 mIU/L', range: '0.4-4', flag: 'Outside range' });
    expect(r[1].flag).toBe('Outside range (marked urgent)');
    expect(r[0].date?.getMonth()).toBe(9);
    expect(recentResults(Array.from({ length: 20 }, (_, i) => ({ title: `T${i}`, value: '1', unit: null, reference_range: null, status: null, date_recorded: null })))).toHaveLength(12);
  });
});

describe('documentNames', () => {
  it('readable name first, newest first, names only, with an overflow count', () => {
    const d = documentNames([
      { file_name: 'scan_001.pdf', ai_suggested_name: 'Ultrasound, week 12', uploaded_at: '2026-05-01' },
      { file_name: 'blood.pdf', ai_suggested_name: null, uploaded_at: '2026-10-01' },
      { file_name: null, ai_suggested_name: null },
    ], 1);
    expect(d).toEqual({ names: ['blood.pdf'], more: 1 });
  });
});

describe('footer and selection', () => {
  it('footer carries the local date and the not-a-diagnosis line', () => {
    const f = footerLine(NOW, L);
    expect(f).toContain('Generated by Womanie on 25 November 2026');
    expect(f).toContain('Not a diagnosis');
  });
  it('all sections ticked by default; selection keeps page order', () => {
    expect(selectedSections(defaultSelection())).toEqual(SECTION_ORDER);
    expect(selectedSections({ documents: true, stage: true, results: false })).toEqual(['stage', 'documents']);
  });
  it('parseDay reads dates as local calendar days', () => {
    expect(parseDay('2026-11-25T23:30:00Z')?.getDate()).toBe(25);
    expect(parseDay('nope')).toBeNull();
    expect(parseDay(null)).toBeNull();
    expect(isoDay(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
  });
});
