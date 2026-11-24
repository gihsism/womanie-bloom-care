import { describe, it, expect } from 'vitest';
import { yesterdayPillUnanswered } from './pillLog';

const now = new Date(2026, 10, 24, 18, 0); // Tue 24 Nov
const tick = (signal_date: string, s = 'on-time') => ({ signal_date, notes: `Pill: ${s}` });

describe('yesterdayPillUnanswered (the card answers Home\'s "Yesterday\'s pill not ticked")', () => {
  it('asks when she ticks regularly and yesterday has no tick', () => {
    expect(yesterdayPillUnanswered([tick('2026-11-22'), tick('2026-11-24')], null, now)).toBe(true);
  });
  it('is answered by any tick for yesterday, missed included', () => {
    expect(yesterdayPillUnanswered([tick('2026-11-22'), tick('2026-11-23', 'missed')], null, now)).toBe(false);
  });
  it('never nags someone who does not tick (nothing in the last 7 days)', () => {
    expect(yesterdayPillUnanswered([], null, now)).toBe(false);
    expect(yesterdayPillUnanswered([tick('2026-11-10')], null, now)).toBe(false);
    expect(yesterdayPillUnanswered([{ signal_date: '2026-11-22', notes: 'Tired' }], null, now)).toBe(false);
  });
  it('stays quiet in the pill-free week and on pack day 1', () => {
    expect(yesterdayPillUnanswered([tick('2026-11-22')], 23, now)).toBe(false);
    expect(yesterdayPillUnanswered([tick('2026-11-22')], 1, now)).toBe(false);
    expect(yesterdayPillUnanswered([tick('2026-11-22')], 5, now)).toBe(true);
  });
});
