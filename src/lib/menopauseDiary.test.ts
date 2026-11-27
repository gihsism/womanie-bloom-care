import { describe, it, expect } from 'vitest';
import { symptomDiary, weekLabel } from './menopauseDiary';
import type { SignalInput } from './menopauseInsights';

const NOW = new Date(2026, 10, 26, 12, 0, 0); // Thu 26 Nov 2026
const dayAgo = (n: number) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const row = (ago: number, r: Partial<SignalInput>): SignalInput => ({ signal_date: dayAgo(ago), ...r });

describe('symptomDiary', () => {
  it('splits the last 28 days into 4 weeks, oldest first, ending today', () => {
    const d = symptomDiary([], NOW);
    expect(d.weeks).toHaveLength(4);
    expect(weekLabel(d.weeks[0])).toBe('30 Oct – 5 Nov');
    expect(weekLabel(d.weeks[3])).toBe('20 Nov – 26 Nov');
    expect(d.sentence).toBe('Nothing logged in the last 4 weeks.');
  });

  it('counts hot-flush days and the counted hot flushes per week', () => {
    const d = symptomDiary([
      row(0, { notes: 'Hot flashes: 4' }),
      row(1, { symptoms: ['Hot flashes'] }),
      row(8, { notes: 'Hot flashes: 6' }),
      row(30, { notes: 'Hot flashes: 9' }), // outside the 4 weeks
    ], NOW);
    expect(d.weeks[3]).toMatchObject({ daysLogged: 2, hotFlushDays: 2, hotFlushCount: 4 });
    expect(d.weeks[2]).toMatchObject({ daysLogged: 1, hotFlushDays: 1, hotFlushCount: 6 });
    expect(d.weeks[0]).toMatchObject({ daysLogged: 0, hotFlushDays: 0, hotFlushCount: null });
    expect(d.hasHotCounts).toBe(true);
    expect(d.sentence).toBe('Logged on 3 of the last 28 days. In that time: hot flushes on 3 days (10 hot flushes counted), poor sleep on 0 nights and low mood on 0 days.');
  });

  it('counts poor-sleep nights, sleep hours and low-mood days', () => {
    const d = symptomDiary([
      row(2, { notes: 'Sleep: 5h. Sleep quality: 2/5', mood: ['anxious'] }),
      row(3, { notes: 'Sleep: 7h', symptoms: ['Insomnia'] }),
      row(4, { mood: ['happy'] }),
    ], NOW);
    expect(d.weeks[3]).toMatchObject({ daysLogged: 3, poorSleepNights: 2, sleepHours: 6, lowMoodDays: 1, hotFlushDays: 0 });
    expect(d.hasSleepHours).toBe(true);
    expect(d.sentence).toBe('Logged on 3 of the last 28 days. In that time: hot flushes on 0 days, poor sleep on 2 nights, low mood on 1 day and an average of 6 hours of sleep on the 2 nights with hours logged.');
  });

  it('one row per day: a second row for the same day replaces the first', () => {
    const d = symptomDiary([row(0, { notes: 'Hot flashes: 3' }), row(0, { notes: 'Hot flashes: 5' })], NOW);
    expect(d.daysLogged).toBe(1);
    expect(d.weeks[3].hotFlushCount).toBe(5);
  });

  it('uses no trend or verdict words', () => {
    const d = symptomDiary([row(0, { notes: 'Hot flashes: 4' }), row(10, { notes: 'Hot flashes: 1' })], NOW);
    expect(d.sentence).not.toMatch(/better|worse|improv|increas|decreas|normal|concern/i);
  });
});
