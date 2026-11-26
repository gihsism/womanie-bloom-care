import { describe, it, expect } from 'vitest';
import {
  EMPTY_IVF_PLAN, addDays, daysBetween, dueTriggerPush, formatCountdown, groupSymptomLog, inAppTriggerAlert,
  ivfStatus, ivfTimeline, localDateTime, nextKeyDate, parseIvfPlan, planIssues, triggerReminderTimes,
  twoWeekWait, zonedTimeToUtc, type IvfPlan,
} from './ivfJourney';

const Z = 'Europe/Zurich';
const plan = (over: Partial<IvfPlan> = {}): IvfPlan => ({ ...EMPTY_IVF_PLAN, ...over });
/** Noon Zurich time on a date (safe instant for "today"). */
const noon = (date: string) => zonedTimeToUtc(date, '12:00', Z);

describe('calendar days across the Zurich clock changes', () => {
  it('counts the spring-forward and fall-back weekends as whole days', () => {
    // 2026: summer time starts Sun 29 March, ends Sun 25 October.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('stim day N runs straight through a clock change', () => {
    const p = plan({ stimStart: '2026-03-25' });
    expect(ivfStatus(p, noon('2026-03-25'), Z).stimDay).toBe(1);
    expect(ivfStatus(p, noon('2026-03-29'), Z).stimDay).toBe(5);
    expect(ivfStatus(p, noon('2026-03-30'), Z).stimDay).toBe(6);
    // Just after local midnight on the change day it is already the new day.
    expect(ivfStatus(p, zonedTimeToUtc('2026-03-29', '00:05', Z), Z).stimDay).toBe(5);
    const autumn = plan({ stimStart: '2026-10-20' });
    expect(ivfStatus(autumn, zonedTimeToUtc('2026-10-25', '23:55', Z), Z).stimDay).toBe(6);
    expect(ivfStatus(autumn, zonedTimeToUtc('2026-10-26', '00:01', Z), Z).stimDay).toBe(7);
  });

  it('converts a typed Zurich time to the right instant in winter and summer', () => {
    expect(zonedTimeToUtc('2026-01-15', '21:30', Z).toISOString()).toBe('2026-01-15T20:30:00.000Z');
    expect(zonedTimeToUtc('2026-07-15', '21:30', Z).toISOString()).toBe('2026-07-15T19:30:00.000Z');
  });

  it('a time inside the spring-forward gap moves forward with the clock', () => {
    const t = zonedTimeToUtc('2026-03-29', '02:30', Z);
    expect(t.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(localDateTime(t, Z)).toEqual({ date: '2026-03-29', time: '03:30' });
  });

  it('a time that happens twice in autumn is read as the first one', () => {
    const t = zonedTimeToUtc('2026-10-25', '02:30', Z);
    expect(t.toISOString()).toBe('2026-10-25T00:30:00.000Z'); // still summer time (UTC+2)
    expect(localDateTime(t, Z)).toEqual({ date: '2026-10-25', time: '02:30' });
  });

  it('a trigger just after midnight on the change night keeps its date', () => {
    const t = zonedTimeToUtc('2026-03-29', '00:30', Z);
    expect(localDateTime(t, Z)).toEqual({ date: '2026-03-29', time: '00:30' });
    const p = plan({ stimStart: '2026-03-18', triggerAt: t.toISOString(), triggerTz: Z });
    expect(nextKeyDate(p, zonedTimeToUtc('2026-03-28', '22:00', Z), Z)).toMatchObject({ key: 'trigger', date: '2026-03-29', daysUntil: 1 });
  });
});

describe('phase derivation', () => {
  const full = plan({
    downregStart: '2026-11-01',
    stimStart: '2026-11-10',
    triggerAt: zonedTimeToUtc('2026-11-20', '21:30', Z).toISOString(),
    triggerTz: Z,
    retrieval: '2026-11-22',
    transfer: '2026-11-27',
    testDate: '2026-12-07',
  });

  it('follows the latest date reached', () => {
    const at = (d: string, t = '12:00') => ivfStatus(full, zonedTimeToUtc(d, t, Z), Z);
    expect(at('2026-10-30').phase).toBeNull();
    expect(at('2026-11-05')).toMatchObject({ phase: 'prep', phaseStart: '2026-11-01', stimDay: null });
    expect(at('2026-11-12')).toMatchObject({ phase: 'stimulation', stimDay: 3 });
    expect(at('2026-11-20', '09:00')).toMatchObject({ phase: 'trigger', stimDay: 11, triggerDone: false });
    expect(at('2026-11-21')).toMatchObject({ phase: 'trigger', stimDay: null, triggerDone: true });
    expect(at('2026-11-22')).toMatchObject({ phase: 'retrieval' });
    expect(at('2026-11-24')).toMatchObject({ phase: 'fertilization', phaseStart: '2026-11-23' });
    expect(at('2026-11-27')).toMatchObject({ phase: 'transfer' });
    expect(at('2026-11-28')).toMatchObject({ phase: 'tww', phaseStart: '2026-11-28' });
    expect(at('2026-12-07')).toMatchObject({ phase: 'beta' });
  });

  it('works for a frozen transfer with no stimulation or retrieval', () => {
    const fet = plan({ transfer: '2026-11-20', testDate: '2026-11-30' });
    expect(ivfStatus(fet, noon('2026-11-19'), Z).phase).toBeNull();
    expect(ivfStatus(fet, noon('2026-11-22'), Z).phase).toBe('tww');
  });

  it('marks the steps done / current / upcoming', () => {
    const steps = ivfTimeline(full, noon('2026-11-12'), Z);
    expect(steps.map(s => `${s.key}:${s.state}`)).toEqual([
      'downreg:done', 'stims:current', 'trigger:upcoming', 'retrieval:upcoming', 'transfer:upcoming', 'tww:upcoming', 'test:upcoming',
    ]);
    // Lab days after retrieval keep the retrieval step current.
    expect(ivfTimeline(full, noon('2026-11-24'), Z).find(s => s.state === 'current')?.key).toBe('retrieval');
  });

  it('hides down-regulation when she has no date for it, and uses the hand-picked phase when no date is reached', () => {
    const steps = ivfTimeline(plan(), noon('2026-11-12'), Z, 'stimulation');
    expect(steps[0].key).toBe('stims');
    expect(steps.find(s => s.state === 'current')?.key).toBe('stims');
    expect(ivfTimeline(plan(), noon('2026-11-12'), Z).every(s => s.state === 'upcoming')).toBe(true);
  });

  it('gives the next key date, the trigger with its exact moment', () => {
    expect(nextKeyDate(full, noon('2026-11-12'), Z)).toMatchObject({ key: 'trigger', date: '2026-11-20', daysUntil: 8, at: full.triggerAt });
    expect(nextKeyDate(full, zonedTimeToUtc('2026-11-20', '22:00', Z), Z)).toMatchObject({ key: 'retrieval', daysUntil: 2 });
    expect(nextKeyDate(full, noon('2026-11-05'), Z)).toMatchObject({ key: 'stims', daysUntil: 5 });
    expect(nextKeyDate(full, noon('2026-12-07'), Z)).toMatchObject({ key: 'test', daysUntil: 0 });
    expect(nextKeyDate(full, noon('2026-12-08'), Z)).toBeNull();
  });

  it('flags dates out of order without blocking', () => {
    expect(planIssues(full, Z)).toEqual([]);
    expect(planIssues(plan({ retrieval: '2026-11-22', transfer: '2026-11-20' }), Z)).toEqual(['Embryo transfer is before egg retrieval']);
  });

  it('parses stored plans defensively', () => {
    expect(parseIvfPlan(null)).toEqual(EMPTY_IVF_PLAN);
    expect(parseIvfPlan('{"stimStart":"2026-02-30","transfer":"2026-11-20","triggerAt":"nope"}')).toEqual({ ...EMPTY_IVF_PLAN, transfer: '2026-11-20' });
    expect(parseIvfPlan({ triggerAt: '2026-11-20T20:30:00Z' })).toMatchObject({ triggerAt: '2026-11-20T20:30:00.000Z', triggerTz: Z });
  });
});

describe('trigger-shot reminders', () => {
  const T = zonedTimeToUtc('2026-11-20', '21:30', Z).toISOString(); // 20:30Z
  const before = (min: number) => new Date(Date.parse(T) - min * 60_000);

  it('the nominal reminder moments are 1 hour and 10 minutes before', () => {
    expect(triggerReminderTimes(T).map(r => [r.kind, localDateTime(r.at, Z).time])).toEqual([['hour', '20:30'], ['ten', '21:20']]);
  });

  it('a 15-minute scheduler always hits each window (repeats are claimed once by key)', () => {
    for (let offset = 0; offset < 15; offset++) {
      const kinds: string[] = [];
      for (let m = 120 - offset; m > -30; m -= 15) {
        const due = dueTriggerPush(T, before(m));
        if (due) kinds.push(due.kind);
      }
      expect([...new Set(kinds)]).toEqual(['hour', 'ten']);
      expect(kinds.filter(k => k === 'ten')).toHaveLength(1);
    }
  });

  it('says the real minutes left, and nothing after the moment', () => {
    expect(dueTriggerPush(T, before(60))).toEqual({ kind: 'hour', minutesLeft: 60 });
    expect(dueTriggerPush(T, before(66))).toBeNull();
    expect(dueTriggerPush(T, before(16))).toEqual({ kind: 'hour', minutesLeft: 16 });
    expect(dueTriggerPush(T, before(15))).toEqual({ kind: 'ten', minutesLeft: 15 });
    expect(dueTriggerPush(T, before(10))).toEqual({ kind: 'ten', minutesLeft: 10 });
    expect(dueTriggerPush(T, before(0))).toBeNull();
    expect(dueTriggerPush(T, before(-5))).toBeNull();
    expect(dueTriggerPush(null, before(10))).toBeNull();
  });

  it('a trigger on the autumn change night still reminds an hour before in real time', () => {
    // 02:30 (first, summer-time) on 25 Oct 2026 = 00:30Z; one real hour before is 23:30Z.
    const t = zonedTimeToUtc('2026-10-25', '02:30', Z).toISOString();
    expect(triggerReminderTimes(t)[0].at.toISOString()).toBe('2026-10-24T23:30:00.000Z');
  });

  it('in-app alert at 60 and 10 minutes and at the moment', () => {
    expect(inAppTriggerAlert(T, before(61))).toBeNull();
    expect(inAppTriggerAlert(T, before(60))).toBe('hour');
    expect(inAppTriggerAlert(T, before(10))).toBe('ten');
    expect(inAppTriggerAlert(T, before(0))).toBe('now');
    expect(inAppTriggerAlert(T, before(-20))).toBeNull();
  });

  it('formats the countdown', () => {
    expect(formatCountdown(2 * 86_400_000 + 4 * 3_600_000)).toBe('2 d 4 h');
    expect(formatCountdown(3 * 3_600_000 + 5 * 60_000)).toBe('3 h 05 min');
    expect(formatCountdown(12 * 60_000 + 4_000)).toBe('12:04');
    expect(formatCountdown(-1)).toBe('0:00');
  });
});

describe('two-week wait', () => {
  const p = plan({ transfer: '2026-11-20', testDate: '2026-11-30' });
  it('counts from the day after the transfer to the day before the test', () => {
    expect(twoWeekWait(p, noon('2026-11-20'), Z)).toBeNull();
    expect(twoWeekWait(p, noon('2026-11-21'), Z)).toEqual({ day: 1, daysToTest: 9, progress: 0.1 });
    expect(twoWeekWait(p, noon('2026-11-29'), Z)).toMatchObject({ day: 9, daysToTest: 1 });
    expect(twoWeekWait(p, noon('2026-11-30'), Z)).toBeNull();
  });
  it('without a test date it counts days only', () => {
    expect(twoWeekWait(plan({ transfer: '2026-11-20' }), noon('2026-11-25'), Z)).toEqual({ day: 5, daysToTest: null, progress: null });
  });
  it('crosses the March clock change as whole days', () => {
    const spring = plan({ transfer: '2026-03-27', testDate: '2026-04-06' });
    expect(twoWeekWait(spring, zonedTimeToUtc('2026-03-30', '00:30', Z), Z)).toMatchObject({ day: 3, daysToTest: 7 });
  });
});

describe('symptom log', () => {
  it('groups by her local day, newest first, without interpretation', () => {
    const rows = groupSymptomLog([
      { occurred_at: '2026-11-21T22:30:00Z', data: { symptoms: ['Cramping'] } }, // 23:30 Zurich, 21 Nov
      { occurred_at: '2026-11-21T23:30:00Z', data: { symptoms: ['Tiredness', 7], note: ' slept badly ' } }, // 00:30, 22 Nov
      { occurred_at: '2026-11-21T08:00:00Z', data: { symptoms: ['Cramping', 'Bloating'] } },
      { occurred_at: 'bad', data: {} },
    ], Z);
    expect(rows).toEqual([
      { date: '2026-11-22', symptoms: ['Tiredness'], notes: ['slept badly'] },
      { date: '2026-11-21', symptoms: ['Cramping', 'Bloating'], notes: [] },
    ]);
  });
});
