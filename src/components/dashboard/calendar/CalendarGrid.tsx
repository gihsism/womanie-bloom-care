import { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek } from 'date-fns';
import { Droplet, Sparkles, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CyclePrediction } from '@/hooks/useCyclePrediction';

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
  prediction
}: CalendarGridProps) => {
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    // Explicit Sunday-first weeks to match the "S M T W T F S" header
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  const getDayType = (date: Date) => {
    if (['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode)) {
      return { type: 'regular', bgClass: 'bg-muted/30', textClass: 'text-foreground' };
    }

    const dateKey = format(date, 'yyyy-MM-dd');
    const signal = daySignals[dateKey];

    // 1) User-confirmed ovulation (strongest signal)
    if (markedOvulationDays.has(dateKey)) {
      return { type: 'ovulation', bgClass: 'bg-secondary', textClass: 'text-secondary-foreground' };
    }

    // 2) EWCM (strong ovulation indicator)
    if (signal?.discharge === 'ewcm') {
      return { type: 'ovulation', bgClass: 'bg-secondary', textClass: 'text-secondary-foreground' };
    }

    // 3) Logged period days ONLY (never infer)
    if (periodDays.has(dateKey)) {
      return { type: 'period', bgClass: 'bg-primary', textClass: 'text-primary-foreground' };
    }

    // 4) Predictions (derived from predicted next period)
    if (prediction) {
      // Predicted next period (outline, not filled)
      if (date >= prediction.predictedPeriodStart && date <= prediction.predictedPeriodEnd) {
        return {
          type: 'predicted-period',
          bgClass: 'bg-transparent border border-primary/50',
          textClass: 'text-foreground'
        };
      }

      // Ovulation = predicted next period start - 14 days
      if (isSameDay(date, prediction.predictedOvulationDate)) {
        return { type: 'predicted-ovulation', bgClass: 'bg-secondary/50', textClass: 'text-foreground' };
      }

      // Fertile window = ovulation - 5 to ovulation + 1
      if (date >= prediction.fertileWindowStart && date <= prediction.fertileWindowEnd) {
        return { type: 'fertile', bgClass: 'bg-accent/50', textClass: 'text-foreground' };
      }
    }

    // 5) Secondary source (external prediction), if present
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
              <span className={cn(
                "text-sm font-semibold",
                dayInfo.textClass
              )}>
                {format(date, 'd')}
              </span>
              
              {/* Phase icons */}
              {dayInfo.type === 'ovulation' && (
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
