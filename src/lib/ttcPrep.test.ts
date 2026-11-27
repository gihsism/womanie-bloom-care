import { describe, it, expect } from 'vitest';
import { lhText, ttcCycleSummary } from './ttcPrep';

const NOW = new Date(2026, 10, 26, 12, 0); // 26 Nov 2026
const p = (start: string, end: string | null = null) => ({ period_start_date: start, period_end_date: end });

const periods = [
  p('2026-11-20', '2026-11-24'), // current cycle, day 7
  p('2026-10-22', '2026-10-26'), // 29 days
  p('2026-09-24', '2026-09-27'), // 28 days
  p('2026-08-26'), // 29 days, no end logged
];

describe('ttcCycleSummary', () => {
  it('lists the current cycle and the completed ones with lengths, newest first', () => {
    const { cycles } = ttcCycleSummary(periods, [], NOW);
    expect(cycles.map(c => [c.current, c.cycleLength, c.periodLength])).toEqual([
      [true, null, 5],
      [false, 29, 5],
      [false, 28, 4],
      [false, 29, null],
    ]);
  });

  it('puts each LH test in its cycle as a cycle day', () => {
    const signals = [
      { signal_date: '2026-11-03', notes: 'LH test: negative' },
      { signal_date: '2026-11-04', notes: 'LH test: positive. BBT: 36.4°C' },
      { signal_date: '2026-11-05', notes: 'LH test: peak' },
      { signal_date: '2026-11-21', notes: 'LH test: negative' },
      { signal_date: '2026-10-05', notes: 'Sleep: 7h' },
    ];
    const { cycles, sentence } = ttcCycleSummary(periods, signals, NOW);
    expect(cycles[0].lhTests).toBe(1);
    expect(lhText(cycles[0])).toBe('1 test, all negative');
    expect(cycles[1].lhTests).toBe(3);
    expect(cycles[1].lhPositive).toEqual([{ day: 14, result: 'positive' }, { day: 15, result: 'peak' }]);
    expect(lhText(cycles[1])).toBe('3 tests; day 14 positive, day 15 peak');
    expect(lhText(cycles[2])).toBe('None logged');
    expect(sentence).toBe('Cycle length 28 to 29 days over 3 cycles (average 29). Period length 4 to 5 days. Ovulation tests logged in 2 of 4 cycles; a positive or peak result in 1.');
  });

  it('a test on the day before the next period belongs to the earlier cycle', () => {
    const { cycles } = ttcCycleSummary(periods, [{ signal_date: '2026-11-19', notes: 'LH test: negative' }], NOW);
    expect(cycles[1].lhTests).toBe(1);
    expect(cycles[0].lhTests).toBe(0);
  });

  it('says plainly when nothing is logged', () => {
    expect(ttcCycleSummary([], [], NOW).sentence).toBe('No periods logged yet.');
    expect(ttcCycleSummary([p('2026-11-20')], [], NOW).sentence).toBe('No ovulation tests logged in these cycles.');
  });

  it('caps at the current cycle plus 6 completed ones and uses no verdict words', () => {
    const many = Array.from({ length: 10 }, (_, i) => p(`2026-${String(11 - i).padStart(2, '0')}-01`));
    const s = ttcCycleSummary(many, [], NOW);
    expect(s.cycles).toHaveLength(7);
    expect(s.sentence).not.toMatch(/regular|normal|irregular|concern/i);
  });
});
