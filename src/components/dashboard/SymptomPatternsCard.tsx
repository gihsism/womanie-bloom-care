import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Sparkles } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { parseISO, differenceInDays, format, subDays } from 'date-fns';
import { onHealthDataChange } from '@/lib/data-events';

interface SymptomPatternsCardProps {
  userId: string;
  cycleLength: number;
  periodLength: number;
}

type Phase = 'menstrual' | 'follicular' | 'fertile' | 'late_luteal' | 'luteal';

interface PhaseInfo {
  label: string;
  description: string;
  tone: string;
}

const PHASE_INFO: Record<Phase, PhaseInfo> = {
  menstrual: {
    label: 'During your period',
    description: 'Days 1–5 of your cycle',
    tone: 'bg-primary/10 text-primary border-primary/20',
  },
  follicular: {
    label: 'Follicular phase',
    description: 'After your period, before ovulation',
    tone: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  },
  fertile: {
    label: 'Fertile window',
    description: 'Around ovulation',
    tone: 'bg-secondary/15 text-secondary-foreground border-secondary/30',
  },
  late_luteal: {
    label: 'Late luteal · PMS window',
    description: 'Last ~5 days before your period',
    tone: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  },
  luteal: {
    label: 'Luteal phase',
    description: 'Between ovulation and PMS window',
    tone: 'bg-muted text-foreground border-border',
  },
};

const SYMPTOM_LABEL: Record<string, string> = {
  cramps: 'Cramps',
  headache: 'Headache',
  bloating: 'Bloating',
  tender_breasts: 'Tender breasts',
  back_pain: 'Back pain',
  nausea: 'Nausea',
  fatigue: 'Fatigue',
  acne: 'Acne',
};

const MOOD_LABEL: Record<string, string> = {
  happy: 'Happy',
  sad: 'Sad',
  anxious: 'Anxious',
  irritable: 'Irritable',
  energetic: 'Energetic',
  calm: 'Calm',
};

interface PeriodRow {
  period_start_date: string;
  period_end_date: string | null;
  cycle_length: number | null;
}

interface SignalRow {
  signal_date: string;
  symptoms: string[] | null;
  mood: string[] | null;
}

interface PhaseAggregate {
  totalDays: number;
  symptomCounts: Record<string, number>;
  moodCounts: Record<string, number>;
}

function classifyPhase(daysSinceStart: number, periodLength: number, cycleLength: number): Phase | null {
  if (daysSinceStart < 0 || daysSinceStart >= cycleLength) return null;
  if (daysSinceStart < periodLength) return 'menstrual';
  const ovulationDay = cycleLength - 14;
  if (ovulationDay - 3 <= daysSinceStart && daysSinceStart <= ovulationDay) return 'fertile';
  if (daysSinceStart < ovulationDay - 3) return 'follicular';
  if (daysSinceStart >= cycleLength - 5) return 'late_luteal';
  return 'luteal';
}

function topN(counts: Record<string, number>, labelMap: Record<string, string>, totalDays: number, n = 3) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({
      key,
      label: labelMap[key] ?? key,
      count,
      total: totalDays,
    }));
}

const SymptomPatternsCard = ({ userId, cycleLength, periodLength }: SymptomPatternsCardProps) => {
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = async () => {
    setIsLoading(true);
    try {
      const [{ data: pData }, { data: sData }] = await Promise.all([
        db
          .from('period_tracking')
          .select('period_start_date, period_end_date, cycle_length')
          .eq('user_id', userId)
          .order('period_start_date', { ascending: false }),
        db
          .from('daily_health_signals')
          .select('signal_date, symptoms, mood')
          .eq('user_id', userId)
          .gte('signal_date', format(subDays(new Date(), 180), 'yyyy-MM-dd')),
      ]);
      setPeriods(((pData as PeriodRow[]) || []));
      setSignals(((sData as SignalRow[]) || []));
    } catch (e) {
      console.error('SymptomPatternsCard load error', e);
      setPeriods([]);
      setSignals([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
    return onHealthDataChange(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const aggregates = useMemo(() => {
    const empty: Record<Phase, PhaseAggregate> = {
      menstrual: { totalDays: 0, symptomCounts: {}, moodCounts: {} },
      follicular: { totalDays: 0, symptomCounts: {}, moodCounts: {} },
      fertile: { totalDays: 0, symptomCounts: {}, moodCounts: {} },
      late_luteal: { totalDays: 0, symptomCounts: {}, moodCounts: {} },
      luteal: { totalDays: 0, symptomCounts: {}, moodCounts: {} },
    };

    if (periods.length === 0 || signals.length === 0) return empty;

    // For each signal day, find the cycle it belongs to and classify.
    // Sort periods ascending so we can scan.
    const periodsAsc = [...periods].sort(
      (a, b) => parseISO(a.period_start_date).getTime() - parseISO(b.period_start_date).getTime()
    );

    let totalLoggedDays = 0;
    signals.forEach((s) => {
      if ((!s.symptoms || s.symptoms.length === 0) && (!s.mood || s.mood.length === 0)) return;
      const date = parseISO(s.signal_date);

      // Find the period this date falls inside or after but before the next one.
      let owningPeriod: PeriodRow | null = null;
      let nextPeriodStart: Date | null = null;
      for (let i = 0; i < periodsAsc.length; i++) {
        const start = parseISO(periodsAsc[i].period_start_date);
        if (date < start) break;
        owningPeriod = periodsAsc[i];
        nextPeriodStart = i + 1 < periodsAsc.length ? parseISO(periodsAsc[i + 1].period_start_date) : null;
      }
      if (!owningPeriod) return;

      const cycleStart = parseISO(owningPeriod.period_start_date);
      const daysSinceStart = differenceInDays(date, cycleStart);
      const cycleLen = nextPeriodStart
        ? differenceInDays(nextPeriodStart, cycleStart)
        : (owningPeriod.cycle_length ?? cycleLength);

      // Estimate this cycle's period length from end_date if available, else fall back to user average.
      const thisPeriodLen = owningPeriod.period_end_date
        ? Math.max(1, differenceInDays(parseISO(owningPeriod.period_end_date), cycleStart) + 1)
        : periodLength;

      const phase = classifyPhase(daysSinceStart, thisPeriodLen, cycleLen);
      if (!phase) return;

      empty[phase].totalDays++;
      totalLoggedDays++;
      (s.symptoms || []).forEach((sym) => {
        empty[phase].symptomCounts[sym] = (empty[phase].symptomCounts[sym] || 0) + 1;
      });
      (s.mood || []).forEach((m) => {
        empty[phase].moodCounts[m] = (empty[phase].moodCounts[m] || 0) + 1;
      });
    });

    return empty;
  }, [periods, signals, cycleLength, periodLength]);

  const totalLoggedDays = useMemo(
    () => Object.values(aggregates).reduce((sum, a) => sum + a.totalDays, 0),
    [aggregates]
  );

  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-5 w-40 mb-3" />
        <Skeleton className="h-20 w-full" />
      </Card>
    );
  }

  // Need at least one period record AND a few logged days for this card to be useful.
  if (periods.length === 0 || totalLoggedDays < 3) {
    return null;
  }

  const phasesWithData: Phase[] = (Object.keys(aggregates) as Phase[]).filter(
    (p) => aggregates[p].totalDays > 0 &&
           (Object.keys(aggregates[p].symptomCounts).length > 0 ||
            Object.keys(aggregates[p].moodCounts).length > 0)
  );

  if (phasesWithData.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Activity className="h-4 w-4 text-primary" />
        </div>
        <h3 className="text-sm font-bold">Your symptom patterns</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Based on {totalLoggedDays} {totalLoggedDays === 1 ? 'day' : 'days'} you've logged across the last 6 months.
      </p>

      <div className="space-y-4">
        {phasesWithData.map((phase) => {
          const agg = aggregates[phase];
          const info = PHASE_INFO[phase];
          const topSymptoms = topN(agg.symptomCounts, SYMPTOM_LABEL, agg.totalDays, 4);
          const topMoods = topN(agg.moodCounts, MOOD_LABEL, agg.totalDays, 3);

          return (
            <div key={phase} className="border-l-2 pl-3 py-1" style={{ borderColor: 'currentColor' }}>
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${info.tone}`}>
                  {info.label}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {agg.totalDays} {agg.totalDays === 1 ? 'day' : 'days'} logged
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">{info.description}</p>

              {topSymptoms.length > 0 && (
                <div className="mb-1.5">
                  <div className="text-[11px] text-muted-foreground mb-1">Common symptoms</div>
                  <div className="flex flex-wrap gap-1">
                    {topSymptoms.map((s) => (
                      <Badge key={s.key} variant="secondary" className="text-[11px]">
                        {s.label} · {s.count}/{s.total}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {topMoods.length > 0 && (
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">Common moods</div>
                  <div className="flex flex-wrap gap-1">
                    {topMoods.map((m) => (
                      <Badge key={m.key} variant="outline" className="text-[11px]">
                        {m.label} · {m.count}/{m.total}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-2.5">
        <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Counts show "logged on N of M days I tracked in this phase." More logging sharpens the patterns.
        </span>
      </div>
    </Card>
  );
};

export default SymptomPatternsCard;
