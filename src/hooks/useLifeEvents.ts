import { useCallback, useEffect, useState } from 'react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';

// Account-backed log of timed / tapped events (table life_events).
// Used by the contraction timer, kick counter, feeding and baby trackers,
// medicine doses and labour medicines. Rows live in the user's account,
// so they survive a phone change, appear in "Download my data", and are
// removed by account deletion.

export type LifeEventKind =
  | 'contraction'
  | 'kick_session'
  | 'feed'
  | 'baby_sleep'
  | 'nappy'
  | 'baby_growth'
  | 'med_dose'
  | 'labour_med';

export interface LifeEvent<D = Record<string, unknown>> {
  id: string;
  kind: LifeEventKind;
  occurred_at: string; // ISO
  ended_at: string | null;
  baby_id: string | null;
  data: D;
}

interface NewEvent<D> {
  occurred_at: string;
  ended_at?: string | null;
  baby_id?: string | null;
  data?: D;
}

function normalise<D>(row: Record<string, unknown>): LifeEvent<D> {
  let data = row.data as unknown;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { data = {}; }
  }
  return {
    id: String(row.id),
    kind: row.kind as LifeEventKind,
    occurred_at: new Date(row.occurred_at as string).toISOString(),
    ended_at: row.ended_at ? new Date(row.ended_at as string).toISOString() : null,
    baby_id: (row.baby_id as string | null) ?? null,
    data: (data ?? {}) as D,
  };
}

export async function insertLifeEvent<D>(
  userId: string,
  kind: LifeEventKind,
  e: NewEvent<D>,
): Promise<LifeEvent<D> | null> {
  const { data, error } = await db.from('life_events').insert({
    user_id: userId,
    kind,
    occurred_at: e.occurred_at,
    ended_at: e.ended_at ?? null,
    baby_id: e.baby_id ?? null,
    data: JSON.stringify(e.data ?? {}),
  }).select('*');
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? normalise<D>(row as Record<string, unknown>) : null;
}

/**
 * One-time move of history that older app versions kept only on the
 * device (localStorage). Runs once per device+key: entries are inserted
 * into the account, then a marker is stored so they are not imported
 * twice. The original localStorage value is left in place as a backup.
 */
export async function importLocalOnce<T, D>(
  userId: string,
  storageKey: string,
  kind: LifeEventKind,
  toEvent: (item: T) => NewEvent<D> | null,
): Promise<number> {
  const marker = `${storageKey}__imported`;
  let raw: string | null = null;
  try {
    if (localStorage.getItem(marker)) return 0;
    raw = localStorage.getItem(storageKey);
  } catch {
    return 0;
  }
  if (!raw) {
    try { localStorage.setItem(marker, '1'); } catch { /* ignore */ }
    return 0;
  }
  let items: T[] = [];
  try {
    const parsed = JSON.parse(raw);
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    items = [];
  }
  let moved = 0;
  let failed = 0;
  for (const item of items) {
    const ev = toEvent(item);
    if (!ev) continue;
    const saved = await insertLifeEvent(userId, kind, ev);
    if (saved) moved++; else failed++;
  }
  // Only mark done when everything made it; otherwise retry next load.
  if (failed === 0) {
    try { localStorage.setItem(marker, '1'); } catch { /* ignore */ }
  }
  return moved;
}

export function useLifeEvents<D = Record<string, unknown>>(
  kind: LifeEventKind,
  opts: { limit?: number; babyId?: string | null; beforeLoad?: (userId: string) => Promise<unknown> } = {},
) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const { limit = 200, babyId, beforeLoad } = opts;
  const [events, setEvents] = useState<LifeEvent<D>[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    let q = db.from('life_events').select('*')
      .eq('user_id', userId)
      .eq('kind', kind);
    if (babyId) q = q.eq('baby_id', babyId);
    const { data, error: err } = await q
      .order('occurred_at', { ascending: false })
      .limit(limit);
    if (err) {
      setError('Could not load your saved entries.');
    } else {
      setError(null);
      setEvents(((data ?? []) as Record<string, unknown>[]).map(r => normalise<D>(r)));
    }
    setLoaded(true);
  }, [userId, kind, babyId, limit]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      if (beforeLoad) {
        try { await beforeLoad(userId); } catch { /* import is best-effort */ }
      }
      if (!cancelled) await reload();
    })();
    return () => { cancelled = true; };
    // beforeLoad is intentionally excluded: callers pass inline functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, reload]);

  const add = useCallback(async (e: NewEvent<D>) => {
    if (!userId) return null;
    const saved = await insertLifeEvent<D>(userId, kind, { ...e, baby_id: e.baby_id ?? babyId ?? null });
    if (saved) {
      setEvents(prev => [saved, ...prev].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)));
    } else {
      setError('Could not save. Check your connection and try again.');
    }
    return saved;
  }, [userId, kind, babyId]);

  const update = useCallback(async (id: string, patch: { ended_at?: string | null; occurred_at?: string; data?: D }) => {
    if (!userId) return false;
    const body: Record<string, unknown> = {};
    if ('ended_at' in patch) body.ended_at = patch.ended_at;
    if (patch.occurred_at) body.occurred_at = patch.occurred_at;
    if (patch.data) body.data = JSON.stringify(patch.data);
    const { error: err } = await db.from('life_events').update(body).eq('id', id).eq('user_id', userId);
    if (err) {
      setError('Could not save. Check your connection and try again.');
      return false;
    }
    setEvents(prev => prev.map(ev => ev.id === id ? { ...ev, ...patch, data: patch.data ?? ev.data } : ev));
    return true;
  }, [userId]);

  const remove = useCallback(async (id: string) => {
    if (!userId) return false;
    const { error: err } = await db.from('life_events').delete().eq('id', id).eq('user_id', userId);
    if (err) {
      setError('Could not delete. Check your connection and try again.');
      return false;
    }
    setEvents(prev => prev.filter(ev => ev.id !== id));
    return true;
  }, [userId]);

  return { events, loaded, error, add, update, remove, reload, userId };
}
