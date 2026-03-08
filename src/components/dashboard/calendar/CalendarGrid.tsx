import { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, addDays, parseISO } from 'date-fns';
import { Droplet, Sparkles, Heart, CloudRain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CyclePrediction, PeriodRecord, isActivePeriod, getEffectiveEndDate } from '@/hooks/useCyclePrediction';

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
  periodDays?: Set<string>;
  predictedPeriodDays?: Set<string>;
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
  predictedPeriodDays = new Set(),
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

  // Build prediction sets for multi-cycle display
  const { futurePeriodSet, predictedOvulationSet, fertileSet, pmsSet } = useMemo(() => {
    const fPeriod = new Set<string>();
    const pOvulation = new Set<string>();
    const pFertile = new Set<string>();
    const pPms = new Set<string>();

    // Don't generate any predictions if there are no period records
    if (periodRecords.length === 0) {
      return { futurePeriodSet: fPeriod, predictedOvulationSet: pOvulation, fertileSet: pFertile, pmsSet: pPms };
    }

    const avgCycle = prediction.averageCycleLength;
    const avgPeriod = prediction.averagePeriodLength;
    const lutealPhase = 14;

    const sorted = [...periodRecords].sort(
      (a, b) => new Date(a.period_start_date).getTime() - new Date(b.period_start_date).getTime()
    );

    // Past cycles: calculate ovulation/fertile for each
    for (let i = 0; i < sorted.length; i++) {
      const currentStart = parseISO(sorted[i].period_start_date);
      const nextStart = i < sorted.length - 1
        ? parseISO(sorted[i + 1].period_start_date)
        : addDays(currentStart, avgCycle);

      const ovDate = addDays(nextStart, -lutealPhase);
      pOvulation.add(format(ovDate, 'yyyy-MM-dd'));

      let d = addDays(ovDate, -5);
      const fEnd = addDays(ovDate, 1);
      while (d <= fEnd) { pFertile.add(format(d, 'yyyy-MM-dd')); d = addDays(d, 1); }

      d = addDays(nextStart, -5);
      while (d < nextStart) { pPms.add(format(d, 'yyyy-MM-dd')); d = addDays(d, 1); }
    }

    // Future predictions: 3 cycles
    const lastStart = parseISO(sorted[sorted.length - 1].period_start_date);

    for (let cycle = 1; cycle <= 3; cycle++) {
      const futureStart = addDays(lastStart, avgCycle * cycle);
      const futureEnd = addDays(futureStart, avgPeriod - 1);
      let d = futureStart;
      while (d <= futureEnd) { fPeriod.add(format(d, 'yyyy-MM-dd')); d = addDays(d, 1); }

      const nextCycleStart = addDays(lastStart, avgCycle * (cycle + 1));
      const ovDate = addDays(nextCycleStart, -lutealPhase);
      pOvulation.add(format(ovDate, 'yyyy-MM-dd'));

      d = addDays(ovDate, -5);
      const fEnd = addDays(ovDate, 1);
      while (d <= fEnd) { pFertile.add(format(d, 'yyyy-MM-dd')); d = addDays(d, 1); }

      d = addDays(nextCycleStart, -5);
      while (d < nextCycleStart) { pPms.add(format(d, 'yyyy-MM-dd')); d = addDays(d, 1); }
    }

    return { futurePeriodSet: fPeriod, predictedOvulationSet: pOvulation, fertileSet: pFertile, pmsSet: pPms };
  }, [prediction, periodRecords]);

  const today = new Date();

  const getDayType = (date: Date) => {
    if (['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode)) {
      return { type: 'regular' as const, bgClass: 'bg-muted/30', textClass: 'text-foreground', dashed: false, active: false };
    }

    const dateKey = format(date, 'yyyy-MM-dd');
    const signal = daySignals[dateKey];
    const isConfirmedPeriod = periodDays.has(dateKey);
    const isPredictedActivePeriod = predictedPeriodDays.has(dateKey);
    const isToday = isSameDay(date, today);

    // 1) User-confirmed ovulation
    if (markedOvulationDays.has(dateKey)) {
      return { type: 'ovulation' as const, bgClass: 'bg-secondary', textClass: 'text-secondary-foreground', dashed: false, active: false };
    }

    // 2) EWCM discharge
    if (signal?.discharge === 'ewcm') {
      return { type: 'ovulation' as const, bgClass: 'bg-secondary', textClass: 'text-secondary-foreground', dashed: false, active: false };
    }

    // 3) Confirmed period days (solid)
    if (isConfirmedPeriod) {
      return { type: 'period' as const, bgClass: 'bg-primary', textClass: 'text-primary-foreground', dashed: false, active: isToday };
    }

    // 4) Predicted period for active (unconfirmed) period — dashed
    if (isPredictedActivePeriod) {
      return { type: 'predicted-active-period' as const, bgClass: 'bg-primary/20', textClass: 'text-foreground', dashed: true, active: isToday };
    }

    // 5) Predicted ovulation
    if (predictedOvulationSet.has(dateKey) && !isConfirmedPeriod) {
      return { type: 'predicted-ovulation' as const, bgClass: 'bg-secondary/50', textClass: 'text-secondary-foreground', dashed: true, active: false };
    }

    // 6) Future predicted period
    if (futurePeriodSet.has(dateKey)) {
      return { type: 'predicted-period' as const, bgClass: 'bg-primary/15', textClass: 'text-foreground', dashed: true, active: false };
    }

    // 7) Fertile window
    if (fertileSet.has(dateKey) && !isConfirmedPeriod) {
      return { type: 'fertile' as const, bgClass: 'bg-accent/50', textClass: 'text-foreground', dashed: false, active: false };
    }

    // 8) PMS window
    if (pmsSet.has(dateKey) && !isConfirmedPeriod) {
      return { type: 'pms' as const, bgClass: 'bg-amber-100 dark:bg-amber-900/30', textClass: 'text-foreground', dashed: false, active: false };
    }

    return { type: 'regular' as const, bgClass: 'bg-transparent', textClass: 'text-foreground', dashed: false, active: false };
  };

  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((day, i) => (
          <div key={i} className="text-center text-xs font-medium text-muted-foreground py-2">
            {day}
          </div>
        ))}
      </div>

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
                dayInfo.dashed && 'border-2 border-dashed border-primary/40',
                dayInfo.type === 'predicted-ovulation' && 'border-2 border-dashed border-secondary/60',
                isToday && dayInfo.type === 'regular' && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                isSelected && 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
              )}
            >
              <span className={cn("text-sm font-semibold", dayInfo.textClass)}>
                {format(date, 'd')}
              </span>

              {/* Active period pulsing dot */}
              {dayInfo.active && (
                <span className="absolute top-0 right-0 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                </span>
              )}

              {/* Phase icons */}
              {!dayInfo.active && (dayInfo.type === 'ovulation' || dayInfo.type === 'predicted-ovulation') && (
                <Sparkles className="absolute -top-0.5 -right-0.5 h-3 w-3 text-secondary-foreground" />
              )}
              {!dayInfo.active && dayInfo.type === 'period' && (
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
                  {hasSignals.symptoms.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-destructive" />}
                  {hasSignals.intercourse.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-primary/70" />}
                  {hasSignals.mood.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-secondary/70" />}
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
