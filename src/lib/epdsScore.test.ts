import { describe, expect, it } from 'vitest';
import { epdsItemScore, scoreEpds } from './epdsScore';

describe('EPDS scoring (options listed best -> worst)', () => {
  it('all best answers (incl. "Never" on item 10) score 0 and flag nothing', () => {
    expect(scoreEpds(Array(10).fill(0))).toEqual({ total: 0, flaggedItem10: false });
  });

  it('all worst answers score 30 and flag item 10', () => {
    expect(scoreEpds(Array(10).fill(3))).toEqual({ total: 30, flaggedItem10: true });
  });

  it('any answer above "Never" on item 10 flags it', () => {
    const a = Array(10).fill(0); a[9] = 1;
    expect(scoreEpds(a)).toEqual({ total: 1, flaggedItem10: true });
  });

  it('a mid answer on item 1 does not flag item 10', () => {
    const a = Array(10).fill(0); a[0] = 2;
    expect(scoreEpds(a)).toEqual({ total: 2, flaggedItem10: false });
  });

  it('ignores junk positions', () => {
    expect(epdsItemScore(-1)).toBe(0);
    expect(epdsItemScore(7)).toBe(3);
    expect(epdsItemScore(1.5)).toBe(0);
  });
});
