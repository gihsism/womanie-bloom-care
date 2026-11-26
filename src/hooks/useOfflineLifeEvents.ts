import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { insertLifeEvent, useLifeEvents, type LifeEventKind } from '@/hooks/useLifeEvents';
import {
  dropFromQueue, enqueue, flushQueue, pendingKey, readQueue, writeQueue, type PendingEvent,
} from '@/lib/pendingEvents';

// useLifeEvents plus an offline queue: a finished entry that cannot be
// saved (no signal) is kept on the device, shown as "not synced yet", and
// sent when the connection comes back (online event, app back in front,
// or the next time the card opens).

export type SaveOutcome = 'saved' | 'queued';

export function useOfflineLifeEvents<D = Record<string, unknown>>(
  kind: LifeEventKind,
  opts: Parameters<typeof useLifeEvents<D>>[1] = {},
) {
  const base = useLifeEvents<D>(kind, opts);
  const { userId, loaded, events, reload, add } = base;
  const key = userId ? pendingKey(userId, kind) : null;
  const [pending, setPending] = useState<PendingEvent<D>[]>([]);
  const flushing = useRef(false);

  useEffect(() => {
    setPending(key ? readQueue<D>(localStorage, key) : []);
  }, [key]);

  const save = useCallback((q: PendingEvent<D>[]) => {
    setPending(q);
    if (key) writeQueue(localStorage, key, q);
  }, [key]);

  const flush = useCallback(async () => {
    if (!key || !userId || flushing.current) return;
    const queue = readQueue<D>(localStorage, key);
    if (queue.length === 0) return;
    flushing.current = true;
    try {
      const saved = new Set(events.map(e => e.occurred_at));
      const left = await flushQueue(queue, saved, async (e) =>
        !!(await insertLifeEvent<D>(userId, kind, { occurred_at: e.occurred_at, ended_at: e.ended_at, data: e.data })));
      save(left);
      if (left.length < queue.length) await reload();
    } finally {
      flushing.current = false;
    }
  }, [key, userId, kind, events, save, reload]);

  useEffect(() => {
    if (!loaded) return;
    void flush();
    const onOnline = () => { void flush(); };
    const onBack = () => { if (document.visibilityState === 'visible') void flush(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onBack);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onBack);
    };
  }, [loaded, flush]);

  const addOrQueue = useCallback(async (e: { occurred_at: string; ended_at: string | null; data?: D }): Promise<SaveOutcome> => {
    const saved = await add(e);
    if (saved) return 'saved';
    if (key) save(enqueue(readQueue<D>(localStorage, key), { localId: crypto.randomUUID(), ...e }));
    return 'queued';
  }, [add, key, save]);

  const removePending = useCallback((localId: string) => {
    if (key) save(dropFromQueue(readQueue<D>(localStorage, key), localId));
  }, [key, save]);

  // A failed save that went into the queue is not an error for her.
  const error = useMemo(
    () => (pending.length > 0 && base.error?.startsWith('Could not save') ? null : base.error),
    [pending.length, base.error],
  );

  return { ...base, error, pending, addOrQueue, removePending, flush };
}
