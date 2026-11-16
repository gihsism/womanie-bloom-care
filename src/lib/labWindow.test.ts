import { describe, it, expect } from 'vitest';
import { withinWindow, pregnancyStart } from './labWindow';

describe('withinWindow', () => {
  const rows = [
    { t: 'old', date_recorded: '2024-03-01' },
    { t: 'new', date_recorded: '2026-08-01' },
    { t: 'undated', date_recorded: null },
  ];
  it('keeps everything without a window', () => {
    expect(withinWindow(rows, null)).toHaveLength(3);
  });
  it('keeps only results from this pregnancy', () => {
    const since = pregnancyStart(new Date('2027-01-24'))!; // ≈ 2026-04-19
    expect(withinWindow(rows, since).map(r => r.t)).toEqual(['new']);
  });
});
