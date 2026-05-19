import { useEffect, useState } from 'react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';

// One in-memory store shared by every consumer on a given page. The
// three lab-insights cards (Cycle, Mode, Pregnancy) previously each
// fired their own SELECT on medical_extracted_data and each subscribed
// to onHealthDataChange — so a single emit triggered three redundant
// trips to Neon on every dashboard load. Same query, same user, same
// page lifetime: one fetch is the right number.
//
// The cache is per-user, lives in module scope, and is invalidated on
// onHealthDataChange + on user switch. Promise dedupe keeps a burst of
// simultaneous mounts from racing.

export interface LabResult {
  title: string;
  value: string | number | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
}

type CacheEntry = {
  rows: LabResult[];
  loadedAt: number;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<LabResult[]>>();
const subscribers = new Map<string, Set<() => void>>();
let dataEventsBound = false;

function notify(userId: string) {
  const subs = subscribers.get(userId);
  if (!subs) return;
  for (const cb of subs) {
    try {
      cb();
    } catch (e) {
      console.error('useLabResults subscriber threw:', e);
    }
  }
}

function invalidateAndRefetch() {
  // Wipe every cached user — a "health data changed" event is global so
  // we can't tell which user's data shifted. Subscribers refetch lazily.
  cache.clear();
  for (const userId of subscribers.keys()) {
    fetchForUser(userId).then(() => notify(userId));
  }
}

function bindDataEvents() {
  if (dataEventsBound) return;
  dataEventsBound = true;
  onHealthDataChange(invalidateAndRefetch);
}

async function fetchForUser(userId: string): Promise<LabResult[]> {
  const existing = inflight.get(userId);
  if (existing) return existing;
  const promise = (async () => {
    const { data } = await db
      .from('medical_extracted_data')
      .select('title, value, unit, reference_range, status')
      .eq('user_id', userId)
      .eq('data_type', 'lab_result');
    const rows = (data as LabResult[] | null) ?? [];
    cache.set(userId, { rows, loadedAt: Date.now() });
    inflight.delete(userId);
    return rows;
  })();
  inflight.set(userId, promise);
  return promise;
}

export interface UseLabResults {
  labs: LabResult[];
  loading: boolean;
}

export function useLabResults(): UseLabResults {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const cached = userId ? cache.get(userId) : null;
  const [labs, setLabs] = useState<LabResult[]>(cached?.rows ?? []);
  const [loading, setLoading] = useState<boolean>(!cached && !!userId);

  useEffect(() => {
    if (!userId) {
      setLabs([]);
      setLoading(false);
      return;
    }
    bindDataEvents();

    const subs = subscribers.get(userId) ?? new Set<() => void>();
    const sync = () => {
      const c = cache.get(userId);
      setLabs(c?.rows ?? []);
      setLoading(!c);
    };
    subs.add(sync);
    subscribers.set(userId, subs);

    const cachedNow = cache.get(userId);
    if (cachedNow) {
      setLabs(cachedNow.rows);
      setLoading(false);
    } else {
      setLoading(true);
      fetchForUser(userId).then(() => sync());
    }

    return () => {
      subs.delete(sync);
      if (subs.size === 0) subscribers.delete(userId);
    };
  }, [userId]);

  return { labs, loading };
}
