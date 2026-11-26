import { describe, it, expect } from 'vitest';
import {
  finishSession, kickConcern, startSession, tapKick, timeToTarget, undoTap, usualTimeToTarget,
  DEBOUNCE_MS, REFERENCE_MS, TARGET_KICKS, type KickSession,
} from './kickSession';

const T0 = Date.UTC(2026, 10, 26, 20, 0, 0);
const MIN = 60 * 1000;

/** A session with `n` taps spaced `gapMs` apart. */
function tapped(n: number, gapMs: number, id = 's', start = T0): { s: KickSession; completed: boolean } {
  let s = startSession(start, id);
  let completed = false;
  for (let i = 1; i <= n; i++) {
    const r = tapKick(s, start + i * gapMs);
    s = r.session;
    completed = r.completed;
  }
  return { s, completed };
}

describe('kick session', () => {
  it('counts taps and closes itself at 10', () => {
    const { s, completed } = tapped(TARGET_KICKS, 2 * MIN);
    expect(completed).toBe(true);
    expect(s.count).toBe(10);
    expect(s.endedAt).toBe(T0 + 20 * MIN);
    expect(timeToTarget(s)).toBe(20 * MIN);
  });

  it('ignores a double tap and taps after the end', () => {
    let s = startSession(T0, 's');
    s = tapKick(s, T0 + 10_000).session;
    const dbl = tapKick(s, T0 + 10_000 + DEBOUNCE_MS - 1);
    expect(dbl.ignored).toBe(true);
    expect(dbl.session.count).toBe(1);
    const done = finishSession(s, T0 + MIN);
    expect(tapKick(done, T0 + 2 * MIN).ignored).toBe(true);
  });

  it('undo removes the last tap', () => {
    const { s } = tapped(3, MIN);
    const u = undoTap(s);
    expect(u.count).toBe(2);
    expect(u.taps).toHaveLength(2);
    expect(undoTap(startSession(T0, 'x')).count).toBe(0);
  });

  it('time to target is null below 10', () => {
    expect(timeToTarget(tapped(5, MIN).s)).toBeNull();
  });
});

describe('usual time and concern', () => {
  const history = [
    tapped(10, 1 * MIN, 'a', T0 - 3 * 86400000).s, // 10 min
    tapped(10, 1.5 * MIN, 'b', T0 - 2 * 86400000).s, // 15 min
    tapped(10, 2 * MIN, 'c', T0 - 86400000).s, // 20 min
  ];

  it('usual = median, only with 3+ completed sessions', () => {
    expect(usualTimeToTarget(history)).toBe(15 * MIN);
    expect(usualTimeToTarget(history.slice(0, 2))).toBeNull();
  });

  it('live session past 2 hours without 10 -> contact now', () => {
    const { s } = tapped(4, 10 * MIN);
    expect(kickConcern(s, T0 + REFERENCE_MS + 1)).toBe('over_reference');
    expect(kickConcern(s, T0 + 60 * MIN)).toBe('none');
  });

  it('reached 10 but took more than 2 hours -> contact now', () => {
    const { s } = tapped(10, 13 * MIN);
    expect(kickConcern(s, T0 + 3 * 60 * MIN)).toBe('over_reference');
  });

  it('much slower than her usual -> contact now', () => {
    const { s } = tapped(10, 4 * MIN, 'today'); // 40 min vs usual 15
    expect(kickConcern(s, T0 + 41 * MIN, history)).toBe('slower_than_usual');
    const ok = tapped(10, 2 * MIN, 'today2').s; // 20 min
    expect(kickConcern(ok, T0 + 21 * MIN, history)).toBe('none');
  });

  it('stopped and saved before 10 -> prompt', () => {
    const s = finishSession(tapped(6, MIN).s, T0 + 7 * MIN);
    expect(kickConcern(s, T0 + 8 * MIN)).toBe('stopped_short');
  });

  it('the session itself is not part of its own "usual"', () => {
    const slow = tapped(10, 4 * MIN, 'x').s;
    const copyFromServer = { ...slow, id: 'server-id' };
    expect(kickConcern(slow, T0 + 41 * MIN, [...history, copyFromServer])).toBe('slower_than_usual');
  });
});
