import { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, addDays, parseISO } from 'date-fns';
import { Droplet, Sparkles, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CyclePrediction, PeriodRecord } from '@/hooks/useCyclePrediction';

interface DaySignal {
  symptoms: string[];
  intercourse: { protected: boolean }[];
  mood: string[];
  discharge: string;
}

interface CalendarGridProps {
  currentMonth: Date;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  lastPeriodStart: Date;
  cycleLength: number;
  periodLength: number;
  selectedMode: string;
  daySignals: Record<string, DaySignal>;
  ovulationPrediction?: {
    predictedOvulationDate?: string;
    fertileWindowStart?: string;
    fertileWindowEnd?: string;
  } | null;
  periodDays?: Set<string>;
  markedOvulationDays?: Set<string>;
  prediction?: CyclePrediction | null;
  periodRecords?: PeriodRecord[];
}

const CalendarGrid = ({
  currentMonth,
  selectedDate,
  onSelectDate,
  selectedMode,
  daySignals,
  ovulationPrediction,
  periodDays = new Set(),
  markedOvulationDays = new Set(),
  prediction,
  periodRecords = []
}: CalendarGridProps) => {
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  // Build sets for multi-cycle predictions (past & future)
  const { predictedPeriodSet, predictedOvulationSet, fertileSet } = useMemo(() => {
    const pPeriod = new Set<string>();
    const pOvulation = new Set<string>();
    const pFertile = new Set<string>();

    if (!prediction || periodRecords.length === 0) return { predictedPeriodSet: pPeriod, predictedOvulationSet: pOvulation, fertileSet: pFertile };

    const avgCycle = prediction.averageCycleLength;
    const avgPeriod = prediction.averagePeriodLength;
    const lutealPhase = 14;

    // Sort records oldest first to find cycles
    const sorted = [...periodRecords].sort(
      (a, b) => new Date(a.period_start_date).getTime() - new Date(b.period_start_date).getTime()
    );

    // For each logged period, calculate ovulation & fertile window for THAT cycle
    // Ovulation = next period start - 14 days
    // If we know the next period start (from the next record), use that; otherwise use avgCycle
    for (let i = 0; i < sorted.length; i++) {
      const currentStart = parseISO(sorted[i].period_start_date);
      const nextStart = i < sorted.length - 1
        ? parseISO(sorted[i + 1].period_start_date)
        : addDays(currentStart, avgCycle);

      const ovulationDate = addDays(nextStart, -lutealPhase);
      const fertileStart = addDays(ovulationDate, -5);
      const fertileEnd = addDays(ovulationDate, 1);

      pOvulation.add(format(ovulationDate, 'yyyy-MM-dd'));
      let d = fertileStart;
      while (d <= fertileEnd) {
        pFertile.add(format(d, 'yyyy-MM-dd'));
        d = addDays(d, 1);
      }
    }

    // Future predictions: generate up to 3 future cycles from last period
    const lastStart = parseISO(sorted[sorted.length - 1].period_start_date);
    for (let cycle = 1; cycle <= 3; cycle++) {
      const futureStart = addDays(lastStart, avgCycle * cycle);
      const futureEnd = addDays(futureStart, avgPeriod - 1);

      // Predicted period days
      let d = futureStart;
      while (d <= futureEnd) {
        pPeriod.add(format(d, 'yyyy-MM-dd'));
        d = addDays(d, 1);
      }

      // Ovulation for this future cycle
      const nextCycleStart = addDays(lastStart, avgCycle * (cycle + 1));
      const ovDate = addDays(nextCycleStart, -lutealPhase);
      pOvulation.add(format(ovDate, 'yyyy-MM-dd'));

      const fStart = addDays(ovDate, -5);
      const fEnd = addDays(ovDate, 1);
      d = fStart;
      while (d <= fEnd) {
        pFertile.add(format(d, 'yyyy-MM-dd'));
        d = addDays(d, 1);
      }
    }

    return { predictedPeriodSet: pPeriod, predictedOvulationSet: pOvulation, fertileSet: pFertile };
  }, [prediction, periodRecords]);

  const getDayType = (date: Date) => {
    if (['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode)) {
      return { type: 'regular', bgClass: 'bg-muted/30', textClass: 'text-foreground' };
    }

    const dateKey = format(date, 'yyyy-MM-dd');
    const signal = daySignals[dateKey];

    // 1) User-confirmed ovulation
    if (markedOvulationDays.has(dateKey)) {
      return { type: 'ovulation', bgClass: 'bg-secondary', textClass: 'text-secondary-foreground' };
    }

    // 2) EWCM discharge
    if (signal?.discharge === 'ewcm') {
      return { type: 'ovulation', bgClass: 'bg-secondary', textClass: 'text-secondary-foreground' };
    }

    // 3) Logged period days (solid)
    if (periodDays.has(dateKey)) {
      return { type: 'period', bgClass: 'bg-primary', textClass: 'text-primary-foreground' };
    }

    // 4) Predicted ovulation (from calculated sets)
    if (predictedOvulationSet.has(dateKey) && !periodDays.has(dateKey)) {
      return { type: 'predicted-ovulation', bgClass: 'bg-secondary/60', textClass: 'text-secondary-foreground' };
    }

    // 5) Predicted period (outline, not filled)
    if (predictedPeriodSet.has(dateKey)) {
      return {
        type: 'predicted-period',
        bgClass: 'bg-primary/15 border border-primary/40',
        textClass: 'text-foreground'
      };
    }

    // 6) Fertile window (from calculated sets)
    if (fertileSet.has(dateKey) && !periodDays.has(dateKey)) {
      return { type: 'fertile', bgClass: 'bg-accent/50', textClass: 'text-foreground' };
    }

    // 7) Fallback to external ovulation prediction
    if (ovulationPrediction?.predictedOvulationDate) {
      const predictedOvDate = new Date(ovulationPrediction.predictedOvulationDate);
      const fertileStart = ovulationPrediction.fertileWindowStart ? new Date(ovulationPrediction.fertileWindowStart) : null;
      const fertileEnd = ovulationPrediction.fertileWindowEnd ? new Date(ovulationPrediction.fertileWindowEnd) : null;

      if (isSameDay(date, predictedOvDate)) {
        return { type: 'predicted-ovulation', bgClass: 'bg-secondary/50', textClass: 'text-foreground' };
      }
      if (fertileStart && fertileEnd && date >= fertileStart && date <= fertileEnd) {
        return { type: 'fertile', bgClass: 'bg-accent/50', textClass: 'text-foreground' };
      }
    }

    return { type: 'regular', bgClass: 'bg-transparent', textClass: 'text-foreground' };
  };

  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const today = new Date();

  return (
    <div className="space-y-2">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day, i) => (
          <div key={i} className="text-center text-xs font-medium text-muted-foreground py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar days */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((date) => {
          const dayInfo = getDayType(date);
          const isToday = isSameDay(date, today);
          const inCurrentMonth = isSameMonth(date, currentMonth);
          const isSelected = selectedDate && isSameDay(date, selectedDate);
          const dateKey = format(date, 'yyyy-MM-dd');
          const hasSignals = daySignals[dateKey];
          const hasAnyData = hasSignals && (
            hasSignals.symptoms.length > 0 ||
            hasSignals.intercourse.length > 0 ||
            hasSignals.mood.length > 0
          );

          return (
            <button
              key={date.toISOString()}
              onClick={() => onSelectDate(date)}
              className={cn(
                "relative aspect-square flex flex-col items-center justify-center rounded-full transition-all duration-200",
                "hover:scale-105 active:scale-95",
                inCurrentMonth ? 'opacity-100' : 'opacity-30',
                dayInfo.bgClass,
                isToday && dayInfo.type === 'regular' && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                isSelected && 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
              )}
            >
              <span className={cn("text-sm font-semibold", dayInfo.textClass)}>
                {format(date, 'd')}
              </span>

              {/* Phase icons */}
              {(dayInfo.type === 'ovulation' || dayInfo.type === 'predicted-ovulation') && (
                <Sparkles className="absolute -top-0.5 -right-0.5 h-3 w-3 text-secondary-foreground" />
              )}
              {dayInfo.type === 'period' && (
                <Droplet className="absolute -top-0.5 -right-0.5 h-3 w-3 text-primary-foreground fill-current" />
              )}
              {dayInfo.type === 'fertile' && (
                <Heart className="absolute -top-0.5 -right-0.5 h-3 w-3 text-accent-foreground" />
              )}

              {/* Data indicator dots */}
              {hasAnyData && (
                <div className="absolute -bottom-1 flex gap-0.5">
                  {hasSignals.symptoms.length > 0 && (
                    <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                  )}
                  {hasSignals.intercourse.length > 0 && (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/70" />
                  )}
                  {hasSignals.mood.length > 0 && (
                    <div className="w-1.5 h-1.5 rounded-full bg-secondary/70" />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarGrid;
