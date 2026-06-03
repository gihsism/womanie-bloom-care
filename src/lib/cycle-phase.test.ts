import { describe, it, expect } from 'vitest';
import { computeCyclePhase, type PeriodInput } from './cycle-phase';

// A fixed "now" so the tests are deterministic. 2026-06-15, midday UTC.
const NOW = Date.parse('2026-06-15T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

// Helper: a period that started `daysAgo` before NOW, with a given cycle length.
function periodStartingDaysAgo(daysAgo: number, cycleLength: number | null): PeriodInput {
  const d = new Date(NOW - daysAgo * DAY);
  return { period_start_date: d.toISOString().slice(0, 10), cycle_length: cycleLength };
}

describe('computeCyclePhase', () => {
  it('returns null when there are no periods', () => {
    expect(computeCyclePhase([], NOW)).toBeNull();
  });

  it('returns null for an implausibly short cycle length', () => {
    expect(computeCyclePhase([periodStartingDaysAgo(2, 10)], NOW)).toBeNull();
  });

  it('returns null for an implausibly long cycle length', () => {
    expect(computeCyclePhase([periodStartingDaysAgo(2, 90)], NOW)).toBeNull();
  });

  it('returns null when the last period is stale (user stopped logging)', () => {
    // 40 days into a 28-day cycle → more than cycleLength + 7 grace → silent.
    expect(computeCyclePhase([periodStartingDaysAgo(40, 28)], NOW)).toBeNull();
  });

  it('returns null for a future-dated period', () => {
    expect(computeCyclePhase([periodStartingDaysAgo(-3, 28)], NOW)).toBeNull();
  });

  it('classifies the first days as menstrual', () => {
    const r = computeCyclePhase([periodStartingDaysAgo(2, 28)], NOW);
    expect(r?.phase).toBe('menstrual');
    expect(r?.summary).toMatch(/menstruating/i);
  });

  it('classifies mid-first-half as follicular', () => {
    const r = computeCyclePhase([periodStartingDaysAgo(9, 28)], NOW);
    expect(r?.phase).toBe('follicular');
  });

  it('classifies ~day 14 of a 28-day cycle as ovulation', () => {
    const r = computeCyclePhase([periodStartingDaysAgo(14, 28)], NOW);
    expect(r?.phase).toBe('ovulation');
  });

  it('classifies the days just before the next period as late-luteal (PMS)', () => {
    // day 25 of 28 → 3 days to next period → within the 5-day PMS window.
    const r = computeCyclePhase([periodStartingDaysAgo(25, 28)], NOW);
    expect(r?.phase).toBe('late-luteal');
    expect(r?.daysToNextPeriod).toBe(3);
    expect(r?.summary).toMatch(/PMS/i);
  });

  it('classifies the post-ovulation mid-luteal stretch as luteal', () => {
    const r = computeCyclePhase([periodStartingDaysAgo(19, 28)], NOW);
    expect(r?.phase).toBe('luteal');
  });

  it('defaults to a 28-day cycle when cycle_length is null', () => {
    const r = computeCyclePhase([periodStartingDaysAgo(14, null)], NOW);
    expect(r?.cycleLength).toBe(28);
    expect(r?.phase).toBe('ovulation');
  });

  it('uses the most recent period when several are provided', () => {
    const periods = [
      periodStartingDaysAgo(2, 30),
      periodStartingDaysAgo(32, 30),
      periodStartingDaysAgo(62, 30),
    ];
    const r = computeCyclePhase(periods, NOW);
    expect(r?.phase).toBe('menstrual');
    expect(r?.cycleLength).toBe(30);
  });
});
