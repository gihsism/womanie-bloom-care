import { describe, it, expect } from 'vitest';
import { dueTriggerPush } from '../../src/lib/ivfJourney';
import {
  planUserReminders, triggerPushDue, localParts, isQuietHours, inDayWindow, parsePrefs, userTimeZone, wallClock, appDataValue,
  type SubscriptionRow, type UserData,
} from './push-schedule';

const sub = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: 'sA', user_id: 'A', endpoint: 'https://push.example/A', p256dh: 'k', auth: 'a',
  timezone: 'Europe/Zurich', prefs: { medicine: true, period: true, appointment: true }, ...over,
});

const data = (over: Partial<UserData> = {}): UserData => ({
  userId: 'A', lifeStage: 'menstrual-cycle', meds: [], doses: [], period: null, appointments: [], ...over,
});

const MED = { id: 'm1', user_id: 'A', reminder_times: ['08:00', '20:00'] };

describe('local time', () => {
  it('reads the clock in her timezone', () => {
    // 07:05 UTC in November = 08:05 in Zurich (UTC+1), 02:05 in New York.
    expect(localParts(new Date('2026-11-26T07:05:00Z'), 'Europe/Zurich')).toEqual({ date: '2026-11-26', minutes: 8 * 60 + 5 });
    expect(localParts(new Date('2026-11-26T07:05:00Z'), 'America/New_York')).toEqual({ date: '2026-11-26', minutes: 2 * 60 + 5 });
    // Summer time: 06:05 UTC in July = 08:05 in Zurich (UTC+2).
    expect(localParts(new Date('2026-07-01T06:05:00Z'), 'Europe/Zurich').minutes).toBe(8 * 60 + 5);
  });

  it('falls back to UTC for an unknown zone', () => {
    expect(localParts(new Date('2026-11-26T07:05:00Z'), 'Not/AZone').minutes).toBe(7 * 60 + 5);
  });

  it('quiet hours are 22:00-07:00', () => {
    expect(isQuietHours(21 * 60 + 59)).toBe(false);
    expect(isQuietHours(22 * 60)).toBe(true);
    expect(isQuietHours(3 * 60)).toBe(true);
    expect(isQuietHours(6 * 60 + 59)).toBe(true);
    expect(isQuietHours(7 * 60)).toBe(false);
    expect(inDayWindow(8 * 60)).toBe(false); // Womanie-timed reminders wait for 09:00
    expect(inDayWindow(9 * 60)).toBe(true);
  });

  it('uses the most recently updated device timezone', () => {
    expect(userTimeZone([
      sub({ timezone: 'America/New_York', updated_at: '2026-01-01' }),
      sub({ timezone: 'Europe/Zurich', updated_at: '2026-11-01' }),
    ])).toBe('Europe/Zurich');
  });
});

describe('medicine reminders', () => {
  it('fires at her local reminder time, not UTC', () => {
    const at = new Date('2026-11-26T07:05:00Z'); // 08:05 Zurich
    const zurich = planUserReminders(data({ meds: [MED] }), [sub()], at);
    expect(zurich.map(r => r.key)).toEqual(['med:m1:2026-11-26:08:00']);
    expect(zurich[0].payload.body).toContain('08:00');
    const ny = planUserReminders(data({ meds: [MED] }), [sub({ timezone: 'America/New_York' })], at);
    expect(ny).toEqual([]); // 02:05 in New York: nothing due yet
  });

  it('skips a time already covered by a logged dose today', () => {
    const at = new Date('2026-11-26T07:05:00Z');
    const doses = [{ user_id: 'A', medication_id: 'm1', occurred_at: '2026-11-26T06:50:00Z' }];
    expect(planUserReminders(data({ meds: [MED], doses }), [sub()], at)).toEqual([]);
    // A dose from yesterday (local) does not count.
    const old = [{ user_id: 'A', medication_id: 'm1', occurred_at: '2026-11-25T19:00:00Z' }];
    expect(planUserReminders(data({ meds: [MED], doses: old }), [sub()], at)).toHaveLength(1);
  });

  it('does not send a reminder more than an hour late', () => {
    const at = new Date('2026-11-26T08:30:00Z'); // 09:30 Zurich
    expect(planUserReminders(data({ meds: [MED] }), [sub()], at)).toEqual([]);
  });

  it('honours a time she set herself inside quiet hours', () => {
    const med = { id: 'm2', user_id: 'A', reminder_times: ['23:00'] };
    const at = new Date('2026-11-26T22:05:00Z'); // 23:05 Zurich
    expect(planUserReminders(data({ meds: [med] }), [sub()], at).map(r => r.type)).toEqual(['medicine']);
  });

  it('reads Postgres array text and ignores junk times', () => {
    const med = { id: 'm3', user_id: 'A', reminder_times: '{08:00,"25:00",bad}' };
    const at = new Date('2026-11-26T07:05:00Z');
    expect(planUserReminders(data({ meds: [med] }), [sub()], at).map(r => r.key)).toEqual(['med:m3:2026-11-26:08:00']);
  });

  it('never names the medicine on the lock screen', () => {
    const med = { id: 'm4', user_id: 'A', reminder_times: ['08:00'], name: 'Sertraline' };
    const r = planUserReminders(data({ meds: [med] }), [sub()], new Date('2026-11-26T07:05:00Z'));
    expect(JSON.stringify(r[0].payload)).not.toContain('Sertraline');
  });
});

describe('period reminders', () => {
  const period = { period_start_date: '2026-10-29', cycle_length: 28 }; // expected 2026-11-26

  it('the day before, in daytime only', () => {
    const d = data({ period });
    expect(planUserReminders(d, [sub()], new Date('2026-11-25T09:00:00Z')).map(r => r.key)).toEqual(['period:soon:2026-11-26']); // 10:00
    expect(planUserReminders(d, [sub()], new Date('2026-11-25T22:00:00Z'))).toEqual([]); // 23:00 quiet
    expect(planUserReminders(d, [sub()], new Date('2026-11-25T05:30:00Z'))).toEqual([]); // 06:30 quiet
    expect(planUserReminders(d, [sub()], new Date('2026-11-25T07:30:00Z'))).toEqual([]); // 08:30 before 09:00
  });

  it('late from 3 to 7 days, once per cycle', () => {
    const d = data({ period });
    const late = planUserReminders(d, [sub()], new Date('2026-11-29T10:00:00Z'));
    expect(late.map(r => r.key)).toEqual(['period:late:2026-11-26']);
    expect(late[0].payload.body).toContain('3 days');
    expect(planUserReminders(d, [sub()], new Date('2026-11-28T10:00:00Z'))).toEqual([]);
    expect(planUserReminders(d, [sub()], new Date('2026-12-10T10:00:00Z'))).toEqual([]);
  });

  it('not in pregnancy or menopause', () => {
    for (const lifeStage of ['pregnancy', 'postpartum', 'menopause']) {
      expect(planUserReminders(data({ period, lifeStage }), [sub()], new Date('2026-11-25T09:00:00Z'))).toEqual([]);
    }
  });
});

describe('visit reminders', () => {
  it('the day before, with her local time', () => {
    const appointments = [{ id: 'ap1', scheduled_at: '2026-11-27T13:30:00Z', status: 'scheduled' }];
    const r = planUserReminders(data({ appointments }), [sub()], new Date('2026-11-26T10:00:00Z'));
    expect(r.map(x => x.type)).toEqual(['appointment']);
    expect(r[0].payload.body).toContain('14:30');
    expect(r[0].payload.body).not.toMatch(/Dr\b/);
  });

  it('uses her calendar day, not UTC', () => {
    // 23:30 UTC on the 26th = 00:30 on the 27th in Zurich -> "tomorrow" there.
    const appointments = [{ id: 'ap2', scheduled_at: '2026-11-26T23:30:00Z', status: null }];
    expect(planUserReminders(data({ appointments }), [sub()], new Date('2026-11-26T10:00:00Z'))).toHaveLength(1);
    expect(planUserReminders(data({ appointments }), [sub({ timezone: 'UTC' })], new Date('2026-11-26T10:00:00Z'))).toHaveLength(0);
  });

  it('skips cancelled visits', () => {
    const appointments = [{ id: 'ap3', scheduled_at: '2026-11-27T13:30:00Z', status: 'Cancelled' }];
    expect(planUserReminders(data({ appointments }), [sub()], new Date('2026-11-26T10:00:00Z'))).toEqual([]);
  });
});

describe('opt-out and ownership', () => {
  const at = new Date('2026-11-26T07:05:00Z');

  it('respects a turned-off type', () => {
    expect(planUserReminders(data({ meds: [MED] }), [sub({ prefs: { medicine: false } })], at)).toEqual([]);
    expect(planUserReminders(data({ meds: [MED] }), [sub({ prefs: '{"medicine":false}' })], at)).toEqual([]);
  });

  it('sends only to the devices that kept the type on', () => {
    const r = planUserReminders(data({ meds: [MED] }), [
      sub({ id: 'phone' }),
      sub({ id: 'laptop', endpoint: 'https://push.example/A2', prefs: { medicine: false } }),
    ], at);
    expect(r[0].subscriptions.map(s => s.id)).toEqual(['phone']);
  });

  it('never targets another user\'s device or uses another user\'s medicine', () => {
    const other = sub({ id: 'sB', user_id: 'B', endpoint: 'https://push.example/B' });
    const medB = { id: 'mB', user_id: 'B', reminder_times: ['08:00'] };
    const r = planUserReminders(data({ meds: [MED, medB] }), [sub(), other], at);
    expect(r.map(x => x.key)).toEqual(['med:m1:2026-11-26:08:00']);
    expect(r.flatMap(x => x.subscriptions).every(s => s.user_id === 'A')).toBe(true);
    // A user with no device of her own gets nothing, even if others have one.
    expect(planUserReminders(data({ meds: [MED] }), [other], at)).toEqual([]);
  });

  it('defaults every type on except the opt-in IVF trigger reminder', () => {
    expect(parsePrefs(null)).toEqual({ medicine: true, period: true, appointment: true, bookings: true, documents: true, ivf_trigger: false, checkups: true });
  });
});

describe('IVF trigger-shot reminders', () => {
  // Trigger at 21:30 Zurich on 20 Nov 2026 = 20:30Z.
  const T = '2026-11-20T20:30:00.000Z';
  const before = (min: number) => new Date(Date.parse(T) - min * 60_000);
  const optIn = (over: Partial<SubscriptionRow> = {}) => sub({ prefs: { ivf_trigger: true }, ...over });

  it('is opt-in: nothing without the switch', () => {
    expect(planUserReminders(data({ lifeStage: 'ivf', ivfTriggerAt: T }), [sub()], before(60))).toEqual([]);
  });

  it('reminds about an hour before and in the last 15 minutes, in her local time', () => {
    const hour = planUserReminders(data({ lifeStage: 'ivf', ivfTriggerAt: T }), [optIn()], before(60));
    expect(hour.map(r => r.key)).toEqual([`ivf-trigger:${T}:hour`]);
    expect(hour[0].payload.body).toBe('Your timed injection is at 21:30, in about 1 hour.');
    expect(hour[0].payload.url).toBe('/dashboard/stage#ivf-trigger');
    const ten = planUserReminders(data({ lifeStage: 'ivf', ivfTriggerAt: T }), [optIn()], before(10));
    expect(ten.map(r => r.key)).toEqual([`ivf-trigger:${T}:ten`]);
    expect(ten[0].payload.body).toBe('Your timed injection is at 21:30, in 10 minutes.');
    expect(planUserReminders(data({ ivfTriggerAt: T }), [optIn()], before(0))).toEqual([]);
  });

  it('is sent in quiet hours (the clinic chose the time) and stays discreet', () => {
    const late = '2026-11-20T22:30:00.000Z'; // 23:30 Zurich
    const r = planUserReminders(data({ ivfTriggerAt: late }), [optIn()], new Date(Date.parse(late) - 10 * 60_000));
    expect(r).toHaveLength(1);
    expect(`${r[0].payload.title} ${r[0].payload.body}`).not.toMatch(/ivf|trigger|ovitrelle|hcg/i);
  });

  it('a new time is a new reminder (keys carry the moment)', () => {
    const moved = '2026-11-20T21:00:00.000Z';
    const r = planUserReminders(data({ ivfTriggerAt: moved }), [optIn()], new Date(Date.parse(moved) - 60 * 60_000));
    expect(r[0].key).toBe(`ivf-trigger:${moved}:hour`);
  });

  it('uses the same windows as the app (src/lib/ivfJourney.ts)', () => {
    for (let m = 130; m >= -20; m--) {
      expect(triggerPushDue(T, before(m))).toEqual(dueTriggerPush(T, before(m)));
    }
    expect(triggerPushDue('garbage', before(10))).toBeNull();
  });
});

describe('Today-list reminders now sent to the phone (2026-11-28)', () => {
  const DAY_AT = new Date('2026-11-26T10:05:00Z'); // 11:05 in Zurich
  const keys = (r: ReturnType<typeof planUserReminders>) => r.map(x => x.key);

  it('a medicine pack running out: once per run-out day, no medicine name, Medicine switch', () => {
    const med = { id: 'm2', user_id: 'A', reminder_times: [], name: 'Iron', times_per_day: 1, pack_size: 30, pack_started_on: '2026-10-30' };
    const r = planUserReminders(data({ meds: [med] }), [sub()], DAY_AT);
    expect(keys(r)).toEqual(['supply:m2:2026-11-28']);
    expect(r[0].payload.body).toBe('A medicine pack runs out in 2 days. Tap to see which one.');
    expect(r[0].payload.body).not.toContain('Iron');
    expect(planUserReminders(data({ meds: [med] }), [sub({ prefs: { medicine: false } })], DAY_AT)).toEqual([]);
    // Womanie picks the time: never before 09:00 or in quiet hours.
    expect(planUserReminders(data({ meds: [med] }), [sub()], new Date('2026-11-26T07:05:00Z'))).toEqual([]);
    expect(planUserReminders(data({ meds: [med] }), [sub()], new Date('2026-11-26T21:30:00Z'))).toEqual([]);
    // A course end date counts too; nothing when neither is known.
    const course = { id: 'm3', user_id: 'A', reminder_times: [], name: 'Antibiotic', ends_on: '2026-11-26' };
    expect(planUserReminders(data({ meds: [course] }), [sub()], DAY_AT)[0].payload.body).toBe('A medicine course ends today. Tap to see which one.');
    expect(planUserReminders(data({ meds: [{ id: 'm4', user_id: 'A', reminder_times: [], name: 'X' }] }), [sub()], DAY_AT)).toEqual([]);
  });

  it('pregnancy vaccinations due now (account-synced marks), one push per set of due vaccinations', () => {
    // Due 2027-02-04 -> week 30 on 26 Nov 2026: Tdap, flu and COVID are in their window; flu is marked received.
    const preg = data({ lifeStage: 'pregnancy', pregnancyDueDate: '2027-02-04', pregVaccines: JSON.stringify({ flu: { receivedDate: '2026-10-01' } }) });
    const r = planUserReminders(preg, [sub()], DAY_AT);
    expect(keys(r)).toEqual(['pregvax:2027-02-04:covid,tdap']);
    expect(r[0].type).toBe('checkups');
    expect(r[0].payload.body).toBe('2 vaccinations are recommended around this week. Tap to see which.');
    expect(r[0].payload.url).toBe('/dashboard/stage#vaccinations');
    // "Not now" and received marks hide them; the switch turns them off; other stages get none.
    expect(planUserReminders({ ...preg, pregVaccines: { tdap: { declined: true }, covid: { receivedDate: '2026-11-01' }, flu: { declined: true } } }, [sub()], DAY_AT)).toEqual([]);
    expect(planUserReminders(preg, [sub({ prefs: { checkups: false } })], DAY_AT)).toEqual([]);
    expect(planUserReminders({ ...preg, pregVaccines: undefined }, [sub()], DAY_AT)).toEqual([]); // marks unreadable: no guess
    expect(planUserReminders({ ...preg, lifeStage: 'postpartum' }, [sub()], DAY_AT).filter(x => x.key.startsWith('pregvax'))).toEqual([]);
  });

  it('a baby at a common vaccination age with nothing logged: once per baby and age', () => {
    const pp = data({ lifeStage: 'postpartum', babies: [{ id: 'b1', name: 'Mia', birth_date: '2026-09-24' }] });
    const r = planUserReminders(pp, [sub()], DAY_AT);
    expect(keys(r)).toEqual(['babyvax:b1:2 months']);
    expect(r[0].payload.body).toBe('Mia is 2 months: a common age for vaccinations. Check the vaccine booklet.');
    expect(planUserReminders(data({ lifeStage: 'postpartum', babies: [{ id: 'b1', name: 'Mia', birth_date: '2026-09-24', lastVaccineAt: '2026-11-25T10:00:00Z' }] }), [sub()], DAY_AT)).toEqual([]);
  });

  it('the 6-week postnatal check: weeks 5-8 after the birth, no visit since, milestone not ticked', () => {
    const known = { visitTimes: [], postpartumMilestones: null };
    const pp = data({ lifeStage: 'postpartum', birthAt: '2026-10-15T08:00:00Z', ...known });
    const r = planUserReminders(pp, [sub()], DAY_AT);
    expect(keys(r)).toEqual(['postnatal:2026-10-15']);
    expect(r[0].payload.url).toBe('/dashboard/stage#recovery');
    expect(planUserReminders({ ...pp, visitTimes: ['2026-11-20T09:00:00Z'] }, [sub()], DAY_AT)).toEqual([]);
    expect(planUserReminders({ ...pp, visitTimes: ['2026-10-01T09:00:00Z'] }, [sub()], DAY_AT)).toHaveLength(1); // a visit before the birth does not count
    expect(planUserReminders({ ...pp, postpartumMilestones: JSON.stringify({ 'six-week-visit': true }) }, [sub()], DAY_AT)).toEqual([]);
    expect(planUserReminders(pp, [sub({ prefs: { checkups: false } })], DAY_AT)).toEqual([]);
    // The birth day is HER calendar day: 23:30Z on 14 Oct is 00:30 on 15 Oct in Zurich.
    expect(keys(planUserReminders(data({ lifeStage: 'postpartum', birthAt: '2026-10-14T23:30:00Z', ...known }), [sub()], DAY_AT))).toEqual(['postnatal:2026-10-15']);
    // Without a birth record, the youngest baby's birth date is used.
    expect(keys(planUserReminders(data({ lifeStage: 'postpartum', birthAt: null, babies: [{ id: 'b2', name: 'Leo', birth_date: '2026-10-15' }], ...known }), [sub()], DAY_AT))).toEqual(['postnatal:2026-10-15']);
    // Anything unreadable (undefined): no guess, no push.
    expect(planUserReminders({ ...pp, visitTimes: undefined }, [sub()], DAY_AT)).toEqual([]);
    expect(planUserReminders({ ...pp, postpartumMilestones: undefined }, [sub()], DAY_AT)).toEqual([]);
  });

  it('reads her calendar day in her timezone', () => {
    const t = new Date('2026-11-26T23:30:00Z'); // still 26 Nov in New York (18:30), 27 Nov in Zurich (quiet hours)
    expect(wallClock(t, 'America/New_York').getDate()).toBe(26);
    expect(wallClock(t, 'Europe/Zurich').getDate()).toBe(27);
    expect(appDataValue('{"a":1}')).toEqual({ a: 1 });
    expect(appDataValue({ a: 1 })).toEqual({ a: 1 });
    expect(appDataValue('not json')).toBeNull();
  });
});
