import { useCallback, useEffect, useState } from 'react';
import { db } from '@/integrations/db/client';

// The day she started trying to conceive: profiles.ttc_start_date
// (migration 025). Until that column exists the date stays on this device
// under the same local key, so the feature works before the migration and
// nothing is lost when it lands (the next save writes the column).

export const ttcLocalKey = (userId: string) => `conception:${userId}:ttcStartDate`;

export function readTtcStartLocal(userId: string): string | null {
  try {
    const v = localStorage.getItem(ttcLocalKey(userId));
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

function writeLocal(userId: string, value: string | null) {
  try {
    if (value) localStorage.setItem(ttcLocalKey(userId), value);
    else localStorage.removeItem(ttcLocalKey(userId));
  } catch { /* private mode */ }
}

/** Save to the profile; always keep the device copy too. Never throws. */
export async function saveTtcStart(userId: string, value: string | null): Promise<void> {
  writeLocal(userId, value);
  try {
    await db.from('profiles').update({ ttc_start_date: value }).eq('id', userId);
  } catch { /* column not there yet (migration 025): the device copy holds it */ }
}

export function useTtcStart(userId: string | undefined) {
  const [ttcStart, setTtcStart] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setTtcStart(readTtcStartLocal(userId));
    (async () => {
      try {
        // select('*'): naming the column would fail the whole read before
        // migration 025 is applied.
        const { data } = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
        const v = (data as { ttc_start_date?: string | null } | null)?.ttc_start_date;
        if (alive && v) {
          const day = String(v).slice(0, 10);
          setTtcStart(day);
          writeLocal(userId, day);
        }
      } catch { /* keep the device copy */ }
    })();
    return () => { alive = false; };
  }, [userId]);

  const save = useCallback(async (value: string | null) => {
    if (!userId) return;
    setTtcStart(value);
    await saveTtcStart(userId, value);
  }, [userId]);

  return { ttcStart, save };
}
