import { describe, it, expect } from 'vitest';
import {
  detect511, formatSpan, intervalsMs, median, rollingSummary, withIntervals, MINUTE, HOUR,
  type TimedContraction,
} from './contractions';

const T0 = Date.UTC(2026, 10, 26, 8, 0, 0);
const SEC = 1000;

/** n contractions every `everyMs`, each lasting `lastMs`, first at `start`. */
function series(n: number, everyMs: number, lastMs: number, start = T0): TimedContraction[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    startedAt: start + i * everyMs,
    endedAt: start + i * everyMs + lastMs,
  }));
}

describe('interval maths', () => {
  it('measures start-to-start, regardless of input order', () => {
    const list = series(3, 4 * MINUTE, 50 * SEC).reverse();
    expect(intervalsMs(list)).toEqual([4 * MINUTE, 4 * MINUTE]);
  });

  it('withIntervals gives null for the first and durations for all', () => {
    const rows = withIntervals(series(2, 6 * MINUTE, 70 * SEC));
    expect(rows[0].intervalMs).toBeNull();
    expect(rows[1].intervalMs).toBe(6 * MINUTE);
    expect(rows.map(r => r.durationMs)).toEqual([70 * SEC, 70 * SEC]);
  });

  it('median handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('formatSpan', () => {
    expect(formatSpan(58 * SEC)).toBe('58s');
    expect(formatSpan(4 * MINUTE + 5 * SEC)).toBe('4m 05s');
    expect(formatSpan(72 * MINUTE)).toBe('1h 12m');
    expect(formatSpan(-5)).toBe('0s');
  });
});

describe('rollingSummary', () => {
  it('only counts contractions that started in the last hour', () => {
    const old = series(3, 5 * MINUTE, 40 * SEC, T0 - 3 * HOUR);
    const recent = series(4, 6 * MINUTE, 60 * SEC, T0);
    const now = T0 + 20 * MINUTE;
    const s = rollingSummary([...old, ...recent], now);
    expect(s.count).toBe(4);
    expect(s.avgIntervalMs).toBe(6 * MINUTE);
    expect(s.avgDurationMs).toBe(60 * SEC);
    expect(s.lastIntervalMs).toBe(6 * MINUTE);
  });

  it('is empty with nothing in the window', () => {
    const s = rollingSummary(series(2, 5 * MINUTE, 60 * SEC, T0 - 2 * HOUR), T0);
    expect(s).toEqual({ count: 0, avgIntervalMs: null, avgDurationMs: null, lastIntervalMs: null, lastDurationMs: null });
  });
});

describe('detect511', () => {
  it('met: every 5 min, 1 min each, for an hour', () => {
    const list = series(13, 5 * MINUTE, 65 * SEC); // spans 60 min
    const r = detect511(list, T0 + 61 * MINUTE);
    expect(r.status).toBe('met');
    expect(r.runCount).toBe(13);
    expect(r.sustainedMs).toBe(60 * MINUTE);
  });

  it('building: right pace but only 20 minutes so far', () => {
    const list = series(5, 4 * MINUTE, 70 * SEC);
    expect(detect511(list, T0 + 17 * MINUTE).status).toBe('building');
  });

  it('none: contractions too far apart', () => {
    const list = series(10, 8 * MINUTE, 70 * SEC);
    expect(detect511(list, T0 + 73 * MINUTE).status).toBe('none');
  });

  it('none: contractions too short', () => {
    const list = series(14, 4 * MINUTE, 40 * SEC);
    expect(detect511(list, T0 + 53 * MINUTE).status).toBe('none');
  });

  it('none: the pattern is not current (last one > 10 min ago)', () => {
    const list = series(13, 5 * MINUTE, 65 * SEC);
    expect(detect511(list, T0 + 60 * MINUTE + 11 * MINUTE).status).toBe('none');
  });

  it('a gap of more than 10 minutes restarts the run', () => {
    const early = series(8, 5 * MINUTE, 65 * SEC); // 0..35 min
    const late = series(5, 5 * MINUTE, 65 * SEC, T0 + 50 * MINUTE); // 15-min gap, 50..70
    const r = detect511([...early, ...late], T0 + 71 * MINUTE);
    expect(r.status).toBe('building');
    expect(r.runCount).toBe(5);
  });

  it('tolerates one late tap inside an otherwise regular hour', () => {
    const list = series(13, 5 * MINUTE, 65 * SEC);
    list[6] = { ...list[6], endedAt: list[6].startedAt + 30 * SEC }; // one short tap
    list[7] = { ...list[7], startedAt: list[7].startedAt + 2 * MINUTE, endedAt: list[7].endedAt + 2 * MINUTE };
    expect(detect511(list, T0 + 61 * MINUTE).status).toBe('met');
  });

  it('none with fewer than three contractions', () => {
    expect(detect511(series(2, 3 * MINUTE, 70 * SEC), T0 + 4 * MINUTE).status).toBe('none');
  });
});
