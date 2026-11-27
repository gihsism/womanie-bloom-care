import { describe, it, expect } from 'vitest';
import { resultsToDiscuss, prepQuestions } from './visitPrep';

const lab = (title: string, value: string, date: string, status: string | null = 'normal', unit: string | null = null, range: string | null = null) =>
  ({ title, value, unit, status, data_type: 'lab_result', date_recorded: date, document_id: null, reference_range: range });

describe('resultsToDiscuss', () => {
  it('lists an out-of-range latest reading with its range and date', () => {
    const [r] = resultsToDiscuss([lab('Ferritin', '12', '2026-10-01', 'abnormal', 'ng/mL', '15-150')]);
    expect(r).toEqual({ name: 'Ferritin', value: '12 ng/mL', range: '15-150', date: '2026-10-01', note: 'Marked outside range' });
  });

  it('leaves out results within range that did not change status or run', () => {
    expect(resultsToDiscuss([lab('TSH', '2.1', '2026-10-01'), lab('TSH', '2.0', '2026-05-01')])).toEqual([]);
  });

  it('a result back within range is listed with what it was before', () => {
    const [r] = resultsToDiscuss([
      lab('Ferritin', '40', '2026-10-01', 'normal', 'ng/mL'),
      lab('Ferritin', '10', '2026-04-01', 'abnormal', 'ng/mL'),
    ]);
    expect(r.note).toBe('Was 10 ng/mL (outside range) on 1 Apr 2026');
    expect(r.value).toBe('40 ng/mL');
  });

  it('combines out of range with the previous reading', () => {
    const [r] = resultsToDiscuss([
      lab('Ferritin', '10', '2026-10-01', 'abnormal', 'ng/mL'),
      lab('Ferritin', '40', '2026-04-01', 'normal', 'ng/mL'),
    ]);
    expect(r.note).toBe('Marked outside range; was 40 ng/mL (within range) on 1 Apr 2026');
  });

  it('lists a steady fall across 3 tests, stated as readings only', () => {
    const [r] = resultsToDiscuss([
      lab('Ferritin', '45', '2026-03-12', 'normal', 'ng/mL'),
      lab('Ferritin', '30', '2026-06-05', 'normal', 'ng/mL'),
      lab('Ferritin', '18', '2026-09-02', 'normal', 'ng/mL'),
    ]);
    expect(r.note).toBe('Gone down at each of the last 3 tests: 45 (12 Mar 2026) → 30 (5 Jun 2026) → 18 ng/mL (2 Sep 2026)');
  });

  it('orders urgent first, then out of range, borderline, changes; caps the list', () => {
    const rows = [
      lab('A', '1', '2026-10-01', 'borderline'),
      lab('B', '1', '2026-09-01', 'critical'),
      lab('C', '1', '2026-11-01', 'abnormal'),
    ];
    expect(resultsToDiscuss(rows).map(r => r.name)).toEqual(['B', 'C', 'A']);
    expect(resultsToDiscuss(rows, t => t, 2)).toHaveLength(2);
  });

  it('uses the friendly name and skips non-lab or empty rows', () => {
    const rows = [
      lab('hgb', '9', '2026-10-01', 'abnormal'),
      { ...lab('X', '1', '2026-10-01', 'abnormal'), data_type: 'diagnosis' },
      lab('Y', '', '2026-10-01', 'abnormal'),
    ];
    expect(resultsToDiscuss(rows, t => (t === 'hgb' ? 'Haemoglobin' : t)).map(r => r.name)).toEqual(['Haemoglobin']);
  });
});

describe('prepQuestions', () => {
  const q = (text: string, asked = false) => ({ id: text, text, asked });
  it('takes the open questions saved to this visit', () => {
    expect(prepQuestions({ questions: [q('A'), q('B', true)] }, { questions: [q('C')] }))
      .toEqual({ questions: ['A'], fromVisit: true });
  });
  it('falls back to questions saved before a visit was booked', () => {
    expect(prepQuestions(null, { questions: JSON.stringify([q('C')]) })).toEqual({ questions: ['C'], fromVisit: false });
    expect(prepQuestions(null, null)).toEqual({ questions: [], fromVisit: false });
  });
});
