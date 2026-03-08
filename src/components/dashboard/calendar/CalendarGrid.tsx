import { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, addDays, parseISO } from 'date-fns';
import { Droplet, Sparkles, Heart, CloudRain } from 'lucide-react';
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
  prediction: CyclePrediction;
  periodRecords?: PeriodRecord[];
}

const CalendarGrid = ({
  currentMonth,
  selectedDate,
  onSelectDate,
  selectedMode,
  daySignals,
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

  // Build prediction sets for multi-cycle display (past & future)
  const { predictedPeriodSet, predictedOvulationSet, fertileSet, pmsSet } = useMemo(() => {
    const pPeriod = new Set<string>();
    const pOvulation = new Set<string>();
    const pFertile = new Set<string>();
    const pPms = new Set<string>();

    const avgCycle = prediction.averageCycleLength;
    const avgPeriod = prediction.averagePeriodLength;
    const lutealPhase = 14;

    // Sort records oldest first
    const sorted = [...periodRecords].sort(
      (a, b) => new Date(a.period_start_date).getTime() - new Date(b.period_start_date).getTime()
    );

    // For each logged period, calculate ovulation & fertile window for THAT cycle
    for (let i = 0; i < sorted.length; i++) {
      const currentStart = parseISO(sorted[i].period_start_date);
      const nextStart = i < sorted.length - 1
        ? parseISO(sorted[i + 1].period_start_date)
        : addDays(currentStart, avgCycle);

      const ovulationDate = addDays(nextStart, -lutealPhase);
      const fertileStart = addDays(ovulationDate, -5);
      const fertileEnd = addDays(ovulationDate, 1);
      const pmsStart = addDays(nextStart, -5);

      pOvulation.add(format(ovulationDate, 'yyyy-MM-dd'));
      let d = fertileStart;
      while (d <= fertileEnd) {
        pFertile.add(format(d, 'yyyy-MM-dd'));
        d = addDays(d, 1);
      }
      d = pmsStart;
      while (d < nextStart) {
        pPms.add(format(d, 'yyyy-MM-dd'));
        d = addDays(d, 1);
      }
    }

    // Future predictions: generate up to 3 future cycles
    const lastStart = sorted.length > 0
      ? parseISO(sorted[sorted.length - 1].period_start_date)
      : addDays(new Date(), -14); // fallback for tier 1/2

    for (let cycle = 1; cycle <= 3; cycle++) {
      const futureStart = addDays(lastStart, avgCycle * cycle);
      const futureEnd = addDays(futureStart, avgPeriod - 1);

      let d = futureStart;
      while (d <= futureEnd) {
        pPeriod.add(format(d, 'yyyy-MM-dd'));
        d = addDays(d, 1);
      }

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

      // PMS for future cycle
      const pmsStart = addDays(nextCycleStart, -5);
      d = pmsStart;
      while (d < nextCycleStart) {
        pPms.add(format(d, 'yyyy-MM-dd'));
        d = addDays(d, 1);
      }
    }

    return { predictedPeriodSet: pPeriod, predictedOvulationSet: pOvulation, fertileSet: pFertile, pmsSet: pPms };
  }, [prediction, periodRecords]);

  const getDayType = (date: Date) => {
    if (['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode)) {
      return { type: 'regular' as const, bgClass: 'bg-muted/30', textClass: 'text-foreground', border: false };
    }

    const dateKey = format(date, 'yyyy-MM-dd');
    const signal = daySignals[dateKey];

    // 1) User-confirmed ovulation
    if (markedOvulationDays.has(dateKey)) {
      return { type: 'ovulation' as const, bgClass: 'bg-secondary', textClass: 'text-secondary-foreground', border: false };
    }

    // 2) EWCM discharge
    if (signal?.discharge === 'ewcm') {
      return { type: 'ovulation' as const, bgClass: 'bg-secondary', textClass: 'text-secondary-foreground', border: false };
    }

    // 3) Logged period days (solid)
    if (periodDays.has(dateKey)) {
      return { type: 'period' as const, bgClass: 'bg-primary', textClass: 'text-primary-foreground', border: false };
    }

    // 4) Predicted ovulation
    if (predictedOvulationSet.has(dateKey) && !periodDays.has(dateKey)) {
      return { type: 'predicted-ovulation' as const, bgClass: 'bg-secondary/50', textClass: 'text-secondary-foreground', border: true };
    }

    // 5) Predicted period (dashed border)
    if (predictedPeriodSet.has(dateKey)) {
      return { type: 'predicted-period' as const, bgClass: 'bg-primary/15', textClass: 'text-foreground', border: true };
    }

    // 6) Fertile window
    if (fertileSet.has(dateKey) && !periodDays.has(dateKey)) {
      return { type: 'fertile' as const, bgClass: 'bg-accent/50', textClass: 'text-foreground', border: false };
    }

    // 7) PMS window
    if (pmsSet.has(dateKey) && !periodDays.has(dateKey)) {
      return { type: 'pms' as const, bgClass: 'bg-amber-100 dark:bg-amber-900/30', textClass: 'text-foreground', border: false };
    }

    return { type: 'regular' as const, bgClass: 'bg-transparent', textClass: 'text-foreground', border: false };
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
                dayInfo.border && 'border-2 border-dashed border-primary/40',
                dayInfo.type === 'predicted-ovulation' && 'border-2 border-dashed border-secondary/60',
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
              {dayInfo.type === 'pms' && (
                <CloudRain className="absolute -top-0.5 -right-0.5 h-3 w-3 text-amber-600 dark:text-amber-400" />
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
