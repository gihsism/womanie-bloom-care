import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Droplet, Heart, Sparkles, Circle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';

interface CycleCalendarProps {
  lastPeriodStart?: Date;
  cycleLength?: number;
  periodLength?: number;
}

const CycleCalendar = ({ 
  lastPeriodStart = new Date(2025, 9, 1), // Oct 1, 2025 as default
  cycleLength = 28,
  periodLength = 5 
}: CycleCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Calculate cycle information
  const getDaysSinceLastPeriod = (date: Date) => {
    const diffTime = date.getTime() - lastPeriodStart.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getCycleDay = (date: Date) => {
    const daysSince = getDaysSinceLastPeriod(date);
    return ((daysSince % cycleLength) + cycleLength) % cycleLength;
  };

  const getDayType = (date: Date) => {
    const cycleDay = getCycleDay(date);
    
    // Period days (days 0-4 for 5-day period)
    if (cycleDay < periodLength) {
      return { type: 'period', color: 'bg-primary', label: 'Period' };
    }
    
    // Ovulation day (typically day 14 for 28-day cycle)
    const ovulationDay = Math.floor(cycleLength / 2);
    if (cycleDay === ovulationDay) {
      return { type: 'ovulation', color: 'bg-secondary', label: 'Ovulation' };
    }
    
    // Fertile window (5 days before ovulation + ovulation day)
    if (cycleDay >= ovulationDay - 4 && cycleDay <= ovulationDay) {
      return { type: 'fertile', color: 'bg-accent', label: 'Fertile' };
    }
    
    return { type: 'regular', color: 'bg-muted/30', label: 'Regular' };
  };

  const isToday = (date: Date) => isSameDay(date, new Date());
  
  const currentCycleDay = getCycleDay(new Date());
  const ovulationDay = Math.floor(cycleLength / 2);
  const daysToOvulation = ovulationDay - currentCycleDay;
  const daysToNextPeriod = cycleLength - currentCycleDay;

  return (
    <Card className="p-3">
      <div className="space-y-3">
      {/* Cycle Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Circle className="h-3 w-3 text-primary" />
            <span className="text-xs text-muted-foreground">Cycle Day</span>
          </div>
          <div className="text-xl font-bold">{currentCycleDay + 1}</div>
          <div className="text-xs text-muted-foreground">of {cycleLength}</div>
        </Card>
        
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-3 w-3 text-secondary" />
            <span className="text-xs text-muted-foreground">Ovulation</span>
          </div>
          <div className="text-xl font-bold">
            {daysToOvulation > 0 ? daysToOvulation : daysToOvulation + cycleLength}
          </div>
          <div className="text-xs text-muted-foreground">days away</div>
        </Card>
        
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Droplet className="h-3 w-3 text-primary" />
            <span className="text-xs text-muted-foreground">Next Period</span>
          </div>
          <div className="text-xl font-bold">{daysToNextPeriod}</div>
          <div className="text-xs text-muted-foreground">days away</div>
        </Card>
      </div>
      
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">
          {format(currentMonth, 'MMM yyyy')}
        </h4>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="h-6 w-6 p-0"
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentMonth(new Date())}
            className="h-6 px-2 text-xs"
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="h-6 w-6 p-0"
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
            <div key={i} className="text-center text-xs font-medium text-muted-foreground py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((date) => {
            const dayInfo = getDayType(date);
            const today = isToday(date);
            const inCurrentMonth = isSameMonth(date, currentMonth);
            const isSelected = selectedDate && isSameDay(date, selectedDate);

            return (
              <button
                key={date.toISOString()}
                onClick={() => setSelectedDate(date)}
                className={`
                  relative aspect-square p-1 rounded text-xs transition-all
                  ${inCurrentMonth ? 'opacity-100' : 'opacity-30'}
                  ${dayInfo.color}
                  ${today ? 'ring-1 ring-foreground' : ''}
                  ${isSelected ? 'ring-1 ring-primary scale-105' : ''}
                  hover:scale-105
                `}
              >
                <div className={`text-xs font-medium ${
                  dayInfo.type === 'period' || dayInfo.type === 'ovulation' || dayInfo.type === 'fertile'
                    ? 'text-white'
                    : 'text-foreground'
                }`}>
                  {format(date, 'd')}
                </div>
                
                {/* Ovulation marker */}
                {dayInfo.type === 'ovulation' && (
                  <Sparkles className="absolute top-0.5 right-0.5 h-2 w-2 text-white" />
                )}
                
                {/* Period marker */}
                {dayInfo.type === 'period' && (
                  <Droplet className="absolute top-0.5 right-0.5 h-2 w-2 text-white fill-white" />
                )}
                
                {/* Fertile marker */}
                {dayInfo.type === 'fertile' && (
                  <Heart className="absolute top-0.5 right-0.5 h-2 w-2 text-white" />
                )}
              </button>
            );
          })}
        </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded bg-primary"></div>
          <span className="text-muted-foreground">Period</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded bg-accent"></div>
          <span className="text-muted-foreground">Fertile</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded bg-secondary"></div>
          <span className="text-muted-foreground">Ovulation</span>
        </div>
      </div>
      </div>
    </Card>
  );
};

export default CycleCalendar;
