import { useEffect, useState } from 'react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { localDay } from '@/hooks/useStageProfile';
import CyclePredictionInsights from '@/components/dashboard/CyclePredictionInsights';
import CyclePredictionAccuracyCard from '@/components/dashboard/CyclePredictionAccuracyCard';
import SleepCycleCorrelation from '@/components/dashboard/SleepCycleCorrelation';
import SymptomPatternsCard from '@/components/dashboard/SymptomPatternsCard';
import FertileWindowTimingCard from '@/components/dashboard/FertileWindowTimingCard';
import BBTChart from '@/components/dashboard/BBTChart';
import LHSurgeCard from '@/components/dashboard/LHSurgeCard';
import FertilityForecast from '@/components/dashboard/FertilityForecast';
import PeriodFlowCard from '@/components/dashboard/PeriodFlowCard';
import SleepTrendCard from '@/components/dashboard/SleepTrendCard';
import CycleHistoryCard from '@/components/dashboard/CycleHistoryCard';

// Records → My charts: everything the user logged herself, drawn as
// charts. These cards used to stack on Home; they moved here unchanged.
// Which card shows for which life stage is exactly the rule Home used.
// Each card hides itself when it has no data, so a new user sees only
// the one-line hint at the top.

interface PeriodData {
  lastPeriodStart: Date;
  cycleLength: number;
}

const CYCLE: LifeStage[] = ['menstrual-cycle', 'conception'];
const SLEEP: LifeStage[] = ['menstrual-cycle', 'conception', 'pregnancy', 'menopause', 'post-menopause'];

export default function MyCharts({ mode }: { mode: LifeStage }) {
  const { user } = useAuth();
  const [periodData, setPeriodData] = useState<PeriodData | null>(null);

  // Latest logged period (read only), the same query Home uses.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await db
          .from('period_tracking')
          .select('*')
          .eq('user_id', user.id)
          .order('period_start_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        setPeriodData(data ? { lastPeriodStart: localDay(data.period_start_date) ?? new Date(data.period_start_date), cycleLength: data.cycle_length } : null);
      } catch (error) {
        console.error('Error loading period data:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!user) return null;
  const isCycle = CYCLE.includes(mode);
  const showSymptoms = isCycle || mode === 'pre-menstrual';

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Charts of what you log yourself. They fill in as you log periods, temperature, sleep and symptoms.
      </p>
      <div className="space-y-6 [&>*]:!mb-0">
        <CyclePredictionInsights mode={mode} />
        {mode !== 'contraception' && <CyclePredictionAccuracyCard mode={mode} />}
        {(isCycle || mode === 'contraception') && <CycleHistoryCard />}
        {isCycle && periodData && (
          <FertilityForecast lastPeriodStart={periodData.lastPeriodStart} cycleLengthFallback={periodData.cycleLength} />
        )}
        {mode === 'conception' && periodData && (
          <FertileWindowTimingCard userId={user.id} cycleLength={periodData.cycleLength} periodLength={5} />
        )}
        {isCycle && <BBTChart lastPeriodStart={periodData?.lastPeriodStart ?? null} />}
        {mode === 'conception' && <LHSurgeCard />}
        {isCycle && periodData && <PeriodFlowCard lastPeriodStart={periodData.lastPeriodStart} />}
        {SLEEP.includes(mode) && <SleepTrendCard />}
        <SleepCycleCorrelation mode={mode} />
        {showSymptoms && periodData && (
          <SymptomPatternsCard userId={user.id} cycleLength={periodData.cycleLength} periodLength={5} />
        )}
      </div>
    </div>
  );
}
