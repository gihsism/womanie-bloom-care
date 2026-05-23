import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/integrations/db/client';
import { onHealthDataChange } from '@/lib/data-events';
import { CalendarRange, Sparkles } from 'lucide-react';
import { addDays, differenceInDays, format, parseISO, subMonths } from 'date-fns';

// Three-month fertility forecast for conception + menstrual-cycle
// modes. The dashboard has cards for the *current* cycle's status
// and a history view (FertileWindowTimingCard / CycleHistoryCard);
// what was missing was a forward-looking surface — "when should I
// plan to be free of work travel?" / "when's my next period likely
// to land?".
//
// Method:
// - Take the user's recent cycle history.
// - Use the median cycle length from the last 6 cycles as the
//   predicted length (more robust than the mean against the
//   occasional anovulatory outlier).
// - Project the next 3 cycle starts forward from the most recent
//   period start.
// - For each, mark days 1-5 as the period, ovulation as cycleLen - 14,
//   and the fertile window as ovulation - 5 through ovulation + 1.

interface FertilityForecastProps {
  // Pulled from PatientDashboard's already-loaded periodData; we
  // only render when there's at least one logged period.
  lastPeriodStart: Date | null;
  // Lets the parent override the predicted cycle length. We still
  // recompute from history when available; this is a fallback.
  cycleLengthFallback?: number;
}

interface PeriodRow {
  period_start_date: string;
  period_end_date: string | null;
}

interface ForecastCycle {
  index: number;
  startDate: Date;
  endDate: Date;
  fertileStart: Date;
  fertileEnd: Date;
  ovulation: Date;
  cycleLength: number;
}

const FertilityForecast = ({ lastPeriodStart, cycleLengthFallback = 28 }: FertilityForecastProps) => {
  const { user } = useAuth();
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoaded(false);
    try {
      const cutoff = format(subMonths(new Date(), 12), 'yyyy-MM-dd');
      const { data } = await db
        .from('period_tracking')
        .select('period_start_date, period_end_date')
        .eq('user_id', user.id)
        .gte('period_start_date', cutoff)
        .order('period_start_date', { ascending: true });
      setRows(((data as PeriodRow[]) || []));
    } catch (e) {
      console.error('FertilityForecast load error', e);
      setRows([]);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    return onHealthDataChange(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Derive each historical cycle length from consecutive starts —
  // same approach as CycleHistoryCard. Median is the predictor.
  const medianCycleLength = useMemo(() => {
    if (rows.length < 2) return cycleLengthFallback;
    const lens: number[] = [];
    for (let i = 1; i < rows.length; i++) {
      const len = differenceInDays(parseISO(rows[i].period_start_date), parseISO(rows[i - 1].period_start_date));
      if (len >= 14 && len <= 90) lens.push(len);
    }
    if (lens.length === 0) return cycleLengthFallback;
    // Use the last 6 cycles to weight recent regularity.
    const recent = lens.slice(-6).sort((a, b) => a - b);
    const mid = Math.floor(recent.length / 2);
    return recent.length % 2 === 0
      ? Math.round((recent[mid - 1] + recent[mid]) / 2)
      : recent[mid];
  }, [rows, cycleLengthFallback]);

  // Period length: derive from the last cycle's end-minus-start when
  // available; fall back to 5 days.
  const medianPeriodLength = useMemo(() => {
    const lens: number[] = [];
    for (const r of rows) {
      if (r.period_end_date) {
        const len = differenceInDays(parseISO(r.period_end_date), parseISO(r.period_start_date)) + 1;
        if (len >= 2 && len <= 10) lens.push(len);
      }
    }
    if (lens.length === 0) return 5;
    const recent = lens.slice(-6).sort((a, b) => a - b);
    const mid = Math.floor(recent.length / 2);
    return recent.length % 2 === 0
      ? Math.round((recent[mid - 1] + recent[mid]) / 2)
      : recent[mid];
  }, [rows]);

  const cycles = useMemo<ForecastCycle[]>(() => {
    if (!lastPeriodStart) return [];
    const today = new Date();
    // Move forward to the *next* cycle (the current one's already
    // running). If the most recent period is far in the past, skip
    // forward until we land in the future.
    let cursor = new Date(lastPeriodStart);
    while (differenceInDays(today, cursor) >= medianCycleLength) {
      cursor = addDays(cursor, medianCycleLength);
    }
    cursor = addDays(cursor, medianCycleLength);

    const out: ForecastCycle[] = [];
    for (let i = 0; i < 3; i++) {
      const startDate = new Date(cursor);
      const endDate = addDays(startDate, medianPeriodLength - 1);
      const ovulation = addDays(startDate, medianCycleLength - 14);
      const fertileStart = addDays(ovulation, -5);
      const fertileEnd = addDays(ovulation, 1);
      out.push({
        index: i + 1,
        startDate,
        endDate,
        fertileStart,
        fertileEnd,
        ovulation,
        cycleLength: medianCycleLength,
      });
      cursor = addDays(cursor, medianCycleLength);
    }
    return out;
  }, [lastPeriodStart, medianCycleLength, medianPeriodLength]);

  if (!loaded || !lastPeriodStart) return null;

  const today = new Date();

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" />
          Next 3 cycles
        </h4>
        <Badge variant="outline" className="text-[10px]">
          Based on {rows.length >= 2 ? 'your last cycles' : 'a 28-day default'}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Forecast using a {medianCycleLength}-day median cycle. Real cycles vary; treat these
        as planning estimates, not guarantees.
      </p>

      <ul className="space-y-2">
        {cycles.map((c) => {
          const daysAway = differenceInDays(c.startDate, today);
          return (
            <li key={c.index} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Cycle {c.index}
                  </span>
                  <span className="text-sm font-semibold">
                    Period {format(c.startDate, 'MMM d')} – {format(c.endDate, 'MMM d')}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  in {daysAway} days
                </span>
              </div>

              {/* Mini timeline: 0..cycleLength scaled to 100% */}
              <div className="relative h-6 rounded bg-muted/40 overflow-hidden">
                {/* Period band */}
                <div
                  className="absolute top-0 bottom-0 bg-primary/30"
                  style={{
                    left: '0%',
                    width: `${(medianPeriodLength / c.cycleLength) * 100}%`,
                  }}
                  title={`Period: days 1-${medianPeriodLength}`}
                />
                {/* Fertile band */}
                <div
                  className="absolute top-0 bottom-0 bg-secondary/40 border-l border-r border-secondary"
                  style={{
                    left: `${(differenceInDays(c.fertileStart, c.startDate) / c.cycleLength) * 100}%`,
                    width: `${
                      ((differenceInDays(c.fertileEnd, c.fertileStart) + 1) / c.cycleLength) * 100
                    }%`,
                  }}
                  title={`Fertile window`}
                />
                {/* Ovulation marker */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-secondary-foreground"
                  style={{
                    left: `calc(${
                      ((differenceInDays(c.ovulation, c.startDate) + 0.5) / c.cycleLength) * 100
                    }% - 1px)`,
                  }}
                  title={`Predicted ovulation`}
                />
              </div>

              <div className="grid grid-cols-3 text-[11px] text-muted-foreground">
                <div>
                  <div className="font-medium text-foreground">Fertile</div>
                  {format(c.fertileStart, 'MMM d')} – {format(c.fertileEnd, 'MMM d')}
                </div>
                <div className="text-center">
                  <div className="font-medium text-foreground inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-secondary" /> Ovulation
                  </div>
                  {format(c.ovulation, 'MMM d')}
                </div>
                <div className="text-right">
                  <div className="font-medium text-foreground">Cycle</div>
                  {c.cycleLength} days
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground pt-1 border-t">
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
      </div>
    </Card>
  );
};

export default FertilityForecast;
