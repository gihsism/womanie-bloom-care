import { describe, it, expect } from 'vitest';
import * as app from '../../src/lib/pillLog';
import { appText, parsePillStatus, pillPackDay, pillPushDue, type PillInput } from './pill-reminder';
import { planUserReminders, type SubscriptionRow, type UserData } from './push-schedule';

const sub = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: 'sA', user_id: 'A', endpoint: 'https://push.example/A', p256dh: 'k', auth: 'a',
  timezone: 'Europe/Zurich', prefs: null, ...over,
});

// 21:05 in Zurich on 26 Nov 2026 (UTC+1).
const AT = new Date('2026-11-26T20:05:00Z');
const TICK_YESTERDAY = { signal_date: '2026-11-25', notes: 'Pill: on-time' };

const data = (over: Partial<UserData> = {}): UserData => ({
  userId: 'A', lifeStage: 'contraception', meds: [], doses: [], period: null, appointments: [],
  contraceptionMethod: 'pill', pillReminderTime: '21:00', pillPackStart: null, pillSignals: [TICK_YESTERDAY],
  ...over,
});

const keys = (d: UserData, at = AT, subs = [sub()]) => planUserReminders(d, subs, at).map(r => r.key);

describe('pill parsers match the app (src/lib/pillLog.ts)', () => {
  it('reads the same tick from the same note', () => {
    for (const n of ['Pill: on-time', 'Mood ok. Pill: LATE', 'pill:missed', 'no pill here', '', null]) {
      expect(parsePillStatus(n)).toBe(app.parsePillStatus(n));
    }
  });
  it('counts the same pack day', () => {
    const now = new Date(2026, 10, 26, 21, 5);
    for (const start of ['2026-11-26', '2026-11-05', '2026-10-29', '2026-12-01', 'bad', null]) {
      expect(pillPackDay(start, now)).toBe(app.pillPackDay(start, now));
    }
  });
  it('reads account values whether parsed or still JSON text', () => {
    expect(appText('pill')).toBe('pill');
    expect(appText('"pill"')).toBe('pill');
    expect(appText('21:30')).toBe('21:30');
    expect(appText('"07:30"')).toBe('07:30');
    expect(appText(null)).toBeNull();
    expect(appText(42)).toBeNull();
  });
});

describe('pill-time phone reminder', () => {
  it('fires at her pill time in her timezone, with a discreet lock-screen text', () => {
    const [r] = planUserReminders(data(), [sub()], AT);
    expect(r.key).toBe('pill:2026-11-26');
    expect(r.type).toBe('pill');
    expect(r.payload.title).toBe('Daily reminder');
    expect(r.payload.body).toContain('21:00');
    expect(`${r.payload.title} ${r.payload.body} ${r.payload.tag}`).not.toMatch(/pill|contracept|birth control|pack/i);
    expect(r.payload.url).toBe('/dashboard/stage#contraception');
  });

  it('waits for the time and gives up after an hour (no stale pile-up)', () => {
    expect(keys(data(), new Date('2026-11-26T19:55:00Z'))).toEqual([]); // 20:55
    expect(keys(data(), new Date('2026-11-26T21:00:00Z'))).toEqual(['pill:2026-11-26']); // 22:00, 60 min late
    expect(keys(data(), new Date('2026-11-26T21:05:00Z'))).toEqual([]); // 22:05
  });

  it('uses the time she set, and 21:00 when she never changed it', () => {
    expect(keys(data({ pillReminderTime: '"07:30"' }), new Date('2026-11-26T06:40:00Z'))).toEqual(['pill:2026-11-26']);
    expect(keys(data({ pillReminderTime: null }))).toEqual(['pill:2026-11-26']);
    expect(keys(data({ pillReminderTime: 'nonsense' }))).toEqual(['pill:2026-11-26']);
  });

  it('a time she chose inside quiet hours is still sent (like medicine times)', () => {
    expect(keys(data({ pillReminderTime: '23:00' }), new Date('2026-11-26T22:10:00Z'))).toEqual(['pill:2026-11-26']);
  });

  it('is not sent once today\'s pill is ticked (any status)', () => {
    for (const notes of ['Pill: on-time', 'Pill: late', 'Pill: missed']) {
      expect(keys(data({ pillSignals: [TICK_YESTERDAY, { signal_date: '2026-11-26', notes }] }))).toEqual([]);
    }
  });

  it('skips the pill-free week (pack days 22-28) like Home', () => {
    expect(keys(data({ pillPackStart: '2026-11-05' }))).toEqual([]); // day 22
    expect(keys(data({ pillPackStart: '2026-11-06' }))).toEqual(['pill:2026-11-26']); // day 21
  });

  it('only in the contraception stage, and only for the pill', () => {
    expect(keys(data({ lifeStage: 'menstrual-cycle' }))).toEqual([]);
    expect(keys(data({ contraceptionMethod: 'iud' }))).toEqual([]);
    expect(keys(data({ contraceptionMethod: '"pill"' }))).toEqual(['pill:2026-11-26']);
  });

  it('method never saved: only for someone who ticked a pill this week', () => {
    expect(keys(data({ contraceptionMethod: null }))).toEqual(['pill:2026-11-26']);
    expect(keys(data({ contraceptionMethod: null, pillSignals: [] }))).toEqual([]);
    expect(keys(data({ contraceptionMethod: null, pillSignals: [{ signal_date: '2026-11-10', notes: 'Pill: on-time' }] }))).toEqual([]);
  });

  it('follows the per-device "Pill time" switch (on for devices saved before it existed)', () => {
    const subs = [sub({ id: 'on', prefs: { medicine: true } }), sub({ id: 'off', prefs: { pill: false } })];
    const [r] = planUserReminders(data(), subs, AT);
    expect(r.subscriptions.map(s => s.id)).toEqual(['on']);
    expect(planUserReminders(data(), [sub({ prefs: { pill: false } })], AT)).toEqual([]);
  });

  it('skips when the account data could not be read', () => {
    expect(keys(data({ pillSignals: undefined }))).toEqual([]);
    expect(keys(data({ contraceptionMethod: undefined }))).toEqual([]);
  });

  it('pure rule reads her wall clock', () => {
    const base: PillInput = { stage: 'contraception', method: 'pill', reminderTime: '08:00', packStartDate: null, signals: [], nowWall: new Date(2026, 10, 26, 8, 30) };
    expect(pillPushDue(base)).toEqual({ time: '08:00', today: '2026-11-26' });
    expect(pillPushDue({ ...base, nowWall: new Date(2026, 10, 26, 7, 59) })).toBeNull();
  });
});
