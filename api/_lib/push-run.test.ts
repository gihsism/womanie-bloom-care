import { describe, it, expect, vi } from 'vitest';
import { runSendDue, type Query, type Sender } from './push-run';
import type { SubscriptionRow } from './push-schedule';

// In-memory stand-in for the tables the run reads; answers by SQL shape.
function fakeDb(opts: { subs: SubscriptionRow[]; meds?: unknown[]; doses?: unknown[]; periods?: unknown[]; profiles?: unknown[]; appts?: unknown[] }) {
  const sentLog = new Set<string>();
  let subs = [...opts.subs];
  const deletedSubs: string[] = [];
  const query: Query = vi.fn(async (text: string, params: unknown[] = []) => {
    const ids = (params[0] ?? []) as string[];
    const mine = (rows: unknown[] = []) => rows.filter(r => ids.includes((r as { user_id: string }).user_id));
    if (text.startsWith('SELECT id, user_id, endpoint')) return subs;
    if (text.includes('FROM medications')) return mine(opts.meds);
    if (text.includes('FROM life_events')) return mine(opts.doses);
    if (text.includes('FROM period_tracking')) return mine(opts.periods);
    if (text.includes('FROM profiles')) return mine(opts.profiles);
    if (text.includes('FROM appointments')) return mine(opts.appts);
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
});
