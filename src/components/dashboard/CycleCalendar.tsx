import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Droplet, Heart, Sparkles, Circle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';

interface CycleCalendarProps {
  lastPeriodStart?: Date;
  cycleLength?: number;
  periodLength?: number;
  selectedMode?: string;
}

const CycleCalendar = ({ 
  lastPeriodStart = new Date(2025, 9, 1), // Oct 1, 2025 as default
  cycleLength = 28,
  periodLength = 5,
  selectedMode = 'menstrual-cycle'
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

  // Mode-specific statistics
  const getModeSpecificStats = () => {
    switch (selectedMode) {
      case 'contraception':
        return {
          title: 'Contraception Statistics',
          stats: [
            { label: 'Current Protection Status', value: 'Active' },
            { label: 'Fertile Window', value: daysToOvulation > 0 && daysToOvulation < 6 ? 'Active' : 'Not Active' },
            { label: 'Safe Days This Cycle', value: `${cycleLength - 6} days` },
            { label: 'Protection Method', value: 'Combined Pill' },
            { label: 'Consistency Score', value: '98%' },
            { label: 'Next Pill Pack', value: format(new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), 'MMM d') }
          ]
        };
      case 'conception':
        return {
          title: 'Conception Statistics',
          stats: [
            { label: 'Fertility Score Today', value: daysToOvulation <= 0 && daysToOvulation >= -5 ? 'High (85%)' : 'Low (15%)' },
            { label: 'Conception Probability', value: daysToOvulation === 0 ? '33%' : daysToOvulation >= -2 && daysToOvulation <= 2 ? '20%' : '5%' },
            { label: 'Best Days to Try', value: daysToOvulation > 0 ? `In ${daysToOvulation} days` : 'Today!' },
            { label: 'Trying Since', value: 'Mar 2025 (3 months)' },
            { label: 'BBT Pattern', value: 'Biphasic' },
            { label: 'Cervical Mucus', value: daysToOvulation <= 0 && daysToOvulation >= -3 ? 'Peak Fertile' : 'Normal' }
          ]
        };
      case 'ivf':
        return {
          title: 'IVF Protocol Statistics',
          stats: [
            { label: 'Protocol Day', value: 'Day 8 of 14' },
            { label: 'Stimulation Phase', value: 'Active' },
            { label: 'Next Medication', value: 'Tonight 8pm' },
            { label: 'Next Monitoring', value: format(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), 'MMM d') },
            { label: 'Follicle Count', value: '12 growing' },
            { label: 'Egg Retrieval Est.', value: format(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), 'MMM d') }
          ]
        };
      case 'pregnancy':
        return {
          title: 'Pregnancy Statistics',
          stats: [
            { label: 'Current Week', value: 'Week 24' },
            { label: 'Trimester', value: 'Second (6 months)' },
            { label: 'Due Date', value: format(new Date(2025, 6, 15), 'MMM d, yyyy') },
            { label: 'Days Until Due', value: '112 days' },
            { label: 'Next Appointment', value: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'MMM d') },
            { label: 'Baby Size', value: 'Papaya (~30cm)' }
          ]
        };
      case 'menopause':
        return {
          title: 'Menopause Statistics',
          stats: [
            { label: 'Days Since Last Period', value: `${Math.floor((Date.now() - lastPeriodStart.getTime()) / (1000 * 60 * 60 * 24))} days` },
            { label: 'Stage', value: 'Perimenopause' },
            { label: 'Hot Flashes This Week', value: '8 episodes' },
            { label: 'Sleep Quality', value: '65%' },
            { label: 'Symptom Severity', value: 'Moderate' },
            { label: 'HRT Status', value: 'Active' }
          ]
        };
      case 'post-menopause':
        return {
          title: 'Post-Menopause Statistics',
          stats: [
            { label: 'Years Since Menopause', value: '3 years' },
            { label: 'Bone Density', value: 'Normal (-0.8 T-score)' },
            { label: 'Last DEXA Scan', value: format(new Date(2024, 8, 1), 'MMM yyyy') },
            { label: 'Vitamin D Level', value: '45 ng/mL (Optimal)' },
            { label: 'Cardiovascular Risk', value: 'Low' },
            { label: 'Next Check-up', value: format(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), 'MMM yyyy') }
          ]
        };
      default: // menstrual-cycle, pre-menstrual
        return {
          title: 'Cycle Statistics',
          stats: [
            { label: 'Average Cycle Length', value: `${cycleLength} days` },
            { label: 'Period Duration', value: `${periodLength} days` },
            { label: 'Last Period Started', value: format(lastPeriodStart, 'MMM d, yyyy') },
            { label: 'Next Period Expected', value: format(new Date(lastPeriodStart.getTime() + (cycleLength - currentCycleDay) * 24 * 60 * 60 * 1000), 'MMM d, yyyy') },
            { label: 'Next Ovulation', value: format(new Date(lastPeriodStart.getTime() + ((ovulationDay - currentCycleDay + cycleLength) % cycleLength) * 24 * 60 * 60 * 1000), 'MMM d, yyyy') },
            { label: 'Cycle Regularity', value: 'Regular (±2 days)' },
            { label: 'PMS Window', value: currentCycleDay >= cycleLength - 7 ? 'Active' : `In ${cycleLength - 7 - currentCycleDay} days` }
          ]
        };
    }
  };

  const modeStats = getModeSpecificStats();
  const showCalendar = !['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode);


  return (
    <div className="flex gap-4">
      {showCalendar && (
      <Card className="p-1 w-[338px]">
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
      )}
      
      {/* Statistics Panel */}
      <Card className="p-4 flex-1">
        <h4 className="text-sm font-semibold mb-4">{modeStats.title}</h4>
        <div className="space-y-3">
          {modeStats.stats.map((stat, index) => (
            <div key={index} className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">{stat.label}</span>
              <span className="text-sm font-medium">{stat.value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default CycleCalendar;
