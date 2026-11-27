import { describe, it, expect } from 'vitest';
import {
  flushUpserts, isNetworkFailure, MAX_REJECTIONS, pendingRow, queueUpsert, readUpserts, upsertQueueKey,
  type PendingUpsert,
} from './pendingUpserts';

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    m,
  };
}
const day = (d: string) => ({ key: `daily_health_signals:${d}`, table: 'daily_health_signals', row: { signal_date: d, mood: ['calm'] }, onConflict: 'user_id,signal_date' });

describe('offline upsert queue', () => {
  it('keeps one entry per key; the later save of the same day wins', () => {
    const s = memStore();
    queueUpsert(s, 'u1', day('2026-11-27'));
    queueUpsert(s, 'u1', { ...day('2026-11-27'), row: { signal_date: '2026-11-27', mood: ['tired'] } });
    queueUpsert(s, 'u1', day('2026-11-26'));
    expect(readUpserts(s, 'u1')).toHaveLength(2);
    expect(pendingRow(s, 'u1', 'daily_health_signals:2026-11-27')).toEqual({ signal_date: '2026-11-27', mood: ['tired'] });
    // Per account: another user on the same phone sees nothing.
    expect(readUpserts(s, 'u2')).toEqual([]);
  });

  it('a corrupt stored value reads as an empty queue', () => {
    const s = memStore();
    s.setItem(upsertQueueKey('u1'), '{nope');
    expect(readUpserts(s, 'u1')).toEqual([]);
  });

  it('sends everything when back online and clears the queue', async () => {
    const s = memStore();
    queueUpsert(s, 'u1', day('2026-11-26'));
    queueUpsert(s, 'u1', day('2026-11-27'));
    const sent: string[] = [];
    const r = await flushUpserts(s, 'u1', async e => { sent.push(e.key); return 'ok'; });
    expect(r).toEqual({ sent: 2, left: 0 });
    expect(sent).toEqual(['daily_health_signals:2026-11-26', 'daily_health_signals:2026-11-27']);
    expect(s.m.size).toBe(0);
  });

  it('stops at the first network failure and keeps the rest untouched', async () => {
    const s = memStore();
    queueUpsert(s, 'u1', day('2026-11-26'));
    queueUpsert(s, 'u1', day('2026-11-27'));
    let calls = 0;
    const r = await flushUpserts(s, 'u1', async () => { calls++; return 'network'; });
    expect(calls).toBe(1);
    expect(r.left).toBe(2);
    expect(readUpserts(s, 'u1').every(e => e.attempts === 0)).toBe(true);
  });

  it('a row the server keeps refusing is dropped after MAX_REJECTIONS tries', async () => {
    const s = memStore();
    queueUpsert(s, 'u1', day('2026-11-27'));
    for (let i = 0; i < MAX_REJECTIONS - 1; i++) {
      await flushUpserts(s, 'u1', async () => 'rejected');
      expect(readUpserts(s, 'u1')).toHaveLength(1);
    }
    await flushUpserts(s, 'u1', async () => 'rejected');
    expect(readUpserts(s, 'u1')).toHaveLength(0);
  });

  it('a save made while the queue was being sent is not lost', async () => {
    const s = memStore();
    queueUpsert(s, 'u1', day('2026-11-27'), new Date('2026-11-27T08:00:00Z'));
    await flushUpserts(s, 'u1', async (e: PendingUpsert) => {
      // She saves the same day again while the old copy is in flight.
      queueUpsert(s, 'u1', { ...e, row: { signal_date: '2026-11-27', mood: ['happy'] } }, new Date('2026-11-27T08:00:05Z'));
      return 'ok';
    });
    expect(pendingRow(s, 'u1', 'daily_health_signals:2026-11-27')).toEqual({ signal_date: '2026-11-27', mood: ['happy'] });
  });

  it('isNetworkFailure: offline or a thrown fetch error, never a server refusal', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'), true)).toBe(true);
    expect(isNetworkFailure({ error: 'Invalid request.' }, false)).toBe(true);
    expect(isNetworkFailure({ error: 'Invalid request.' }, true)).toBe(false);
  });
});
