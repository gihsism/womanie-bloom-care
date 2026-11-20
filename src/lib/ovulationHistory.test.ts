import { describe, it, expect } from 'vitest';
import { learnLuteal, type SignalLike } from './ovulation';
import { describeOvulation, listCompletedCycles, lutealSummary } from './ovulationHistory';

const d = (s: string) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };
const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const add = (s: string, n: number) => { const x = d(s); return ymd(new Date(x.getFullYear(), x.getMonth(), x.getDate() + n)); };

/** Positive LH tests on cycle days ovDay-1 and ovDay → ovulation on cycle day ovDay. */
function lhCycle(sig: Record<string, SignalLike>, start: string, ovDay: number) {
  sig[add(start, ovDay - 2)] = { notes: 'LH test: positive' };
  sig[add(start, ovDay - 1)] = { notes: 'LH test: positive' };
}

describe('listCompletedCycles', () => {
  it('lists fewer than 6 when there are fewer completed cycles, newest first', () => {
    const starts = ['2026-09-29', '2026-08-04', '2026-09-01']; // unordered on purpose
    const sig: Record<string, SignalLike> = {};
    lhCycle(sig, '2026-08-04', 15);
    const list = listCompletedCycles(starts, sig);
    expect(list).toHaveLength(2);
    expect(ymd(list[0].start)).toBe('2026-09-01');
    expect(ymd(list[1].start)).toBe('2026-08-04');
    expect(list[1].length).toBe(28);
    expect(list[1].ovulationDay).toBe(15);
    expect(ymd(list[1].ovulation!.date)).toBe('2026-08-18');
    expect(list[1].luteal).toBe(14);
    expect(list[1].ovulation!.method).toBe('lh');
  });

  it('keeps cycles with no detected ovulation', () => {
    const list = listCompletedCycles(['2026-08-04', '2026-09-01', '2026-09-30'], {});
    expect(list).toHaveLength(2);
    for (const c of list) {
      expect(c.ovulation).toBeNull();
      expect(c.ovulationDay).toBeNull();
      expect(c.luteal).toBeNull();
    }
    expect(list[0].length).toBe(29);
  });

  it('caps at the 6 newest of many cycles and ignores duplicates', () => {
    const starts: string[] = [];
    let s = '2026-01-05';
    for (let i = 0; i < 10; i++) { starts.push(s); s = add(s, 28); }
    starts.push(starts[3]); // duplicate row
    const list = listCompletedCycles(starts, {});
    expect(list).toHaveLength(6);
    expect(ymd(list[0].start)).toBe(starts[8]);
    expect(ymd(list[5].start)).toBe(starts[3]);
    for (let i = 1; i < list.length; i++) expect(list[i].start < list[i - 1].start).toBe(true);
  });

  it('returns nothing with fewer than two period starts', () => {
    expect(listCompletedCycles([], {})).toEqual([]);
    expect(listCompletedCycles(['2026-09-01'], {})).toEqual([]);
  });
});

describe('lutealSummary', () => {
  it('names the learned length and how many cycles it came from', () => {
    const sig: Record<string, SignalLike> = {};
    lhCycle(sig, '2026-07-07', 17);
    lhCycle(sig, '2026-08-04', 17);
    const model = learnLuteal(['2026-07-07', '2026-08-04', '2026-09-01'], sig);
    expect(model.source).toBe('personal');
    expect(lutealSummary(model)).toBe('Your luteal phase is usually 12 days (learned from 2 cycles).');
  });

  it('explains the typical 14 days when nothing was learned', () => {
    const model = learnLuteal(['2026-08-04', '2026-09-01'], {});
    expect(lutealSummary(model)).toMatch(/typical 14-day/);
  });

  it('describes the method and confidence in plain words', () => {
    expect(describeOvulation({ date: d('2026-09-15'), method: 'lh+bbt', confidence: 'high' }))
      .toBe('LH test + temperature rise · clear signal');
    expect(describeOvulation({ date: d('2026-09-15'), method: 'mucus', confidence: 'low' }))
      .toBe('egg-white discharge · rough estimate');
  });
});
