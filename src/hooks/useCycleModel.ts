import { useCallback, useEffect, useState } from 'react';
import { format, subDays } from 'date-fns';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { useUserHealthContext } from './useUserHealthContext';
import { useCyclePrediction, type DaySignal, type PeriodRecord } from './useCyclePrediction';

// Loads everything the full cycle prediction needs (all logged periods,
// a year of daily signs, lab context) and runs it. Used by the Home dial
// so it shows the same personal prediction as the calendar instead of a
// plain "last start + stored length".

export function useCycleModel(enabled = true) {
  const { user } = useAuth();
  const healthContext = useUserHealthContext();
  const [periodRecords, setPeriodRecords] = useState<PeriodRecord[]>([]);
  const [daySignals, setDaySignals] = useState<Record<string, DaySignal>>({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user || !enabled) return;
    const [{ data: periods }, { data: signals }] = await Promise.all([
      db.from('period_tracking').select('id, period_start_date, period_end_date, cycle_length')
        .eq('user_id', user.id).order('period_start_date', { ascending: false }),
      db.from('daily_health_signals').select('signal_date, symptoms, intercourse, mood, discharge, notes')
        .eq('user_id', user.id).gte('signal_date', format(subDays(new Date(), 400), 'yyyy-MM-dd')),
    ]);
    setPeriodRecords(((periods as PeriodRecord[] | null) ?? []).map(p => ({ ...p, period_start_date: String(p.period_start_date).slice(0, 10), period_end_date: p.period_end_date ? String(p.period_end_date).slice(0, 10) : null })));
    const map: Record<string, DaySignal> = {};
    for (const s of (signals as Array<{ signal_date: string; symptoms: string[] | null; intercourse: unknown; mood: string[] | null; discharge: string | null; notes: string | null }> | null) ?? []) {
      const date = String(s.signal_date).slice(0, 10);
      map[date] = {
        date,
        symptoms: s.symptoms || [],
        intercourse: (s.intercourse as DaySignal['intercourse']) || [],
        mood: s.mood || [],
        discharge: s.discharge || 'none',
        notes: s.notes || '',
      };
    }
    setDaySignals(map);
    setLoaded(true);
  }, [user, enabled]);

  useEffect(() => { load(); return onHealthDataChange(load); }, [load]);

  const prediction = useCyclePrediction({ periodRecords, daySignals, healthContext });
  return { prediction, periodRecords, loaded: loaded && healthContext.loaded };
}
