import { useCallback, useEffect, useState } from 'react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { emitHealthDataChange, onHealthDataChange } from '@/lib/data-events';
import { EMPTY_IVF_PLAN, IVF_PLAN_LOCAL_KEY, parseIvfPlan, type IvfPlan } from '@/lib/ivfJourney';

// Her IVF treatment dates (src/lib/ivfJourney.ts), saved to her account
// (ivf_plans, migration 022) with a device copy in localStorage. Before
// the migration is applied the dates simply stay on this device, and the
// trigger-shot phone reminder cannot be sent (the app says so).

export type IvfSaveState = 'idle' | 'saving' | 'saved' | 'device';

function readLocal(userId: string): IvfPlan | null {
  try {
    const raw = localStorage.getItem(IVF_PLAN_LOCAL_KEY(userId));
    return raw ? parseIvfPlan(raw) : null;
  } catch { return null; }
}

/** `enabled: false` skips loading (Home's header asks only in the IVF stage). */
export function useIvfPlan({ enabled = true }: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  const userId = enabled ? user?.id : undefined;
  const [plan, setPlan] = useState<IvfPlan>(EMPTY_IVF_PLAN);
  const [loaded, setLoaded] = useState(false);
  const [serverOk, setServerOk] = useState(true);
  const [saveState, setSaveState] = useState<IvfSaveState>('idle');

  const load = useCallback(async () => {
    if (!userId) return;
    const local = readLocal(userId);
    if (local) setPlan(local);
    const { data, error } = await db.from('ivf_plans').select('plan').eq('user_id', userId).maybeSingle();
    if (error) { setServerOk(false); setLoaded(true); return; }
    setServerOk(true);
    const row = data as { plan: unknown } | null;
    if (row) {
      const p = parseIvfPlan(row.plan);
      setPlan(p);
      try { localStorage.setItem(IVF_PLAN_LOCAL_KEY(userId), JSON.stringify(p)); } catch { /* private mode */ }
    }
    setLoaded(true);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => onHealthDataChange(() => { void load(); }), [load]);

  const save = useCallback(async (next: IvfPlan): Promise<IvfSaveState> => {
    const clean = parseIvfPlan(next);
    setPlan(clean);
    if (!userId) return 'device';
    try { localStorage.setItem(IVF_PLAN_LOCAL_KEY(userId), JSON.stringify(clean)); } catch { /* private mode */ }
    setSaveState('saving');
    const { error } = await db.from('ivf_plans').upsert(
      {
        user_id: userId,
        plan: JSON.stringify(clean),
        trigger_at: clean.triggerAt,
        trigger_timezone: clean.triggerTz,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    const state: IvfSaveState = error ? 'device' : 'saved';
    if (error) setServerOk(false);
    setSaveState(state);
    emitHealthDataChange();
    return state;
  }, [userId]);

  return { plan, loaded, serverOk, saveState, save };
}
