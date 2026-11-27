import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/integrations/db/client';
import { emitHealthDataChange } from '@/lib/data-events';
import { flushUpserts, isNetworkFailure, type PendingUpsert, type SendResult } from '@/lib/pendingUpserts';

// Sends what was saved on the phone while offline (today's log) as soon as
// the connection is back: on start, on the 'online' event, and whenever the
// app comes back to the front. Renders nothing.

export async function sendPendingUpsert(e: PendingUpsert): Promise<SendResult> {
  const { error } = await db.from(e.table).upsert(e.row, { onConflict: e.onConflict });
  if (!error) return 'ok';
  return isNetworkFailure(error) ? 'network' : 'rejected';
}

export function PendingSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const busy = useRef(false);

  useEffect(() => {
    if (!userId) return;
    const run = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const { sent } = await flushUpserts(localStorage, userId, sendPendingUpsert);
        if (sent > 0) emitHealthDataChange();
      } catch {
        // Storage unavailable: nothing to send.
      } finally {
        busy.current = false;
      }
    };
    void run();
    const onOnline = () => { void run(); };
    const onBack = () => { if (document.visibilityState === 'visible') void run(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onBack);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onBack);
    };
  }, [userId]);

  return null;
}

export default PendingSync;
