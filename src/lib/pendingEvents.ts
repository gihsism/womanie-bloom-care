// Offline queue for life_events (contractions, kick sessions).
// When saving to the account fails (no signal in the delivery room), the
// finished entry is kept on the device and sent later. Pure helpers over a
// small key-value store so they can be tested without a browser.

export interface PendingEvent<D = Record<string, unknown>> {
  localId: string;
  occurred_at: string; // ISO
  ended_at: string | null;
  data?: D;
}

export interface QueueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const pendingKey = (userId: string, kind: string) => `womanie_pending_${kind}_${userId}`;

export function readQueue<D>(store: QueueStore, key: string): PendingEvent<D>[] {
  try {
    const raw = store.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((p): p is PendingEvent<D> => !!p && typeof p.localId === 'string' && typeof p.occurred_at === 'string')
      : [];
  } catch {
    return [];
  }
}

export function writeQueue<D>(store: QueueStore, key: string, queue: PendingEvent<D>[]): void {
  try {
    if (queue.length === 0) store.removeItem(key);
    else store.setItem(key, JSON.stringify(queue));
  } catch {
    // Quota / private mode: the entry stays in memory only.
  }
}

export function enqueue<D>(queue: PendingEvent<D>[], e: PendingEvent<D>): PendingEvent<D>[] {
  return queue.some(q => q.localId === e.localId) ? queue : [...queue, e];
}

export function dropFromQueue<D>(queue: PendingEvent<D>[], localId: string): PendingEvent<D>[] {
  return queue.filter(q => q.localId !== localId);
}

/**
 * Sends queued entries one by one. An entry whose start time already
 * exists in the account (a save that reached the server but whose answer
 * was lost) is dropped instead of sent twice. Returns what is still left.
 */
export async function flushQueue<D>(
  queue: PendingEvent<D>[],
  savedStarts: Set<string>,
  send: (e: PendingEvent<D>) => Promise<boolean>,
): Promise<PendingEvent<D>[]> {
  const left: PendingEvent<D>[] = [];
  for (const e of queue) {
    if (savedStarts.has(new Date(e.occurred_at).toISOString())) continue;
    let ok = false;
    try { ok = await send(e); } catch { ok = false; }
    if (!ok) left.push(e);
  }
  return left;
}
