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
    <div className="flex gap-4">
      <Card className="p-1 w-[260px]">
        <div className="space-y-1">
      {/* Cycle Stats */}
      <div className="grid grid-cols-3 gap-1">
        <div className="p-1 bg-muted/30 rounded">
          <div className="flex items-center gap-1 mb-1">
            <Circle className="h-2 w-2 text-primary" />
            <span className="text-[10px] text-muted-foreground">Day</span>
          </div>
          <div className="text-sm font-bold">{currentCycleDay + 1}</div>
        </div>
        
        <div className="p-1 bg-muted/30 rounded">
          <div className="flex items-center gap-1 mb-1">
            <Sparkles className="h-2 w-2 text-secondary" />
            <span className="text-[10px] text-muted-foreground">Ovulation</span>
          </div>
          <div className="text-sm font-bold">
            {daysToOvulation > 0 ? daysToOvulation : daysToOvulation + cycleLength}d
          </div>
        </div>
        
        <div className="p-1 bg-muted/30 rounded">
          <div className="flex items-center gap-1 mb-1">
            <Droplet className="h-2 w-2 text-primary" />
            <span className="text-[10px] text-muted-foreground">Period</span>
          </div>
          <div className="text-sm font-bold">{daysToNextPeriod}d</div>
        </div>
      </div>
      
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">
          {format(currentMonth, 'MMM yy')}
        </h4>
        <div className="flex gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="h-4 w-4 p-0"
          >
            <ChevronLeft className="h-2 w-2" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentMonth(new Date())}
            className="h-4 px-1 text-[10px]"
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="h-4 w-4 p-0"
          >
            <ChevronRight className="h-2 w-2" />
          </Button>
        </div>
      </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-[1px]">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
            <div key={i} className="text-center text-[6px] font-medium text-muted-foreground w-4">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-[1px]">
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
                  relative aspect-square rounded text-[6px] transition-all w-4 h-4
                  ${inCurrentMonth ? 'opacity-100' : 'opacity-30'}
                  ${dayInfo.color}
                  ${today ? 'ring-[0.5px] ring-foreground' : ''}
                  ${isSelected ? 'ring-[0.5px] ring-primary' : ''}
                `}
              >
                <div className={`text-[6px] font-medium ${
                  dayInfo.type === 'period' || dayInfo.type === 'ovulation' || dayInfo.type === 'fertile'
                    ? 'text-white'
                    : 'text-foreground'
                }`}>
                  {format(date, 'd')}
                </div>
                
                {/* Ovulation marker */}
                {dayInfo.type === 'ovulation' && (
                  <Sparkles className="absolute top-0 right-0 h-1 w-1 text-white" />
                )}
                
                {/* Period marker */}
                {dayInfo.type === 'period' && (
                  <Droplet className="absolute top-0 right-0 h-1 w-1 text-white fill-white" />
                )}
                
                {/* Fertile marker */}
                {dayInfo.type === 'fertile' && (
                  <Heart className="absolute top-0 right-0 h-1 w-1 text-white" />
                )}
              </button>
            );
          })}
        </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-1 text-[8px]">
        <div className="flex items-center gap-0.5">
          <div className="w-1 h-1 rounded bg-primary"></div>
          <span className="text-muted-foreground">Period</span>
        </div>
        <div className="flex items-center gap-0.5">
          <div className="w-1 h-1 rounded bg-accent"></div>
          <span className="text-muted-foreground">Fertile</span>
        </div>
        <div className="flex items-center gap-0.5">
          <div className="w-1 h-1 rounded bg-secondary"></div>
          <span className="text-muted-foreground">Ovulation</span>
        </div>
      </div>
      </div>
      </Card>
      
      {/* Statistics Panel */}
      <Card className="p-3 flex-1">
        <h4 className="text-sm font-semibold mb-3">Cycle Statistics</h4>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Average Cycle Length</span>
            <span className="text-sm font-medium">{cycleLength} days</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Period Duration</span>
            <span className="text-sm font-medium">{periodLength} days</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Last Period Started</span>
            <span className="text-sm font-medium">{format(lastPeriodStart, 'MMM d, yyyy')}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Next Period Expected</span>
            <span className="text-sm font-medium">{format(new Date(lastPeriodStart.getTime() + (cycleLength - currentCycleDay) * 24 * 60 * 60 * 1000), 'MMM d, yyyy')}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Next Ovulation</span>
            <span className="text-sm font-medium">
              {format(new Date(lastPeriodStart.getTime() + ((ovulationDay - currentCycleDay + cycleLength) % cycleLength) * 24 * 60 * 60 * 1000), 'MMM d, yyyy')}
            </span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-xs text-muted-foreground">Cycle Regularity</span>
            <span className="text-sm font-medium text-green-600">Regular</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default CycleCalendar;
