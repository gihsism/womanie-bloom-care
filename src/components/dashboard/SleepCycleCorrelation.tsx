import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Moon, Info } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { differenceInDays, format, parseISO, subDays } from 'date-fns';
import type { LifeStage } from './DashboardHeader';

// Cross-references sleep entries against the user's cycle to show
// whether sleep duration tracks cycle phase. Surfaces a card only
// when there's enough overlap (≥3 sleep entries in at least 2 phases)
// AND the phase-to-phase delta is meaningful (≥0.5 h).
//
// Data sources:
//   - period_tracking: cycle starts
//   - daily_health_signals.notes: "Sleep: 7.5h" segments written by
//     DailyLogging in any mode
//
// Phase mapping is the same as SymptomPatternsCard:
//   menstrual (days 0..periodLength-1)
//   follicular (post-period, pre-fertile)
//   fertile/ovulation (3 days before luteal start)
//   luteal (between ovulation+1 and pms)
//   late_luteal (last 5 days of the cycle, the PMS window)
//
// Hidden in non-cycle modes (pregnancy / postpartum / menopause).

type Phase = 'menstrual' | 'follicular' | 'fertile' | 'luteal' | 'late_luteal';

const PHASE_LABEL: Record<Phase, string> = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  fertile: 'Ovulation',
  luteal: 'Luteal',
  late_luteal: 'Late luteal (PMS)',
};

const PHASE_TONE: Record<Phase, string> = {
  menstrual: 'bg-primary/15 text-primary',
  follicular: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  fertile: 'bg-secondary/20 text-secondary-foreground',
  luteal: 'bg-muted text-foreground/80',
  late_luteal: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
};

const RELEVANT_MODES: LifeStage[] = [
  'menstrual-cycle', 'conception', 'pre-menstrual', 'contraception',
];

const MIN_VALID_CYCLE = 18;
const MAX_VALID_CYCLE = 60;
const DEFAULT_PERIOD_LEN = 5;
const LUTEAL_LEN = 14;

interface PeriodRow {
  period_start_date: string;
  period_end_date: string | null;
  cycle_length: number | null;
}

interface SignalRow {
  signal_date: string;
  notes: string | null;
}

function classifyPhase(daysSinceStart: number, periodLength: number, cycleLength: number): Phase | null {
  if (daysSinceStart < 0 || daysSinceStart >= cycleLength) return null;
  if (daysSinceStart < periodLength) return 'menstrual';
  const ovulationDay = cycleLength - LUTEAL_LEN;
  if (ovulationDay - 1 <= daysSinceStart && daysSinceStart <= ovulationDay + 1) return 'fertile';
  if (daysSinceStart < ovulationDay - 1) return 'follicular';
  if (daysSinceStart >= cycleLength - 5) return 'late_luteal';
  return 'luteal';
}

interface Props {
  mode: LifeStage;
}

export default function SleepCycleCorrelation({ mode }: Props) {
  const { user } = useAuth();
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const cutoff = format(subDays(new Date(), 180), 'yyyy-MM-dd');
    const [{ data: pData }, { data: sData }] = await Promise.all([
      db.from('period_tracking')
        .select('period_start_date, period_end_date, cycle_length')
        .eq('user_id', user.id)
        .gte('period_start_date', cutoff)
        .order('period_start_date', { ascending: true }),
      db.from('daily_health_signals')
        .select('signal_date, notes')
        .eq('user_id', user.id)
        .gte('signal_date', cutoff),
    ]);
    setPeriods((pData ?? []) as PeriodRow[]);
    setSignals((sData ?? []) as SignalRow[]);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const result = useMemo(() => {
    if (periods.length === 0 || signals.length === 0) return null;

    const periodsAsc = [...periods].sort(
      (a, b) => Date.parse(a.period_start_date) - Date.parse(b.period_start_date)
    );

    // Per phase: sum hours + count of valid entries.
    const buckets: Record<Phase, { sum: number; n: number }> = {
      menstrual: { sum: 0, n: 0 },
      follicular: { sum: 0, n: 0 },
      fertile: { sum: 0, n: 0 },
      luteal: { sum: 0, n: 0 },
      late_luteal: { sum: 0, n: 0 },
    };

    for (const s of signals) {
      const hoursMatch = (s.notes ?? '').match(/Sleep:\s*(\d+(?:\.\d+)?)\s*h/i);
      if (!hoursMatch) continue;
      const hours = parseFloat(hoursMatch[1]);
      if (!Number.isFinite(hours) || hours < 1 || hours > 16) continue;

      const date = parseISO(s.signal_date);

      // Find the owning cycle.
      let owning: PeriodRow | null = null;
      let nextStart: Date | null = null;
      for (let i = 0; i < periodsAsc.length; i++) {
        const start = parseISO(periodsAsc[i].period_start_date);
        if (date < start) break;
        owning = periodsAsc[i];
        nextStart = i + 1 < periodsAsc.length ? parseISO(periodsAsc[i + 1].period_start_date) : null;
      }
      if (!owning) continue;

      const cycleStart = parseISO(owning.period_start_date);
      const daysSinceStart = differenceInDays(date, cycleStart);
      const cycleLen = nextStart
        ? differenceInDays(nextStart, cycleStart)
        : owning.cycle_length ?? 28;
      if (cycleLen < MIN_VALID_CYCLE || cycleLen > MAX_VALID_CYCLE) continue;

      const periodLen = owning.period_end_date
        ? Math.max(1, differenceInDays(parseISO(owning.period_end_date), cycleStart) + 1)
        : DEFAULT_PERIOD_LEN;

      const phase = classifyPhase(daysSinceStart, periodLen, cycleLen);
      if (!phase) continue;
      buckets[phase].sum += hours;
      buckets[phase].n += 1;
    }

    const means: Partial<Record<Phase, number>> = {};
    let totalN = 0;
    let phasesWithData = 0;
    for (const p of Object.keys(buckets) as Phase[]) {
      const b = buckets[p];
      if (b.n >= 3) {
        means[p] = b.sum / b.n;
        phasesWithData++;
      }
      totalN += b.n;
    }

    if (phasesWithData < 2 || totalN < 8) return null;

    // Overall mean weighted by N (for the headline).
    const overallMean = (
      Object.keys(buckets) as Phase[]
    ).reduce((s, p) => s + buckets[p].sum, 0) / totalN;

    // Phase with the largest negative delta from overall — the
    // "you sleep less in X" insight target.
    let worstPhase: Phase | null = null;
    let worstDelta = 0;
    for (const p of Object.keys(means) as Phase[]) {
      const m = means[p]!;
      const delta = m - overallMean;
      if (delta < worstDelta) {
        worstDelta = delta;
        worstPhase = p;
      }
    }

    const phaseSummary = (Object.keys(buckets) as Phase[]).map(p => ({
      phase: p,
      mean: means[p] ?? null,
      n: buckets[p].n,
    }));

    return { phaseSummary, overallMean, worstPhase, worstDelta, totalN };
  }, [periods, signals]);

  if (!RELEVANT_MODES.includes(mode)) return null;
  if (!loaded) return null;
  if (!result) return null;

  // Hide if no phase deviates by ≥0.5h from overall — there's no
  // story to tell.
  if (Math.abs(result.worstDelta) < 0.5) return null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Moon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Sleep × cycle correlation</p>
          <p className="text-[11px] text-muted-foreground">
            Average sleep hours by cycle phase, last 6 months ({result.totalN} entries)
          </p>
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        {result.phaseSummary
          .filter(s => s.mean !== null)
          .sort((a, b) => (a.mean ?? 0) - (b.mean ?? 0))
          .map(s => (
            <div key={s.phase} className="flex items-center gap-2 text-xs">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${PHASE_TONE[s.phase]} font-medium w-32`}>
                {PHASE_LABEL[s.phase]}
              </span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, ((s.mean ?? 0) / 10) * 100)}%` }}
                />
              </div>
              <span className="font-mono tabular-nums text-foreground/90 w-12 text-right">
                {(s.mean ?? 0).toFixed(1)}h
              </span>
              <span className="text-[10px] text-muted-foreground w-10 text-right">
                ({s.n})
              </span>
            </div>
          ))}
      </div>

      {result.worstPhase && (
        <p className="text-xs flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <span className="text-muted-foreground">
            You sleep about <span className="font-medium text-foreground/80">{Math.abs(result.worstDelta).toFixed(1)} h less</span>{' '}
            during your <span className="font-medium text-foreground/80">{PHASE_LABEL[result.worstPhase].toLowerCase()}</span> phase
            on average.{' '}
            {result.worstPhase === 'late_luteal'
              ? 'Common in the PMS window — progesterone drops, plus body temperature and bloating affect sleep depth.'
              : result.worstPhase === 'menstrual'
                ? 'Cramps and discomfort often disrupt sleep around your period.'
                : 'Worth noting in your cycle log — patterns like this can be a useful conversation with your clinician.'}
          </span>
        </p>
      )}
    </Card>
  );
}
