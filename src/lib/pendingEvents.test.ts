import { describe, it, expect } from 'vitest';
import { dropFromQueue, enqueue, flushQueue, pendingKey, readQueue, writeQueue, type PendingEvent, type QueueStore } from './pendingEvents';

function memory(): QueueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: k => { map.delete(k); } };
}

const e = (id: string, iso: string): PendingEvent => ({ localId: id, occurred_at: iso, ended_at: iso });

describe('offline queue', () => {
  it('round-trips through the store and clears the key when empty', () => {
    const store = memory();
    const key = pendingKey('u1', 'contraction');
    writeQueue(store, key, [e('a', '2026-11-26T08:00:00.000Z')]);
    expect(readQueue(store, key)).toHaveLength(1);
    writeQueue(store, key, []);
    expect(store.map.has(key)).toBe(false);
  });

  it('ignores junk in the store', () => {
    const store = memory();
    store.setItem('k', '{bad');
    expect(readQueue(store, 'k')).toEqual([]);
    store.setItem('k', '[{"x":1}]');
    expect(readQueue(store, 'k')).toEqual([]);
  });

  it('enqueue is idempotent; drop removes', () => {
    const q = enqueue(enqueue([], e('a', '2026-11-26T08:00:00Z')), e('a', '2026-11-26T08:00:00Z'));
    expect(q).toHaveLength(1);
    expect(dropFromQueue(q, 'a')).toEqual([]);
  });

  it('flush sends, keeps failures, and skips entries already saved', async () => {
    const q = [e('a', '2026-11-26T08:00:00.000Z'), e('b', '2026-11-26T08:05:00.000Z'), e('c', '2026-11-26T08:10:00.000Z')];
    const sent: string[] = [];
    const left = await flushQueue(q, new Set(['2026-11-26T08:00:00.000Z']), async (x) => {
      sent.push(x.localId);
      if (x.localId === 'c') throw new Error('offline');
      return true;
    });
    expect(sent).toEqual(['b', 'c']);
    expect(left.map(x => x.localId)).toEqual(['c']);
  });
});
