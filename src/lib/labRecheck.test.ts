import { describe, it, expect } from 'vitest';
import { recheckHints, recheckKey, MIN_MONTHS_SINCE } from './labRecheck';

const now = new Date(2026, 10, 27, 10); // 27 Nov 2026
const row = (title: string, date: string, status: string | null = 'normal') =>
  ({ title, value: '1', status, date_recorded: date, data_type: 'lab_result' });

describe('recheckKey', () => {
  it('recognises the four tests and keeps HbA1c out of haemoglobin', () => {
    expect(recheckKey('Ferritin')).toBe('ferritin');
    expect(recheckKey('TSH')).toBe('tsh');
    expect(recheckKey('Thyroid stimulating hormone')).toBe('tsh');
    expect(recheckKey('25-OH Vitamin D')).toBe('vitamin-d');
    expect(recheckKey('Vitamin D3')).toBe('vitamin-d');
    expect(recheckKey('Hemoglobin')).toBe('haemoglobin');
    expect(recheckKey('Hb')).toBe('haemoglobin');
    expect(recheckKey('HbA1c')).toBeNull();
    expect(recheckKey('Glycated haemoglobin')).toBeNull();
    expect(recheckKey('Vitamin B12')).toBeNull();
  });
});

describe('recheckHints', () => {
  it('states a low ferritin from 7 months ago as fact plus "ask your doctor"', () => {
    const [h] = recheckHints([row('Ferritin', '2026-04-12', 'abnormal')], { now });
    expect(h.reason).toBe('outside-range');
    expect(h.monthsAgo).toBe(7);
    expect(h.text).toBe("Ferritin: last checked 7 months ago (12 Apr 2026). It was outside the lab's range then. Ask your doctor whether it should be checked again.");
  });

  it('uses only the latest reading per test', () => {
    const hints = recheckHints([row('Ferritin', '2026-02-01', 'abnormal'), row('FERRITIN', '2026-06-01', 'normal')], { now });
    expect(hints).toEqual([]);
  });

  it('says nothing about results within range outside pregnancy', () => {
    expect(recheckHints([row('TSH', '2025-01-01'), row('Vitamin D', '2025-01-01')], { now })).toEqual([]);
  });

  it('hides tests measured under the display threshold', () => {
    expect(MIN_MONTHS_SINCE).toBe(3);
    expect(recheckHints([row('Ferritin', '2026-09-01', 'abnormal')], { now })).toEqual([]);
    expect(recheckHints([row('Ferritin', '2026-08-27', 'abnormal')], { now })).toHaveLength(1);
  });

  it('marks borderline results as borderline, not out of range', () => {
    const [h] = recheckHints([row('Vitamin D', '2026-01-10', 'borderline')], { now });
    expect(h.text).toContain('It was marked borderline then.');
  });

  it('notes TSH in pregnancy, and whether it was before this pregnancy', () => {
    const due = new Date(2027, 3, 1); // pregnancy started ~25 Jun 2026
    const [h] = recheckHints([row('TSH', '2026-03-01')], { stage: 'pregnancy', dueDate: due, now });
    expect(h.reason).toBe('pregnancy-thyroid');
    expect(h.text).toBe('TSH: last checked 8 months ago (1 Mar 2026). That was before this pregnancy. Ask your doctor whether it should be checked again.');
    // Not pregnant: a normal TSH gets no note.
    expect(recheckHints([row('TSH', '2026-03-01')], { stage: 'menstrual-cycle', now })).toEqual([]);
  });

  it('quotes the cited 28-week anaemia check once she is past week 28', () => {
    const due = new Date(2027, 0, 20); // week 28 on ~ 14 Oct 2026
    const [h] = recheckHints([row('Hemoglobin', '2026-09-20')], { stage: 'pregnancy', dueDate: due, now });
    expect(h.reason).toBe('pregnancy-28-weeks');
    expect(h.source?.pmid).toBe('41031541');
    expect(h.text).toContain('again at 28 weeks');
    expect(h.text).toContain('Ask your doctor');
    // A haemoglobin from after week 28 gets no note.
    expect(recheckHints([row('Hemoglobin', '2026-10-30')], { stage: 'pregnancy', dueDate: due, now })).toEqual([]);
    // Before week 28 the cited note does not show.
    expect(recheckHints([row('Hemoglobin', '2026-09-20')], { stage: 'pregnancy', dueDate: new Date(2027, 3, 1), now })).toEqual([]);
  });

  it('never gives advice words', () => {
    const hints = recheckHints([
      row('Ferritin', '2025-01-01', 'abnormal'), row('TSH', '2025-01-01', 'critical'),
      row('Vitamin D', '2025-01-01', 'borderline'), row('Hb', '2025-01-01', 'abnormal'),
    ], { now });
    expect(hints).toHaveLength(4);
    for (const h of hints) expect(h.text).not.toMatch(/\b(should get|you need|overdue|due now|take|supplement)\b/i);
  });

  it('ignores undated, future and non-lab rows', () => {
    expect(recheckHints([
      { title: 'Ferritin', status: 'abnormal', date_recorded: null },
      row('Ferritin', '2027-01-01', 'abnormal'),
      { ...row('Ferritin', '2025-01-01', 'abnormal'), data_type: 'diagnosis' },
    ], { now })).toEqual([]);
  });
});
