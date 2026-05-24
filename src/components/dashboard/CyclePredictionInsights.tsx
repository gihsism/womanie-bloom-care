import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Info, FlaskConical } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { useCyclePrediction, type PeriodRecord, type DaySignal } from '@/hooks/useCyclePrediction';
import { useUserHealthContext } from '@/hooks/useUserHealthContext';
import type { LifeStage } from './DashboardHeader';

// Surfaces the lab- and age-aware reasoning that useCyclePrediction's
// `riskFactors` already computes, in a small dashboard card. Hides
// itself when there's nothing to flag — so users with normal labs +
// regular cycles never see it.

interface CyclePredictionInsightsProps {
  mode: LifeStage;
}

const RELEVANT_MODES: LifeStage[] = [
  'menstrual-cycle', 'conception', 'pre-menstrual', 'contraception', 'menopause',
];

export default function CyclePredictionInsights({ mode }: CyclePredictionInsightsProps) {
  const { user } = useAuth();
  const [periodRecords, setPeriodRecords] = useState<PeriodRecord[]>([]);
  const [daySignals] = useState<Record<string, DaySignal>>({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from('period_tracking')
      .select('id, period_start_date, period_end_date, cycle_length')
      .eq('user_id', user.id)
      .order('period_start_date', { ascending: false });
    setPeriodRecords((data ?? []) as PeriodRecord[]);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const healthContext = useUserHealthContext();
  const prediction = useCyclePrediction({ periodRecords, daySignals, healthContext });

  const items = useMemo(() => prediction.riskFactors, [prediction.riskFactors]);

  if (!RELEVANT_MODES.includes(mode)) return null;
  if (!loaded || !healthContext.loaded) return null;
  if (items.length === 0) return null;

  return (
    <Card className="p-4 mb-4 border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-900/10">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <FlaskConical className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        </div>
        <div>
          <p className="text-sm font-semibold">Cycle prediction context</p>
          <p className="text-[11px] text-muted-foreground">
            What your labs and age tell us about prediction reliability.
          </p>
        </div>
      </div>
      <ul className="space-y-1.5">
        {items.map((line, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-foreground/90">
            <Info className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300 flex-shrink-0 mt-0.5" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground mt-2">
        These are population-level signals, not a diagnosis. Discuss with your clinician.
      </p>
    </Card>
  );
}
