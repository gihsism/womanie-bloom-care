import { describe, it, expect } from 'vitest';
import {
  planUserReminders, localParts, isQuietHours, inDayWindow, parsePrefs, userTimeZone,
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

  it('defaults every type on', () => {
    expect(parsePrefs(null)).toEqual({ medicine: true, period: true, appointment: true });
  });
});
