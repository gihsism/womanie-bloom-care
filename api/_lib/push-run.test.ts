import { describe, it, expect, vi } from 'vitest';
import { runSendDue, type Query, type Sender } from './push-run';
import type { SubscriptionRow } from './push-schedule';

// In-memory stand-in for the tables the run reads; answers by SQL shape.
function fakeDb(opts: { subs: SubscriptionRow[]; meds?: unknown[]; doses?: unknown[]; periods?: unknown[]; profiles?: unknown[]; appts?: unknown[]; triggers?: unknown[] | 'missing'; appData?: unknown[]; babies?: unknown[]; babyVax?: unknown[]; births?: unknown[]; visits?: unknown[]; pillSignals?: unknown[] | 'missing'; missingCheckupTables?: boolean }) {
  const sentLog = new Set<string>();
  let subs = [...opts.subs];
  const deletedSubs: string[] = [];
  const query: Query = vi.fn(async (text: string, params: unknown[] = []) => {
    const ids = (params[0] ?? []) as string[];
    const mine = (rows: unknown[] = []) => rows.filter(r => ids.includes((r as { user_id: string }).user_id));
    if (text.startsWith('SELECT id, user_id, endpoint')) return subs;
    if (text.includes('FROM medications')) return mine(opts.meds);
    const checkup = (rows?: unknown[]) => {
      if (opts.missingCheckupTables) throw new Error('relation does not exist');
      return mine(rows);
    };
    if (text.includes("kind = 'baby_vaccine'")) return checkup(opts.babyVax);
    if (text.includes('FROM user_app_data')) return checkup(opts.appData);
    if (text.includes('FROM babies')) return checkup(opts.babies);
    if (text.includes('FROM birth_records')) return checkup(opts.births);
    if (text.includes('FROM appointments') && !text.includes('< $3')) return checkup(opts.visits);
    if (text.includes('FROM daily_health_signals')) {
      if (opts.pillSignals === 'missing') throw new Error('read failed');
      return mine(opts.pillSignals);
    }
    if (text.includes('FROM life_events')) return mine(opts.doses);
    if (text.includes('FROM period_tracking')) return mine(opts.periods);
    if (text.includes('FROM profiles')) return mine(opts.profiles);
    if (text.includes('FROM appointments')) return mine(opts.appts);
    if (text.includes('FROM ivf_plans')) {
      if (opts.triggers === 'missing') throw new Error('relation "ivf_plans" does not exist');
      return mine(opts.triggers);
    }
    if (text.startsWith('INSERT INTO push_sent_log')) {
      const k = `${params[0]}|${params[1]}`;
      if (sentLog.has(k)) return [];
      sentLog.add(k);
      return [{ key: params[1] }];
    }
    if (text.startsWith('DELETE FROM push_sent_log WHERE user_id')) { sentLog.delete(`${params[0]}|${params[1]}`); return []; }
    if (text.startsWith('DELETE FROM push_subscriptions')) {
      deletedSubs.push(String(params[0]));
      subs = subs.filter(s => !(s.id === params[0] && s.user_id === params[1]));
      return [];
    }
    return [];
  });
  return { query, sentLog, deletedSubs };
}

const sub = (user: string, over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: `s${user}`, user_id: user, endpoint: `https://push.example/${user}`, p256dh: 'k', auth: 'a',
  timezone: 'Europe/Zurich', prefs: null, ...over,
});

const AT = new Date('2026-11-26T07:05:00Z'); // 08:05 in Zurich

describe('runSendDue', () => {
  it('sends each user only her own reminders, to her own devices', async () => {
    const db = fakeDb({
      subs: [sub('A'), sub('B')],
      meds: [
        { id: 'mA', user_id: 'A', reminder_times: ['08:00'] },
        { id: 'mB', user_id: 'B', reminder_times: ['12:00'] }, // not due yet
      ],
    });
    const sent: Array<[string, string]> = [];
    const send: Sender = async (s, p) => { sent.push([s.endpoint, p.tag]); return 'sent'; };
    const out = await runSendDue(db.query, send, AT);
    expect(sent).toEqual([['https://push.example/A', 'med-mA-08:00']]);
    expect(out).toMatchObject({ users: 2, planned: 1, sent: 1 });
  });

  it('never sends the same reminder twice across runs', async () => {
    const db = fakeDb({ subs: [sub('A')], meds: [{ id: 'mA', user_id: 'A', reminder_times: ['08:00'] }] });
    const send = vi.fn<Sender>(async () => 'sent');
    await runSendDue(db.query, send, AT);
    const second = await runSendDue(db.query, send, new Date(AT.getTime() + 15 * 60_000));
    expect(send).toHaveBeenCalledTimes(1);
    expect(second.skippedAlreadySent).toBe(1);
  });

  it('reminds the patient the day before a visit she booked, and again after she moves it', async () => {
    // A row exactly as /api/appointments/book writes it (status 'scheduled').
    const booked = { id: 'apt_9', user_id: 'A', scheduled_at: '2026-11-27T09:30:00Z', status: 'scheduled' };
    const db = fakeDb({ subs: [sub('A'), sub('B')], appts: [booked] });
    const sent: Array<[string, string, string]> = [];
    const send: Sender = async (s, p) => { sent.push([s.endpoint, p.tag, p.body]); return 'sent'; };
    const TEN = new Date(AT.getTime() + 2 * 3_600_000); // 10:05 Zurich, inside the day window
    await runSendDue(db.query, send, TEN);
    expect(sent).toEqual([['https://push.example/A', 'appt-apt_9', 'You have a visit tomorrow at 10:30. Tap to prepare your questions.']]);
    const apptQuery = vi.mocked(db.query).mock.calls.find(c => String(c[0]).includes('FROM appointments'))!;
    expect(String(apptQuery[0])).toMatch(/patient_id = ANY\(\$1\)/);
    expect(String(apptQuery[0])).toMatch(/<> 'cancelled'/);
    // Rescheduled to another time tomorrow: a new reminder (the key carries the time).
    booked.scheduled_at = '2026-11-27T13:00:00Z';
    await runSendDue(db.query, send, new Date(TEN.getTime() + 15 * 60_000));
    expect(sent).toHaveLength(2);
  });

  // Editing a medicine (MedicineLog) updates the same row in place: the
  // next run reads the new times, and a dose already reminded of is never
  // pinged again just because its time moved.
  it('an edited reminder time takes effect, without a second ping for a dose already reminded', async () => {
    const meds = [{ id: 'mA', user_id: 'A', reminder_times: ['08:00'] }];
    const db = fakeDb({ subs: [sub('A')], meds });
    const send = vi.fn<Sender>(async () => 'sent');
    await runSendDue(db.query, send, AT); // 08:05: the 08:00 dose
    expect(send).toHaveBeenCalledTimes(1);
    meds[0].reminder_times = ['08:30', '09:00']; // she edits: 08:00 -> 08:30, adds 09:00
    const at0835 = new Date(AT.getTime() + 30 * 60_000);
    const moved = await runSendDue(db.query, send, at0835);
    expect(send).toHaveBeenCalledTimes(1); // same first dose: no repeat
    expect(moved.skippedAlreadySent).toBe(1);
    await runSendDue(db.query, send, new Date(AT.getTime() + 60 * 60_000)); // 09:05
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1].tag).toBe('med-mA-09:00'); // the new second time is sent
    await runSendDue(db.query, send, new Date(AT.getTime() + 75 * 60_000));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('a temporary failure releases both claims, so the next run retries', async () => {
    const db = fakeDb({ subs: [sub('A')], meds: [{ id: 'mA', user_id: 'A', reminder_times: ['08:00'] }] });
    await runSendDue(db.query, async () => 'failed', AT);
    expect([...db.sentLog]).toEqual([]);
    const send = vi.fn<Sender>(async () => 'sent');
    await runSendDue(db.query, send, new Date(AT.getTime() + 15 * 60_000));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('respects opt-out', async () => {
    const db = fakeDb({ subs: [sub('A', { prefs: { medicine: false } })], meds: [{ id: 'mA', user_id: 'A', reminder_times: ['08:00'] }] });
    const send = vi.fn<Sender>(async () => 'sent');
    await runSendDue(db.query, send, AT);
    expect(send).not.toHaveBeenCalled();
  });

  it('removes a device the browser dropped', async () => {
    const db = fakeDb({ subs: [sub('A')], meds: [{ id: 'mA', user_id: 'A', reminder_times: ['08:00'] }] });
    const out = await runSendDue(db.query, async () => 'gone', AT);
    expect(db.deletedSubs).toEqual(['sA']);
    expect(out.removedDevices).toBe(1);
  });

  it('retries next run after a temporary failure', async () => {
    const db = fakeDb({ subs: [sub('A')], meds: [{ id: 'mA', user_id: 'A', reminder_times: ['08:00'] }] });
    await runSendDue(db.query, async () => 'failed', AT);
    expect(db.sentLog.size).toBe(0);
    const send = vi.fn<Sender>(async () => 'sent');
    await runSendDue(db.query, send, new Date(AT.getTime() + 15 * 60_000));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does nothing when nobody opted in', async () => {
    const db = fakeDb({ subs: [] });
    const send = vi.fn<Sender>();
    expect(await runSendDue(db.query, send, AT)).toMatchObject({ users: 0, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends the IVF trigger reminder to a device that opted in, once', async () => {
    const T = '2026-11-20T20:30:00.000Z';
    const db = fakeDb({ subs: [sub('A', { prefs: { ivf_trigger: true } }), sub('B')], triggers: [{ user_id: 'A', trigger_at: new Date(T) }, { user_id: 'B', trigger_at: T }] });
    const sent: string[] = [];
    const send: Sender = async (s, p) => { sent.push(`${s.user_id}:${p.tag}`); return 'sent'; };
    const at = new Date(Date.parse(T) - 8 * 60_000);
    await runSendDue(db.query, send, at);
    await runSendDue(db.query, send, new Date(at.getTime() + 60_000));
    expect(sent).toEqual(['A:ivf-trigger']); // B never opted in
  });

  it('keeps running every other reminder before migration 022 is applied', async () => {
    const db = fakeDb({ subs: [sub('A')], meds: [{ id: 'mA', user_id: 'A', reminder_times: ['08:00'] }], triggers: 'missing' });
    const sent: string[] = [];
    const out = await runSendDue(db.query, async (_s, p) => { sent.push(p.tag); return 'sent'; }, AT);
    expect(sent).toEqual(['med-mA-08:00']);
    expect(out.sent).toBe(1);
  });
  it('sends the check-up reminders from her own account data, and still runs when those tables are missing', async () => {
    const DAY = new Date('2026-11-26T10:05:00Z'); // 11:05 in Zurich
    const opts = {
      subs: [sub('A'), sub('B')],
      profiles: [
        { user_id: 'A', life_stage: 'pregnancy', pregnancy_due_date: '2027-02-04' },
        { user_id: 'B', life_stage: 'postpartum', pregnancy_due_date: null },
      ],
      appData: [
        { user_id: 'A', key: 'preg_vaccinations', value: JSON.stringify({ flu: { receivedDate: '2026-10-01' }, covid: { declined: true } }) },
        // B ticked the milestone: no postnatal push, but her baby is at 2 months.
        { user_id: 'B', key: 'postpartum:milestones', value: { 'six-week-visit': true } },
      ],
      babies: [{ id: 'b1', user_id: 'B', name: 'Mia', birth_date: '2026-09-24' }],
      births: [{ user_id: 'B', birth_at: '2026-10-15T08:00:00Z' }],
      meds: [{ id: 'mA', user_id: 'A', reminder_times: [], name: 'Iron', times_per_day: 1, pack_size: 30, pack_started_on: '2026-10-30' }],
    };
    const db = fakeDb(opts);
    const send: Sender = vi.fn(async () => 'sent' as const);
    const summary = await runSendDue(db.query, send, DAY);
    expect([...db.sentLog].sort()).toEqual([
      'A|pregvax:2027-02-04:tdap',
      'A|supply:mA:2026-11-28',
      'B|babyvax:b1:2 months',
    ]);
    expect(summary.sent).toBe(3);

    const bare = fakeDb({ ...opts, missingCheckupTables: true });
    const s2 = await runSendDue(bare.query, send, DAY);
    expect([...bare.sentLog]).toEqual(['A|supply:mA:2026-11-28']);
    expect(s2.sent).toBe(1);
  });

  it('sends the pill-time reminder from her account data and pill ticks', async () => {
    const PILL_AT = new Date('2026-11-26T20:05:00Z'); // 21:05 Zurich
    const opts = {
      subs: [sub('A'), sub('B')],
      profiles: [
        { user_id: 'A', life_stage: 'contraception', pregnancy_due_date: null },
        { user_id: 'B', life_stage: 'contraception', pregnancy_due_date: null },
      ],
      appData: [
        { user_id: 'A', key: 'contraception:method', value: 'pill' },
        { user_id: 'A', key: 'contraception:reminderTime', value: '21:00' },
        { user_id: 'B', key: 'contraception:method', value: 'pill' },
        { user_id: 'B', key: 'contraception:reminderTime', value: '21:00' },
      ],
      // B already ticked today's pill.
      pillSignals: [{ user_id: 'B', signal_date: '2026-11-26', notes: 'Pill: on-time' }],
    };
    const db = fakeDb(opts);
    const sent: string[] = [];
    const send: Sender = async (s, p) => { sent.push(`${s.user_id}:${p.title}`); return 'sent'; };
    await runSendDue(db.query, send, PILL_AT);
    expect(sent).toEqual(['A:Daily reminder']);
    const sql = (db.query as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0]));
    expect(sql.find(t => t.includes('FROM user_app_data'))).toContain("'contraception:reminderTime'");

    // A failed read of the pill ticks skips only the pill reminder.
    const bad = fakeDb({ ...opts, pillSignals: 'missing' as const, meds: [{ id: 'mA', user_id: 'A', reminder_times: ['21:00'] }] });
    const tags: string[] = [];
    await runSendDue(bad.query, async (_s, p) => { tags.push(p.tag); return 'sent'; }, PILL_AT);
    expect(tags).toEqual(['med-mA-21:00']);
  });
});
