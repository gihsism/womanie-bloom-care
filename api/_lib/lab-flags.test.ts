import { describe, it, expect } from 'vitest';
import { currentFlagged, flagRank, isFlaggedOrBorderline, isOutsideRange, labFlag, latestPerTest, testKey } from './lab-flags';

const row = (title: string, status: string | null, date: string | null, extra: Record<string, unknown> = {}) => ({
  id: `${title}-${date}`, title, status, date_recorded: date, data_type: 'lab_result', ...extra,
});

describe('labFlag (one definition of outside the range / borderline)', () => {
  it('critical is urgent; abnormal and the older high/low words are outside the range', () => {
    expect(labFlag('critical')).toBe('urgent');
    for (const s of ['abnormal', 'high', 'LOW', ' elevated ', 'decreased', 'out of range']) expect(labFlag(s)).toBe('outside');
    expect(labFlag('borderline')).toBe('borderline');
  });
  it('normal, expected for life stage, informational and empty are not flagged', () => {
    for (const s of ['normal', 'expected', 'informational', '', null, undefined]) expect(labFlag(s)).toBeNull();
  });
  it('borderline is not outside the range', () => {
    expect(isOutsideRange('borderline')).toBe(false);
    expect(isFlaggedOrBorderline('borderline')).toBe(true);
    expect(isOutsideRange('abnormal')).toBe(true);
    expect([flagRank('critical'), flagRank('abnormal'), flagRank('borderline'), flagRank('normal')]).toEqual([0, 1, 2, 9]);
  });
});

describe('latestPerTest', () => {
  it('keeps only the newest reading of a test, matching titles as the trend logic does', () => {
    const rows = [row('TSH', 'abnormal', '2026-03-01'), row(' tsh  ', 'normal', '2026-09-01')];
    expect(latestPerTest(rows).map(r => r.status)).toEqual(['normal']);
  });
  it('an undated reading counts only when the test has no dated one', () => {
    expect(latestPerTest([row('Ferritin', 'abnormal', null), row('Ferritin', 'normal', '2025-01-01')]).map(r => r.status)).toEqual(['normal']);
    expect(latestPerTest([row('Ferritin', 'abnormal', null)]).map(r => r.status)).toEqual(['abnormal']);
  });
  it('on the same date the row listed first wins', () => {
    expect(latestPerTest([row('Iron', 'normal', '2026-01-01'), row('Iron', 'abnormal', '2026-01-01')]).map(r => r.status)).toEqual(['normal']);
  });
  it('a condition and a lab result with the same title are different tests', () => {
    expect(testKey(row('Anaemia', null, null, { data_type: 'condition' }))).not.toBe(testKey(row('Anaemia', null, null)));
    expect(latestPerTest([row('Anaemia', 'abnormal', '2026-01-01', { data_type: 'condition' }), row('Anaemia', 'normal', '2026-02-01')])).toHaveLength(2);
  });
});

describe('currentFlagged (what to talk to the doctor about)', () => {
  it('an older out-of-range TSH re-tested normal is not listed (the Records bug)', () => {
    const rows = [row('TSH', 'abnormal', '2026-03-01'), row('TSH', 'normal', '2026-09-01'), row('Ferritin', 'abnormal', '2026-05-01')];
    expect(currentFlagged(rows).map(r => r.title)).toEqual(['Ferritin']);
  });
  it('a newer out-of-range reading is listed even when an older one was normal', () => {
    const rows = [row('TSH', 'normal', '2026-03-01'), row('TSH', 'high', '2026-09-01')];
    expect(currentFlagged(rows).map(r => r.date_recorded)).toEqual(['2026-09-01']);
  });
  it('urgent first, then newest; borderline only when asked', () => {
    const rows = [row('A', 'abnormal', '2026-01-01'), row('B', 'abnormal', '2026-06-01'), row('C', 'critical', '2025-01-01'), row('D', 'borderline', '2026-07-01')];
    expect(currentFlagged(rows).map(r => r.title)).toEqual(['C', 'B', 'A']);
    expect(currentFlagged(rows, { borderline: true }).map(r => r.title)).toEqual(['C', 'B', 'A', 'D']);
  });
});
