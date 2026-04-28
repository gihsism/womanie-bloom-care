import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Heart, Target, AlertCircle } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { parseISO, differenceInDays, format, addDays, subDays } from 'date-fns';
import { onHealthDataChange } from '@/lib/data-events';

interface FertileWindowTimingCardProps {
  userId: string;
  cycleLength: number;
  periodLength: number;
}

interface PeriodRow {
  period_start_date: string;
  period_end_date: string | null;
  cycle_length: number | null;
}

interface SignalRow {
  signal_date: string;
  intercourse: unknown;
}

interface CycleSummary {
  cycleStart: Date;
  cycleEnd: Date; // next period start - 1, or today if active
  cycleLength: number;
  periodLen: number;
  ovulationDay: number; // 0-indexed day from cycleStart
  fertileStartDay: number;
  fertileEndDay: number;
  isActive: boolean;
  intercourseDays: { day: number; isProtected: boolean }[];
}

const FertileWindowTimingCard = ({ userId, cycleLength, periodLength }: FertileWindowTimingCardProps) => {
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
          .select('signal_date, intercourse')
          .eq('user_id', userId)
          .gte('signal_date', format(subDays(new Date(), 180), 'yyyy-MM-dd')),
      ]);
      setPeriods(((pData as PeriodRow[]) || []));
      setSignals(((sData as SignalRow[]) || []));
    } catch (e) {
      console.error('FertileWindowTimingCard load error', e);
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

  const cycles = useMemo<CycleSummary[]>(() => {
    if (periods.length === 0) return [];

    const periodsAsc = [...periods].sort(
      (a, b) => parseISO(a.period_start_date).getTime() - parseISO(b.period_start_date).getTime()
    );

    const today = new Date();
    const intercourseByDate: Record<string, { isProtected: boolean }[]> = {};
    signals.forEach((s) => {
      const intercourse = Array.isArray(s.intercourse) ? s.intercourse : [];
      if (intercourse.length === 0) return;
      intercourseByDate[s.signal_date] = intercourse.map((entry) => ({
        isProtected: typeof entry === 'object' && entry !== null && 'protected' in entry
          ? Boolean((entry as { protected: boolean }).protected)
          : true,
      }));
    });

    const result: CycleSummary[] = [];
    for (let i = 0; i < periodsAsc.length; i++) {
      const cycleStart = parseISO(periodsAsc[i].period_start_date);
      const nextStart = i + 1 < periodsAsc.length ? parseISO(periodsAsc[i + 1].period_start_date) : null;
      const cycleEnd = nextStart ? subDays(nextStart, 1) : today;
      const isActive = nextStart === null;
      const cycleLen = nextStart
        ? differenceInDays(nextStart, cycleStart)
        : (periodsAsc[i].cycle_length ?? cycleLength);
      const periodLen = periodsAsc[i].period_end_date
        ? Math.max(1, differenceInDays(parseISO(periodsAsc[i].period_end_date), cycleStart) + 1)
        : periodLength;

      // Skip cycles too short to be meaningful (< 10 days = probably not a real cycle).
      if (cycleLen < 10) continue;

      const ovulationDay = cycleLen - 14;
      const fertileStartDay = Math.max(0, ovulationDay - 5);
      const fertileEndDay = ovulationDay;

      const intercourseDays: { day: number; isProtected: boolean }[] = [];
      const totalDays = differenceInDays(cycleEnd, cycleStart) + 1;
      for (let d = 0; d < totalDays; d++) {
        const dateKey = format(addDays(cycleStart, d), 'yyyy-MM-dd');
        const entries = intercourseByDate[dateKey];
        if (entries) {
          // If any unprotected logged that day, day counts as unprotected.
          const isProtected = entries.every((e) => e.isProtected);
          intercourseDays.push({ day: d, isProtected });
        }
      }

      result.push({
        cycleStart,
        cycleEnd,
        cycleLength: cycleLen,
        periodLen,
        ovulationDay,
        fertileStartDay,
        fertileEndDay,
        isActive,
        intercourseDays,
      });
    }

    // Most-recent first, take top 3.
    return result.reverse().slice(0, 3);
  }, [periods, signals, cycleLength, periodLength]);

  const stats = useMemo(() => {
    let fertileDaysSeen = 0;
    let fertileDaysWithIntercourse = 0;
    let cyclesAnalyzed = 0;
    cycles.forEach((c) => {
      // Only count cycles where the fertile window has fully passed (don't penalize active cycles).
      if (c.isActive && differenceInDays(new Date(), c.cycleStart) <= c.fertileEndDay + 1) return;
      cyclesAnalyzed++;
      const fertileDayCount = c.fertileEndDay - c.fertileStartDay + 1;
      fertileDaysSeen += fertileDayCount;
      const fertileIntercourseDays = c.intercourseDays.filter(
        (i) => i.day >= c.fertileStartDay && i.day <= c.fertileEndDay && !i.isProtected
      ).length;
      fertileDaysWithIntercourse += fertileIntercourseDays;
    });
    return { fertileDaysSeen, fertileDaysWithIntercourse, cyclesAnalyzed };
  }, [cycles]);

  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-5 w-48 mb-3" />
        <Skeleton className="h-32 w-full" />
      </Card>
    );
  }

  if (periods.length === 0 || cycles.length === 0) return null;

  // No intercourse logged in any of the analyzed cycles? Show a gentle nudge instead of an empty chart.
  const hasAnyIntercourseLogged = cycles.some((c) => c.intercourseDays.length > 0);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-lg bg-secondary/15 flex items-center justify-center">
          <Target className="h-4 w-4 text-secondary-foreground" />
        </div>
        <h3 className="text-sm font-bold">Fertile-window timing</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Last {cycles.length} {cycles.length === 1 ? 'cycle' : 'cycles'} — fertile window vs intercourse logs
      </p>

      {!hasAnyIntercourseLogged && (
        <div className="bg-muted/40 rounded-lg p-3 mb-3 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Log intercourse on the calendar (tap a day → Intimacy) to see how your timing lines up with your fertile window.
          </p>
        </div>
      )}

      {hasAnyIntercourseLogged && stats.cyclesAnalyzed > 0 && (
        <div className="bg-secondary/5 border border-secondary/20 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-secondary-foreground shrink-0" />
            <p className="text-sm">
              <span className="font-semibold">
                {stats.fertileDaysWithIntercourse} of {stats.fertileDaysSeen}
              </span>{' '}
              <span className="text-muted-foreground">
                fertile days had unprotected intercourse logged
                {stats.cyclesAnalyzed < cycles.length ? ' (current cycle still in progress)' : ''}.
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Per-cycle timelines */}
      <div className="space-y-3">
        {cycles.map((cycle, idx) => {
          const totalDays = differenceInDays(cycle.cycleEnd, cycle.cycleStart) + 1;
          const renderDays = Math.min(totalDays, cycle.cycleLength);

          return (
            <div key={idx}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted-foreground">
                  {format(cycle.cycleStart, 'MMM d')}
                  {' → '}
                  {cycle.isActive ? 'today' : format(cycle.cycleEnd, 'MMM d')}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {cycle.cycleLength} day{cycle.isActive ? ' (so far)' : ''}
                </span>
              </div>
              <div className="relative h-7 rounded bg-muted/40 overflow-hidden">
                {/* Period band */}
                <div
                  className="absolute top-0 bottom-0 bg-primary/30"
                  style={{
                    left: '0%',
                    width: `${(cycle.periodLen / renderDays) * 100}%`,
                  }}
                  title={`Period: days 1-${cycle.periodLen}`}
                />
                {/* Fertile window band */}
                <div
                  className="absolute top-0 bottom-0 bg-secondary/40 border-l border-r border-secondary"
                  style={{
                    left: `${(cycle.fertileStartDay / renderDays) * 100}%`,
                    width: `${((cycle.fertileEndDay - cycle.fertileStartDay + 1) / renderDays) * 100}%`,
                  }}
                  title={`Fertile window: days ${cycle.fertileStartDay + 1}-${cycle.fertileEndDay + 1}`}
                />
                {/* Ovulation marker */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-secondary-foreground"
                  style={{ left: `calc(${((cycle.ovulationDay + 0.5) / renderDays) * 100}% - 1px)` }}
                  title={`Predicted ovulation: day ${cycle.ovulationDay + 1}`}
                />
                {/* Intercourse dots */}
                {cycle.intercourseDays.map((entry, i) => (
                  <div
                    key={i}
                    className={`absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border-2 border-white dark:border-card ${
                      entry.isProtected ? 'bg-muted-foreground' : 'bg-pink-500'
                    }`}
                    style={{ left: `calc(${((entry.day + 0.5) / renderDays) * 100}% - 4px)` }}
                    title={`${format(addDays(cycle.cycleStart, entry.day), 'MMM d')} — ${
                      entry.isProtected ? 'protected' : 'unprotected'
                    } intercourse`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-3 border-t text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-primary/30" />
          Period
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-secondary/40 border border-secondary" />
          Fertile window
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-[2px] h-3 bg-secondary-foreground" />
          Ovulation
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-pink-500" />
          Unprotected
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground" />
          Protected
        </div>
      </div>
    </Card>
  );
};

export default FertileWindowTimingCard;
