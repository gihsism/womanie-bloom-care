// Offline queue for "one row per day" writes (today's log). When the save
// fails because there is no connection, the row is kept on the device and
// sent when the connection is back, instead of being lost when the sheet
// closes. One entry per key (table + day): a later save of the same day
// replaces the queued one, so the last thing she typed wins.
//
// Life events (kicks, contractions, medicine ticks) have their own queue in
// pendingEvents.ts; this one is for upserts.

import type { QueueStore } from '@/lib/pendingEvents';

export interface PendingUpsert {
  key: string;
  table: string;
  row: Record<string, unknown>;
  onConflict: string;
  queuedAt: string;
  attempts: number;
}

/** After this many refusals by the server (not network failures) an entry is dropped. */
export const MAX_REJECTIONS = 5;

export const upsertQueueKey = (userId: string) => `womanie_pending_upserts_${userId}`;

export function readUpserts(store: QueueStore, userId: string): PendingUpsert[] {
  try {
    const raw = store.getItem(upsertQueueKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((p): p is PendingUpsert =>
        !!p && typeof p.key === 'string' && typeof p.table === 'string'
        && !!p.row && typeof p.row === 'object' && typeof p.onConflict === 'string')
      : [];
  } catch {
    return [];
  }
}

export function writeUpserts(store: QueueStore, userId: string, queue: PendingUpsert[]): void {
  try {
    if (queue.length === 0) store.removeItem(upsertQueueKey(userId));
    else store.setItem(upsertQueueKey(userId), JSON.stringify(queue));
  } catch {
    // Quota / private mode: nothing more we can do on the device.
  }
}

export function queueUpsert(
  store: QueueStore,
  userId: string,
  e: { key: string; table: string; row: Record<string, unknown>; onConflict: string },
  now = new Date(),
): PendingUpsert[] {
  const next = readUpserts(store, userId).filter(q => q.key !== e.key);
  next.push({ ...e, queuedAt: now.toISOString(), attempts: 0 });
  writeUpserts(store, userId, next);
  return next;
}

export function pendingRow(store: QueueStore, userId: string, key: string): Record<string, unknown> | null {
  return readUpserts(store, userId).find(q => q.key === key)?.row ?? null;
}

/**
 * A failure worth retrying later: the browser is offline, or the request
 * never got an answer (fetch throws a TypeError, which the db client hands
 * back as `error`). A refusal from the server comes back as a plain
 * { error: '...' } object and is not retried.
 */
export function isNetworkFailure(error: unknown, online = typeof navigator === 'undefined' ? true : navigator.onLine): boolean {
  return online === false || error instanceof Error;
}

export type SendResult = 'ok' | 'network' | 'rejected';

/**
 * Sends queued rows in order. Stops at the first network failure (still
 * offline). A server refusal counts an attempt; after MAX_REJECTIONS the
 * entry is dropped so one bad row cannot block the queue forever.
 */
export async function flushUpserts(
  store: QueueStore,
  userId: string,
  send: (e: PendingUpsert) => Promise<SendResult>,
): Promise<{ sent: number; left: number }> {
  const queue = readUpserts(store, userId);
  if (queue.length === 0) return { sent: 0, left: 0 };
  const left: PendingUpsert[] = [];
  let sent = 0;
  let offline = false;
  for (const e of queue) {
    if (offline) { left.push(e); continue; }
    let r: SendResult;
    try { r = await send(e); } catch { r = 'network'; }
    if (r === 'ok') sent++;
    else if (r === 'network') { offline = true; left.push(e); }
    else if (e.attempts + 1 < MAX_REJECTIONS) left.push({ ...e, attempts: e.attempts + 1 });
  }
  // Re-read so a save made while we were sending is not overwritten.
  const sentKeys = new Set(queue.map(q => q.key));
  const fresh = readUpserts(store, userId).filter(q => {
    const old = queue.find(o => o.key === q.key);
    return !sentKeys.has(q.key) || (old && old.queuedAt !== q.queuedAt);
  });
  const merged = [...left.filter(l => !fresh.some(f => f.key === l.key)), ...fresh];
  writeUpserts(store, userId, merged);
  return { sent, left: merged.length };
}
