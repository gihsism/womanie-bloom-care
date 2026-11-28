import { describe, it, expect } from 'vitest';
import {
  EMPTY_IVF_PLAN, MAX_IVF_SCANS, addDays, hasAnyDate, ivfDateList, ivfTodayDates, nextKeyDate, parseIvfPlan,
  zonedTimeToUtc, type IvfPlan,
} from './ivfJourney';

// Monitoring scans, the Today rows and the prep-sheet list (round 9).
const Z = 'Europe/Zurich';
const plan = (over: Partial<IvfPlan> = {}): IvfPlan => ({ ...EMPTY_IVF_PLAN, ...over });
const noon = (date: string) => zonedTimeToUtc(date, '12:00', Z);

describe('monitoring scans', () => {
  it('parses scans: valid dates only, sorted, no repeats, capped; old plans read as none', () => {
    expect(parseIvfPlan({ scans: ['2026-12-05', 'x', '2026-12-03', '2026-12-05', '2026-02-30'] }).scans).toEqual(['2026-12-03', '2026-12-05']);
    expect(parseIvfPlan({ scans: 'nope' }).scans).toEqual([]);
    expect(parseIvfPlan({ stimStart: '2026-11-28' }).scans).toEqual([]);
    expect(parseIvfPlan({ scans: Array.from({ length: 15 }, (_, i) => addDays('2026-12-01', i)) }).scans).toHaveLength(MAX_IVF_SCANS);
    expect(hasAnyDate(plan({ scans: ['2026-12-03'] }))).toBe(true);
  });

  it('a scan counts as the next key date and for the today / tomorrow rows', () => {
    const p = plan({ stimStart: '2026-11-28', scans: ['2026-12-03', '2026-12-05'], retrieval: '2026-12-10' });
    expect(nextKeyDate(p, noon('2026-12-01'), Z)).toMatchObject({ key: 'scan', label: 'Monitoring scan', date: '2026-12-03', daysUntil: 2 });
    expect(ivfTodayDates(p, noon('2026-12-02'), Z).map(d => [d.key, d.daysUntil])).toEqual([['scan', 1]]);
    expect(ivfTodayDates(p, noon('2026-12-03'), Z).map(d => [d.key, d.daysUntil])).toEqual([['scan', 0]]);
    expect(ivfTodayDates(p, noon('2026-12-07'), Z)).toEqual([]);
    expect(ivfTodayDates(p, noon('2026-12-09'), Z).map(d => d.key)).toEqual(['retrieval']);
  });

  it('the trigger row carries its moment and drops out once given', () => {
    const at = zonedTimeToUtc('2026-12-08', '21:30', Z).toISOString();
    const p = plan({ triggerAt: at, triggerTz: Z, retrieval: '2026-12-10' });
    expect(ivfTodayDates(p, noon('2026-12-08'), Z)).toEqual([expect.objectContaining({ key: 'trigger', at, daysUntil: 0 })]);
    expect(ivfTodayDates(p, zonedTimeToUtc('2026-12-08', '22:00', Z), Z)).toEqual([]);
  });

  it('lists her dates in order for the prep sheet (only the ones she set)', () => {
    const at = zonedTimeToUtc('2026-12-08', '21:30', Z).toISOString();
    const p = plan({ stimStart: '2026-11-28', scans: ['2026-12-03', '2026-12-05'], triggerAt: at, triggerTz: Z, testDate: '2026-12-24' });
    expect(ivfDateList(p, Z).map(r => `${r.label} ${r.date}`)).toEqual([
      'Stimulation day 1 2026-11-28', 'Monitoring scan 1 2026-12-03', 'Monitoring scan 2 2026-12-05', 'Trigger shot 2026-12-08', 'Test day 2026-12-24',
    ]);
    expect(ivfDateList(plan({ scans: ['2026-12-03'] }), Z).map(r => r.label)).toEqual(['Monitoring scan']);
    expect(ivfDateList(EMPTY_IVF_PLAN, Z)).toEqual([]);
  });
});
