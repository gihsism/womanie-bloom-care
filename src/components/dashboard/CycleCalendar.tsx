import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { ChevronLeft, ChevronRight, Droplet, Heart, Sparkles, Circle, TrendingUp, TrendingDown, Activity, Calendar as CalendarIcon, AlertCircle, CheckCircle2, Target, Edit } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, addDays, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface CycleCalendarProps {
  lastPeriodStart?: Date;
  cycleLength?: number;
  periodLength?: number;
  selectedMode?: string;
}

const CycleCalendar = ({ 
  lastPeriodStart: initialPeriodStart,
  cycleLength: initialCycleLength = 28,
  periodLength: initialPeriodLength = 5,
  selectedMode = 'menstrual-cycle'
}: CycleCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isEditingPeriod, setIsEditingPeriod] = useState(false);
  const [periodStartDate, setPeriodStartDate] = useState<Date | undefined>(initialPeriodStart || new Date(2025, 9, 1));
  const [periodEndDate, setPeriodEndDate] = useState<Date | undefined>(
    initialPeriodStart ? addDays(initialPeriodStart, initialPeriodLength - 1) : addDays(new Date(2025, 9, 1), 4)
  );
  const [cycleLength, setCycleLength] = useState(initialCycleLength);

  const lastPeriodStart = periodStartDate || new Date(2025, 9, 1);
  const periodLength = periodEndDate && periodStartDate 
    ? differenceInDays(periodEndDate, periodStartDate) + 1 
    : initialPeriodLength;

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

  // Mode-specific statistics with enhanced visualizations
  const getModeSpecificStats = () => {
    const today = new Date();
    const nextOvulation = addDays(lastPeriodStart, ovulationDay);
    const nextPeriod = addDays(lastPeriodStart, cycleLength);
    const fertileWindowStart = addDays(nextOvulation, -5);
    const fertileWindowEnd = nextOvulation;
    
    switch (selectedMode) {
      case 'conception':
        const isInFertileWindow = currentCycleDay >= ovulationDay - 5 && currentCycleDay <= ovulationDay;
        const fertilityStatus = isInFertileWindow ? 'Peak Fertility' : daysToOvulation <= 3 ? 'Approaching' : 'Low';
        
        return {
          title: 'Conception Tracking',
          sections: [
            {
              title: 'Fertility Status',
              highlight: true,
              items: [
                {
                  label: 'Current Status',
                  value: fertilityStatus,
                  badge: isInFertileWindow ? 'High' : daysToOvulation <= 3 ? 'Medium' : 'Low',
                  icon: Target,
                  description: isInFertileWindow 
                    ? 'Best time to conceive - fertile window active!' 
                    : daysToOvulation > 0 
                      ? `Fertile window starts in ${daysToOvulation - 5} days`
                      : 'Ovulation has passed'
                },
                {
                  label: 'Fertility Score',
                  value: `${isInFertileWindow ? '92%' : daysToOvulation <= 3 ? '65%' : '15%'}`,
                  progress: isInFertileWindow ? 92 : daysToOvulation <= 3 ? 65 : 15,
                  icon: Activity,
                  description: 'Probability of conception today'
                }
              ]
            },
            {
              title: 'Ovulation Tracking',
              items: [
                {
                  label: 'Next Ovulation',
                  value: format(nextOvulation, 'MMM d'),
                  badge: daysToOvulation === 0 ? 'Today' : `${Math.abs(daysToOvulation)}d`,
                  icon: Sparkles,
                  description: daysToOvulation === 0 ? 'Ovulating today!' : daysToOvulation > 0 ? `In ${daysToOvulation} days` : `Was ${Math.abs(daysToOvulation)} days ago`
                },
                {
                  label: 'Fertile Window',
                  value: `${format(fertileWindowStart, 'MMM d')} - ${format(fertileWindowEnd, 'MMM d')}`,
                  badge: isInFertileWindow ? 'Active' : 'Upcoming',
                  icon: Heart,
                  description: '5 days before ovulation + ovulation day'
                },
                {
                  label: 'LH Test Result',
                  value: daysToOvulation === 0 ? 'Positive (Peak)' : 'Negative',
                  icon: CheckCircle2,
                  description: 'Latest ovulation test result'
                }
              ]
            },
            {
              title: 'Conception Metrics',
              items: [
                {
                  label: 'BBT Pattern',
                  value: 'Biphasic',
                  icon: TrendingUp,
                  description: '0.4°F temperature rise detected'
                },
                {
                  label: 'Cervical Mucus',
                  value: isInFertileWindow ? 'EWCM (Optimal)' : 'Creamy',
                  icon: Droplet,
                  description: isInFertileWindow ? 'Egg white consistency - most fertile' : 'Not fertile quality'
                },
                {
                  label: 'Intercourse Timing',
                  value: isInFertileWindow ? 'Optimal' : 'Plan ahead',
                  icon: Target,
                  description: isInFertileWindow ? '3 times in fertile window' : 'Time intercourse for fertile window'
                }
              ]
            },
            {
              title: 'Ovarian Reserve',
              items: [
                {
                  label: 'AMH Level',
                  value: '2.8 ng/mL',
                  badge: 'Normal',
                  icon: Activity,
                  description: 'Good ovarian reserve for age'
                },
                {
                  label: 'Antral Follicle Count',
                  value: '12 follicles',
                  badge: 'Excellent',
                  icon: Circle,
                  description: 'From latest ultrasound (Oct 1)'
                },
                {
                  label: 'Trying Duration',
                  value: '3 months',
                  progress: 25,
                  icon: CalendarIcon,
                  description: 'Average conception time: 6-12 months'
                }
              ]
            }
          ],
          summary: isInFertileWindow 
            ? '🎯 Peak fertility window! This is your best time to conceive.'
            : daysToOvulation > 0 
              ? `Fertile window opens in ${daysToOvulation - 5} days. Plan ahead!`
              : 'Focus on tracking for next cycle.'
        };
      
      case 'contraception':
        return {
          title: 'Contraception Monitoring',
          sections: [
            {
              title: 'Protection Status',
              highlight: true,
              items: [
                {
                  label: 'Current Status',
                  value: 'Active Protection',
                  badge: 'Protected',
                  icon: CheckCircle2,
                  description: 'Contraception is effective'
                },
                {
                  label: 'Adherence Rate',
                  value: '98%',
                  progress: 98,
                  icon: Target,
                  description: '29/30 pills taken on time this month'
                }
              ]
            },
            {
              title: 'This Month',
              items: [
                {
                  label: 'Fertile Window',
                  value: daysToOvulation > 0 && daysToOvulation < 6 ? 'Active' : 'Not Active',
                  badge: daysToOvulation > 0 && daysToOvulation < 6 ? 'Caution' : 'Safe',
                  icon: AlertCircle,
                  description: 'Natural fertility tracking (informational)'
                },
                {
                  label: 'Breakthrough Bleeding',
                  value: '2 days',
                  icon: Droplet,
                  description: 'Light spotting episodes'
                },
                {
                  label: 'Next Pill Pack',
                  value: format(addDays(today, 21), 'MMM d'),
                  icon: CalendarIcon,
                  description: 'In 21 days'
                }
              ]
            },
            {
              title: 'Side Effects Monitoring',
              items: [
                {
                  label: 'Mood Score',
                  value: '7/10',
                  progress: 70,
                  icon: Activity,
                  description: 'Slight anxiety noted'
                },
                {
                  label: 'Weight Change',
                  value: '+1.2 kg',
                  icon: TrendingUp,
                  description: 'Within normal range'
                },
                {
                  label: 'Libido Score',
                  value: '6/10',
                  progress: 60,
                  icon: Heart,
                  description: 'Consistent this cycle'
                }
              ]
            }
          ],
          summary: 'Excellent adherence. Your contraception is working effectively.'
        };
      
      case 'ivf':
        return {
          title: 'IVF Protocol',
          sections: [
            {
              title: 'Protocol Progress',
              highlight: true,
              items: [
                {
                  label: 'Current Phase',
                  value: 'Stimulation Day 8',
                  badge: 'Active',
                  icon: Activity,
                  description: 'Day 8 of 14 - on track'
                },
                {
                  label: 'Progress',
                  value: '57% Complete',
                  progress: 57,
                  icon: Target,
                  description: 'Estimated retrieval in 6 days'
                }
              ]
            },
            {
              title: 'Follicle Development',
              items: [
                {
                  label: 'Leading Follicles',
                  value: '12 growing',
                  badge: 'Excellent',
                  icon: Circle,
                  description: 'Great response to medication'
                },
                {
                  label: 'Largest Follicle',
                  value: '14 mm',
                  icon: TrendingUp,
                  description: 'Target: 18-20mm for trigger'
                },
                {
                  label: 'Next Monitoring',
                  value: format(addDays(today, 2), 'MMM d'),
                  icon: CalendarIcon,
                  description: 'Ultrasound + bloodwork'
                }
              ]
            },
            {
              title: 'Medication & Wellness',
              items: [
                {
                  label: 'Medication Adherence',
                  value: '100%',
                  progress: 100,
                  icon: CheckCircle2,
                  description: 'All doses on schedule'
                },
                {
                  label: 'Injection Site',
                  value: 'Minimal discomfort',
                  progress: 20,
                  icon: AlertCircle,
                  description: 'Reaction score: 2/10'
                },
                {
                  label: 'Anxiety Level',
                  value: '6/10',
                  progress: 60,
                  icon: Activity,
                  description: 'Managing well with support'
                }
              ]
            }
          ],
          summary: '✅ Excellent protocol response! Follicles developing perfectly.'
        };

      case 'pregnancy':
        return {
          title: 'Pregnancy Progress',
          sections: [
            {
              title: 'Current Status',
              highlight: true,
              items: [
                {
                  label: 'Gestational Age',
                  value: 'Week 24',
                  badge: '2nd Trimester',
                  icon: CalendarIcon,
                  description: '6 months pregnant'
                },
                {
                  label: 'Progress',
                  value: '67% Complete',
                  progress: 67,
                  icon: Target,
                  description: '16 weeks remaining'
                }
              ]
            },
            {
              title: 'Baby Development',
              items: [
                {
                  label: 'Fetal Movement',
                  value: '12 kicks/hour',
                  badge: 'Healthy',
                  icon: Heart,
                  description: 'Active and healthy movement'
                },
                {
                  label: 'Estimated Size',
                  value: 'Papaya (~30cm)',
                  icon: Activity,
                  description: 'Growing well for gestational age'
                },
                {
                  label: 'Due Date',
                  value: format(new Date(2025, 6, 15), 'MMM d, yyyy'),
                  icon: CalendarIcon,
                  description: '112 days until due date'
                }
              ]
            },
            {
              title: 'Maternal Health',
              items: [
                {
                  label: 'Weight Gain',
                  value: '+11 kg',
                  progress: 73,
                  icon: TrendingUp,
                  description: 'On target for week 24'
                },
                {
                  label: 'Symptoms',
                  value: 'Mild swelling',
                  icon: AlertCircle,
                  description: 'Feet/ankles in evening'
                },
                {
                  label: 'Next Checkup',
                  value: format(addDays(today, 14), 'MMM d'),
                  icon: CalendarIcon,
                  description: 'Routine prenatal visit'
                }
              ]
            }
          ],
          summary: '👶 Healthy pregnancy! Baby developing perfectly on schedule.'
        };

      default: // menstrual-cycle
        return {
          title: 'Cycle Health',
          sections: [
            {
              title: 'Current Cycle Status',
              highlight: true,
              items: [
                {
                  label: 'Cycle Day',
                  value: `Day ${currentCycleDay + 1}`,
                  badge: currentCycleDay < periodLength ? 'Period' : currentCycleDay >= ovulationDay - 5 && currentCycleDay <= ovulationDay ? 'Fertile' : 'Regular',
                  icon: CalendarIcon,
                  description: `${cycleLength}-day cycle`
                },
                {
                  label: 'Next Period',
                  value: format(nextPeriod, 'MMM d'),
                  badge: `${daysToNextPeriod}d`,
                  icon: Droplet,
                  description: `In ${daysToNextPeriod} days`
                }
              ]
            },
            {
              title: 'Cycle Phases',
              items: [
                {
                  label: 'Next Ovulation',
                  value: format(nextOvulation, 'MMM d'),
                  badge: `${Math.abs(daysToOvulation)}d`,
                  icon: Sparkles,
                  description: daysToOvulation > 0 ? `In ${daysToOvulation} days` : `Was ${Math.abs(daysToOvulation)} days ago`
                },
                {
                  label: 'Cycle Regularity',
                  value: '±2 days',
                  badge: 'Regular',
                  icon: CheckCircle2,
                  description: 'Very consistent pattern'
                },
                {
                  label: 'Period Flow',
                  value: 'Medium',
                  icon: Droplet,
                  description: `${periodLength} days duration`
                }
              ]
            },
            {
              title: 'Health Metrics',
              items: [
                {
                  label: 'PMS Severity',
                  value: '4/10',
                  progress: 40,
                  icon: Activity,
                  description: 'Mild symptoms expected'
                },
                {
                  label: 'BBT Pattern',
                  value: '97.8°F',
                  icon: TrendingUp,
                  description: 'Follicular phase temperature'
                },
                {
                  label: 'Heart Rate Variability',
                  value: '68 ms',
                  progress: 80,
                  icon: Heart,
                  description: 'Good recovery status'
                }
              ]
            }
          ],
          summary: daysToOvulation <= 5 && daysToOvulation > 0 
            ? `Approaching ovulation in ${daysToOvulation} days`
            : 'Healthy regular cycle pattern'
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
      {/* Period Tracking Header */}
      {showCycleInfo && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Droplet className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Period Tracking</span>
          </div>
          <Dialog open={isEditingPeriod} onOpenChange={setIsEditingPeriod}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1">
                <Edit className="h-3 w-3" />
                <span className="text-xs">Edit Period</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Track Your Period</DialogTitle>
                <DialogDescription>
                  {!periodStartDate 
                    ? "Select when your last period started" 
                    : !periodEndDate 
                    ? "Now select when it ended" 
                    : "Your period tracking is complete"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Calendar
                  mode="single"
                  selected={!periodStartDate ? undefined : periodEndDate || periodStartDate}
                  onSelect={(date) => {
                    if (!periodStartDate) {
                      setPeriodStartDate(date);
                      setPeriodEndDate(undefined);
                    } else if (!periodEndDate) {
                      setPeriodEndDate(date);
                    } else {
                      // Reset and start over
                      setPeriodStartDate(date);
                      setPeriodEndDate(undefined);
                    }
                  }}
                  className={cn("rounded-md border pointer-events-auto w-full")}
                  disabled={(date) => 
                    date > new Date() || 
                    (periodStartDate && !periodEndDate && date < periodStartDate)
                  }
                  captionLayout="dropdown-buttons"
                  fromYear={2020}
                  toYear={new Date().getFullYear()}
                />
                
                <div className="space-y-2">
                  {periodStartDate && (
                    <div className="flex items-center justify-between p-2 bg-primary/10 rounded-md">
                      <span className="text-sm">Period started:</span>
                      <span className="text-sm font-medium">{format(periodStartDate, 'MMM d, yyyy')}</span>
                    </div>
                  )}
                  {periodEndDate && (
                    <div className="flex items-center justify-between p-2 bg-primary/10 rounded-md">
                      <span className="text-sm">Period ended:</span>
                      <span className="text-sm font-medium">{format(periodEndDate, 'MMM d, yyyy')} ({periodLength} days)</span>
                    </div>
                  )}
                </div>

                {periodStartDate && periodEndDate && (
                  <div className="bg-accent/10 border border-accent rounded-md p-3 space-y-1">
                    <p className="text-sm font-medium">✨ Fertile Window</p>
                    <p className="text-xs text-muted-foreground">
                      Ovulation: ~{format(addDays(periodStartDate, Math.floor(cycleLength / 2)), 'MMM d')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Fertile days: {format(addDays(periodStartDate, Math.floor(cycleLength / 2) - 5), 'MMM d')} - {format(addDays(periodStartDate, Math.floor(cycleLength / 2)), 'MMM d')}
                    </p>
                  </div>
                )}
                
                <div className="flex gap-2">
                  {periodStartDate && (
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setPeriodStartDate(undefined);
                        setPeriodEndDate(undefined);
                      }} 
                      className="flex-1"
                    >
                      Reset
                    </Button>
                  )}
                  <Button 
                    onClick={() => setIsEditingPeriod(false)} 
                    className="flex-1"
                    disabled={!periodStartDate || !periodEndDate}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

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
      <Card className="p-5 flex-1">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold">{modeStats.title}</h4>
        </div>
        
        <div className="space-y-5">
          {modeStats.sections.map((section, sectionIdx) => (
            <div 
              key={sectionIdx} 
              className={`space-y-3 ${section.highlight ? 'pb-4 border-b-2 border-primary/20' : 'pb-3 border-b'}`}
            >
              <h5 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {section.title}
              </h5>
              
              {section.items.map((item, itemIdx) => {
                const IconComponent = item.icon;
                return (
                  <div key={itemIdx} className="space-y-2">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex items-start gap-2 flex-1">
                        <IconComponent className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                            {item.badge && (
                              <Badge 
                                variant={
                                  item.badge === 'High' || item.badge === 'Active' || item.badge === 'Protected' || item.badge === 'Excellent' || item.badge === 'Healthy' || item.badge === 'Today' ? 'default' :
                                  item.badge === 'Medium' || item.badge === 'Upcoming' || item.badge === 'Caution' ? 'secondary' :
                                  'outline'
                                }
                                className="text-[10px] h-4 px-1.5"
                              >
                                {item.badge}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{item.description}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold whitespace-nowrap">{item.value}</span>
                    </div>
                    
                    {item.progress !== undefined && (
                      <Progress 
                        value={item.progress} 
                        className="h-2"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          
          <div className="pt-3 mt-3 border-t">
            <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg">
              <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium leading-relaxed">{modeStats.summary}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default CycleCalendar;
