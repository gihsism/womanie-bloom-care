import { describe, it, expect } from 'vitest';
import {
  contraceptionRows, methodSummaryLines, parseMethodDates, ringPatchState, addDays,
  REPLACE_HEADS_UP_DAYS, STALE_AFTER_DAYS,
} from './contraceptionSchedule';

// Friday 2026-11-27, 09:00 local
const NOW = new Date(2026, 10, 27, 9, 0);
const TODAY = '2026-11-27';
const day = (n: number) => addDays(TODAY, n);
const labels = (...a: Parameters<typeof contraceptionRows>) => contraceptionRows(...a).map(r => `${r.urgent ? '!' : ''}${r.label}`);

describe('parseMethodDates', () => {
  it('keeps valid dates per known method and drops the rest', () => {
    expect(parseMethodDates(null)).toEqual({});
    expect(parseMethodDates('nope')).toEqual({});
    expect(parseMethodDates({ implant: { replace: '2029-02-30', fitted: '2026-02-01' }, foo: { replace: '2027-01-01' } }))
      .toEqual({ implant: { fitted: '2026-02-01' } });
    expect(parseMethodDates(JSON.stringify({ ring: { cycleStart: TODAY, schedule: 'own', nextChange: day(3) } })))
      .toEqual({ ring: { cycleStart: TODAY, schedule: 'own', nextChange: day(3) } });
  });
});

describe('ringPatchState (usual 3 weeks on, 1 week off)', () => {
  it('ring: out on day 22, new ring on day 29', () => {
    expect(ringPatchState('ring', { cycleStart: TODAY }, TODAY)).toMatchObject({ cycleDay: 1, next: { kind: 'ring-out', date: day(21), daysUntil: 21 } });
    expect(ringPatchState('ring', { cycleStart: day(-21) }, TODAY)).toMatchObject({ cycleDay: 22, next: { kind: 'ring-out', daysUntil: 0 } });
    expect(ringPatchState('ring', { cycleStart: day(-22) }, TODAY)).toMatchObject({ cycleDay: 23, next: { kind: 'ring-in', daysUntil: 6 } });
    expect(ringPatchState('ring', { cycleStart: day(-28) }, TODAY)).toMatchObject({ cycleDay: 1, next: { kind: 'ring-in', daysUntil: 0 } });
  });
  it('patch: change on days 8 and 15, off on day 22, new patch on day 29', () => {
    expect(ringPatchState('patch', { cycleStart: day(-3) }, TODAY).next).toMatchObject({ kind: 'patch-change', daysUntil: 4 });
    expect(ringPatchState('patch', { cycleStart: day(-14) }, TODAY).next).toMatchObject({ kind: 'patch-change', daysUntil: 0 });
    expect(ringPatchState('patch', { cycleStart: day(-15) }, TODAY).next).toMatchObject({ kind: 'patch-off', daysUntil: 6 });
    expect(ringPatchState('patch', { cycleStart: day(-27) }, TODAY).next).toMatchObject({ kind: 'patch-on', daysUntil: 1 });
  });
  it('a start date still ahead: the first ring / patch is next; own schedule uses her date only', () => {
    expect(ringPatchState('ring', { cycleStart: day(2) }, TODAY)).toMatchObject({ cycleDay: null, next: { kind: 'ring-in', daysUntil: 2 } });
    expect(ringPatchState('patch', { cycleStart: day(-3), schedule: 'own', nextChange: day(1) }, TODAY))
      .toMatchObject({ cycleDay: null, next: { kind: 'change', label: 'Patch change', daysUntil: 1 } });
    expect(ringPatchState('ring', { schedule: 'own' }, TODAY)).toEqual({ cycleDay: null, next: null });
  });
});

describe('contraceptionRows (Home Today)', () => {
  it('nothing for the pill, no method or no dates', () => {
    expect(contraceptionRows('pill', { replace: TODAY }, NOW)).toEqual([]);
    expect(contraceptionRows(null, { replace: TODAY }, NOW)).toEqual([]);
    expect(contraceptionRows('implant', undefined, NOW)).toEqual([]);
    expect(contraceptionRows('ring', {}, NOW)).toEqual([]);
  });
  it('ring / patch: today is urgent, tomorrow a heads-up, other days nothing', () => {
    expect(labels('ring', { cycleStart: day(-21) }, NOW)).toEqual(['!Ring out (ring-free week) today']);
    expect(labels('ring', { cycleStart: day(-27) }, NOW)).toEqual(['New ring in tomorrow']);
    expect(labels('ring', { cycleStart: day(-10) }, NOW)).toEqual([]);
    expect(labels('patch', { cycleStart: day(-7) }, NOW)).toEqual(['!Change your patch today']);
    expect(labels('patch', { schedule: 'own', nextChange: day(-2) }, NOW)).toEqual(['!Patch change was due 25 Nov: update the date']);
    expect(labels('patch', { schedule: 'own', nextChange: day(-STALE_AFTER_DAYS - 1) }, NOW)).toEqual([]);
  });
  it('injection: due within a week, today, overdue (until stale)', () => {
    expect(labels('injection', { next: day(3) }, NOW)).toEqual(['Contraceptive injection due on Monday']);
    expect(labels('injection', { next: day(1) }, NOW)).toEqual(['Contraceptive injection due tomorrow']);
    expect(labels('injection', { next: TODAY }, NOW)).toEqual(['!Contraceptive injection due today']);
    expect(labels('injection', { next: day(-5) }, NOW)).toEqual(['!Injection was due 22 Nov: check with your clinic']);
    expect(labels('injection', { next: day(20) }, NOW)).toEqual([]);
    expect(labels('injection', { next: day(-40) }, NOW)).toEqual([]);
  });
  it('IUD / implant: check within a week, replacement within 30 days or passed', () => {
    expect(labels('iud-copper', { check: day(2), replace: '2035-01-01' }, NOW)).toEqual(['IUD check on Sunday']);
    expect(labels('iud-hormonal', { replace: day(20) }, NOW)).toEqual(['IUD replacement due on 17 Dec: book a visit']);
    expect(labels('implant', { replace: day(5) }, NOW)).toEqual(['!Implant replacement due on Wednesday: book a visit']);
    expect(labels('implant', { replace: day(-1) }, NOW)).toEqual(['!Implant replacement date passed: check with your clinic']);
    expect(labels('implant', { replace: day(REPLACE_HEADS_UP_DAYS + 1), check: TODAY }, NOW)).toEqual([]);
    for (const r of contraceptionRows('iud-hormonal', { check: TODAY, replace: day(3) }, NOW)) expect(r.label.length).toBeLessThanOrEqual(60);
  });
});

describe('methodSummaryLines (prep sheet)', () => {
  it('lists the method and only the dates she set', () => {
    expect(methodSummaryLines(null, undefined, NOW)).toEqual([]);
    expect(methodSummaryLines('pill', undefined, NOW)).toEqual(['Method: Birth control pill']);
    expect(methodSummaryLines('implant', { fitted: '2025-03-04', replace: '2028-03-04' }, NOW))
      .toEqual(['Method: Implant', 'Put in: 4 Mar 2025', 'Replace by: 4 Mar 2028']);
    expect(methodSummaryLines('ring', { cycleStart: day(-3) }, NOW))
      .toEqual(['Method: Vaginal ring', 'Current cycle started: 24 Nov 2026', 'Next: Ring out (ring-free week): 15 Dec 2026']);
  });
});
