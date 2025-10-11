import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronLeft, ChevronRight, Droplet, Heart, Sparkles, Circle, TrendingUp, TrendingDown, Activity } from 'lucide-react';
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
    // Don't show cycle tracking for non-menstrual modes
    if (['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode)) {
      return { type: 'regular', color: 'bg-muted/30', label: 'Day' };
    }
    
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

  // Mode-specific statistics with visualizations
  const getModeSpecificStats = () => {
    switch (selectedMode) {
      case 'contraception':
        return {
          title: 'Contraception Monitoring',
          metrics: [
            { 
              label: 'Adherence Rate', 
              value: '98%', 
              progress: 98,
              trend: 'up',
              description: '29/30 pills on time this month'
            },
            { 
              label: 'Breakthrough Bleeding', 
              value: '2 days', 
              progress: 20,
              trend: 'stable',
              description: 'Light spotting episodes'
            },
            { 
              label: 'Mood Score', 
              value: '7/10', 
              progress: 70,
              trend: 'down',
              description: 'Slight anxiety noted'
            },
            { 
              label: 'Weight Change', 
              value: '+1.2 kg', 
              progress: 40,
              trend: 'up',
              description: 'Within normal range'
            },
            { 
              label: 'Libido Score', 
              value: '6/10', 
              progress: 60,
              trend: 'stable',
              description: 'Consistent this cycle'
            },
            { 
              label: 'Side Effects', 
              value: 'Mild', 
              progress: 30,
              trend: 'down',
              description: 'Headaches decreased'
            }
          ],
          summary: 'Excellent adherence. Monitor mood changes.'
        };
      
      case 'conception':
        return {
          title: 'Conception Tracking',
          metrics: [
            { 
              label: 'Ovulation Confirmed', 
              value: 'LH+ & BBT↑', 
              progress: 100,
              trend: 'up',
              description: 'Peak detected yesterday'
            },
            { 
              label: 'BBT Rise', 
              value: '0.4°F', 
              progress: 80,
              trend: 'up',
              description: 'Biphasic pattern confirmed'
            },
            { 
              label: 'Cervical Mucus', 
              value: 'EWCM', 
              progress: 100,
              trend: 'stable',
              description: 'Optimal fertile quality'
            },
            { 
              label: 'Intercourse Timing', 
              value: 'Optimal', 
              progress: 90,
              trend: 'up',
              description: '3 days in fertile window'
            },
            { 
              label: 'Fertility Score', 
              value: '92%', 
              progress: 92,
              trend: 'up',
              description: 'Peak fertility today'
            },
            { 
              label: 'Days Trying', 
              value: '3 months', 
              progress: 25,
              trend: 'stable',
              description: 'Cycle 3 of 12'
            }
          ],
          summary: 'Perfect timing! Peak fertility window active.'
        };
      
      case 'ivf':
        return {
          title: 'IVF Protocol Status',
          metrics: [
            { 
              label: 'Protocol Progress', 
              value: 'Day 8/14', 
              progress: 57,
              trend: 'up',
              description: 'Stimulation phase'
            },
            { 
              label: 'Medication Adherence', 
              value: '100%', 
              progress: 100,
              trend: 'stable',
              description: 'All doses on schedule'
            },
            { 
              label: 'Injection Site Reaction', 
              value: '2/10', 
              progress: 20,
              trend: 'down',
              description: 'Minimal discomfort'
            },
            { 
              label: 'Follicle Development', 
              value: '12 growing', 
              progress: 75,
              trend: 'up',
              description: 'Excellent response'
            },
            { 
              label: 'Anxiety Level', 
              value: '6/10', 
              progress: 60,
              trend: 'stable',
              description: 'Managing well'
            },
            { 
              label: 'Fatigue Score', 
              value: '7/10', 
              progress: 70,
              trend: 'up',
              description: 'Expected during stim'
            }
          ],
          summary: 'Excellent protocol response. Retrieval in ~6 days.'
        };
      
      case 'pregnancy':
        return {
          title: 'Pregnancy Monitoring',
          metrics: [
            { 
              label: 'Gestational Week', 
              value: 'Week 24', 
              progress: 67,
              trend: 'up',
              description: '6 months, 2nd trimester'
            },
            { 
              label: 'Fetal Kick Count', 
              value: '12/hour', 
              progress: 100,
              trend: 'stable',
              description: 'Healthy activity'
            },
            { 
              label: 'Weight Gain', 
              value: '+11 kg', 
              progress: 73,
              trend: 'up',
              description: 'On target for week 24'
            },
            { 
              label: 'Nausea Level', 
              value: '1/10', 
              progress: 10,
              trend: 'down',
              description: 'Resolved'
            },
            { 
              label: 'Swelling/Edema', 
              value: 'Mild', 
              progress: 30,
              trend: 'stable',
              description: 'Feet/ankles evening'
            },
            { 
              label: 'Contractions', 
              value: 'None', 
              progress: 0,
              trend: 'stable',
              description: 'No Braxton Hicks yet'
            }
          ],
          summary: 'Healthy pregnancy progression. Baby developing well.'
        };
      
      case 'menopause':
        return {
          title: 'Menopause Symptom Tracking',
          metrics: [
            { 
              label: 'Hot Flashes', 
              value: '8/week', 
              progress: 60,
              trend: 'down',
              description: 'Down from 12 last week'
            },
            { 
              label: 'Hot Flash Severity', 
              value: '6/10', 
              progress: 60,
              trend: 'down',
              description: 'Improving with HRT'
            },
            { 
              label: 'Night Sweats', 
              value: 'Moderate', 
              progress: 50,
              trend: 'stable',
              description: '3-4 episodes/night'
            },
            { 
              label: 'Sleep Disruption', 
              value: '5 hrs', 
              progress: 40,
              trend: 'down',
              description: 'Below optimal'
            },
            { 
              label: 'Brain Fog', 
              value: '5/10', 
              progress: 50,
              trend: 'stable',
              description: 'Memory lapses'
            },
            { 
              label: 'Days Since Period', 
              value: '67 days', 
              progress: 75,
              trend: 'up',
              description: 'Irregular pattern'
            }
          ],
          summary: 'Perimenopause symptoms improving with treatment.'
        };
      
      case 'post-menopause':
        return {
          title: 'Post-Menopause Health',
          metrics: [
            { 
              label: 'Bone Density', 
              value: '-0.8 T-score', 
              progress: 85,
              trend: 'stable',
              description: 'Normal range'
            },
            { 
              label: 'Vaginal Dryness', 
              value: '4/10', 
              progress: 40,
              trend: 'down',
              description: 'Improved with moisturizer'
            },
            { 
              label: 'Cardiovascular Risk', 
              value: 'Low', 
              progress: 20,
              trend: 'stable',
              description: 'BP: 118/76 mmHg'
            },
            { 
              label: 'Urinary Incontinence', 
              value: '2 episodes', 
              progress: 30,
              trend: 'stable',
              description: 'Stress incontinence'
            },
            { 
              label: 'Energy Level', 
              value: '7/10', 
              progress: 70,
              trend: 'up',
              description: 'Stable and good'
            },
            { 
              label: 'Vitamin D', 
              value: '45 ng/mL', 
              progress: 90,
              trend: 'stable',
              description: 'Optimal levels'
            }
          ],
          summary: 'Excellent health maintenance. Continue current regimen.'
        };
      
      default: // menstrual-cycle, pre-menstrual
        return {
          title: 'Menstrual Cycle Health',
          metrics: [
            { 
              label: 'Cycle Regularity', 
              value: '±2 days', 
              progress: 90,
              trend: 'stable',
              description: 'Very regular pattern'
            },
            { 
              label: 'Period Flow', 
              value: 'Medium', 
              progress: 60,
              trend: 'stable',
              description: `${periodLength} days duration`
            },
            { 
              label: 'PMS Severity', 
              value: '4/10', 
              progress: 40,
              trend: 'down',
              description: 'Mild symptoms'
            },
            { 
              label: 'Basal Body Temp', 
              value: '97.8°F', 
              progress: 50,
              trend: 'up',
              description: 'Follicular phase'
            },
            { 
              label: 'Resting Heart Rate', 
              value: '62 bpm', 
              progress: 75,
              trend: 'stable',
              description: 'Healthy range'
            },
            { 
              label: 'HRV Score', 
              value: '68 ms', 
              progress: 80,
              trend: 'up',
              description: 'Good recovery'
            }
          ],
          summary: 'Healthy regular cycle. Ovulation expected in ' + daysToOvulation + ' days.'
        };
    }
  };

  const modeStats = getModeSpecificStats();
  const showCycleInfo = !['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode);
  const showLegend = !['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode);



  return (
    <div className="flex gap-4">
      <Card className="p-2 w-[507px]">
        <div className="space-y-2">
      {/* Cycle Stats - only show for menstrual modes */}
      {showCycleInfo && (
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 bg-muted/30 rounded">
          <div className="flex items-center gap-1 mb-1">
            <Circle className="h-3 w-3 text-primary" />
            <span className="text-xs text-muted-foreground">Day</span>
          </div>
          <div className="text-base font-bold">{currentCycleDay + 1}</div>
        </div>
        
        <div className="p-2 bg-muted/30 rounded">
          <div className="flex items-center gap-1 mb-1">
            <Sparkles className="h-3 w-3 text-secondary" />
            <span className="text-xs text-muted-foreground">Ovulation</span>
          </div>
          <div className="text-base font-bold">
            {daysToOvulation > 0 ? daysToOvulation : daysToOvulation + cycleLength}d
          </div>
        </div>
        
        <div className="p-2 bg-muted/30 rounded">
          <div className="flex items-center gap-1 mb-1">
            <Droplet className="h-3 w-3 text-primary" />
            <span className="text-xs text-muted-foreground">Period</span>
          </div>
          <div className="text-base font-bold">{daysToNextPeriod}d</div>
        </div>
      </div>
      )}
      
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">
          {format(currentMonth, 'MMMM yyyy')}
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
        <div className="grid grid-cols-7 gap-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
            <div key={i} className="text-center text-xs font-medium text-muted-foreground w-10">
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
                  relative aspect-square rounded text-xs transition-all w-10 h-10
                  ${inCurrentMonth ? 'opacity-100' : 'opacity-30'}
                  ${dayInfo.color}
                  ${today ? 'ring-1 ring-foreground' : ''}
                  ${isSelected ? 'ring-1 ring-primary' : ''}
                `}
              >
                <div className={`text-[10px] font-bold ${
                  dayInfo.type === 'period' || dayInfo.type === 'ovulation' || dayInfo.type === 'fertile'
                    ? 'text-white'
                    : 'text-foreground'
                }`}>
                  {format(date, 'd')}
                </div>
                
                {/* Ovulation marker */}
                {dayInfo.type === 'ovulation' && (
                  <Sparkles className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-white" />
                )}
                
                {/* Period marker */}
                {dayInfo.type === 'period' && (
                  <Droplet className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-white fill-white" />
                )}
                
                {/* Fertile marker */}
                {dayInfo.type === 'fertile' && (
                  <Heart className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-white" />
                )}
              </button>
            );
          })}
        </div>

      {/* Legend - only show for menstrual modes */}
      {showLegend && (
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
      )}
      </div>
      </Card>
      
      {/* Statistics Panel */}
      <Card className="p-4 flex-1">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-base font-semibold">{modeStats.title}</h4>
        </div>
        <div className="space-y-4">
          {modeStats.metrics.map((metric, index) => (
            <div key={index} className="space-y-1.5">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{metric.label}</span>
                  {metric.trend === 'up' && <TrendingUp className="h-3 w-3 text-green-600" />}
                  {metric.trend === 'down' && <TrendingDown className="h-3 w-3 text-orange-600" />}
                  {metric.trend === 'stable' && <Activity className="h-3 w-3 text-blue-600" />}
                </div>
                <span className="text-sm font-semibold">{metric.value}</span>
              </div>
              <Progress value={metric.progress} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground">{metric.description}</p>
            </div>
          ))}
          
          <div className="pt-3 border-t mt-4">
            <div className="flex items-start gap-2 p-2 bg-muted/30 rounded">
              <Sparkles className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-xs font-medium">{modeStats.summary}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default CycleCalendar;
