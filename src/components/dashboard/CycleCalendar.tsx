import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, Droplet, Heart, Sparkles, Circle, TrendingUp, TrendingDown, Activity, Calendar as CalendarIcon, AlertCircle, CheckCircle2, Target, Edit, Settings2, Plus, X } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, addDays, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';

// Health signal types
interface DaySignal {
  date: string; // ISO date string
  symptoms: string[];
  intercourse: {
    protected: boolean;
    timestamp?: string;
  }[];
  mood: string[];
  discharge: string;
  notes: string;
}

const SYMPTOM_OPTIONS = [
  { value: 'cramps', label: 'Abdominal Cramps', icon: '🤕' },
  { value: 'headache', label: 'Headache', icon: '🤯' },
  { value: 'bloating', label: 'Bloating', icon: '😖' },
  { value: 'tender_breasts', label: 'Tender Breasts', icon: '💢' },
  { value: 'back_pain', label: 'Back Pain', icon: '🔙' },
  { value: 'nausea', label: 'Nausea', icon: '🤢' },
  { value: 'fatigue', label: 'Fatigue', icon: '😴' },
  { value: 'acne', label: 'Acne', icon: '😣' },
];

const MOOD_OPTIONS = [
  { value: 'happy', label: 'Happy', icon: '😊' },
  { value: 'sad', label: 'Sad', icon: '😢' },
  { value: 'anxious', label: 'Anxious', icon: '😰' },
  { value: 'irritable', label: 'Irritable', icon: '😤' },
  { value: 'energetic', label: 'Energetic', icon: '⚡' },
  { value: 'calm', label: 'Calm', icon: '😌' },
];

const DISCHARGE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'dry', label: 'Dry' },
  { value: 'sticky', label: 'Sticky' },
  { value: 'creamy', label: 'Creamy' },
  { value: 'watery', label: 'Watery' },
  { value: 'ewcm', label: 'EWCM (Egg White)' },
];

interface CycleCalendarProps {
  lastPeriodStart?: Date;
  cycleLength?: number;
  periodLength?: number;
  selectedMode?: string;
  ovulationPrediction?: {
    predictedOvulationDate?: string;
    fertileWindowStart?: string;
    fertileWindowEnd?: string;
    confidence: string;
    keyIndicators: string[];
  } | null;
}

const CycleCalendar = ({ 
  lastPeriodStart: initialPeriodStart,
  cycleLength: initialCycleLength = 28,
  periodLength: initialPeriodLength = 5,
  selectedMode = 'menstrual-cycle',
  ovulationPrediction
}: CycleCalendarProps) => {
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isEditingPeriod, setIsEditingPeriod] = useState(false);
  const [periodStartDate, setPeriodStartDate] = useState<Date | undefined>(initialPeriodStart || new Date(2025, 9, 1));
  const [periodEndDate, setPeriodEndDate] = useState<Date | undefined>(
    initialPeriodStart ? addDays(initialPeriodStart, initialPeriodLength - 1) : addDays(new Date(2025, 9, 1), 4)
  );
  
  // Temporary state for editing - only saved on "Save" button click
  const [tempPeriodStartDate, setTempPeriodStartDate] = useState<Date | undefined>(undefined);
  const [tempPeriodEndDate, setTempPeriodEndDate] = useState<Date | undefined>(undefined);
  
  const [cycleLength, setCycleLength] = useState(initialCycleLength);
  const [isEditingCycle, setIsEditingCycle] = useState(false);
  const [tempCycleLength, setTempCycleLength] = useState(initialCycleLength);

  // Health signals tracking
  const [daySignals, setDaySignals] = useState<Record<string, DaySignal>>({});
  const [isEditingSignals, setIsEditingSignals] = useState(false);
  const [currentEditDate, setCurrentEditDate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Load data from database on mount
  useEffect(() => {
    loadCalendarData();
  }, []);
  
  const loadCalendarData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load period tracking
      const { data: periodData } = await supabase
        .from('period_tracking')
        .select('*')
        .eq('user_id', user.id)
        .order('period_start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (periodData) {
        setPeriodStartDate(new Date(periodData.period_start_date));
        setPeriodEndDate(new Date(periodData.period_end_date));
        setCycleLength(periodData.cycle_length);
        setTempCycleLength(periodData.cycle_length);
      }

      // Load health signals
      const { data: signalsData } = await supabase
        .from('daily_health_signals')
        .select('*')
        .eq('user_id', user.id);

      if (signalsData) {
        const signalsMap: Record<string, DaySignal> = {};
        signalsData.forEach(signal => {
          signalsMap[signal.signal_date] = {
            date: signal.signal_date,
            symptoms: signal.symptoms || [],
            intercourse: signal.intercourse as any[] || [],
            mood: signal.mood || [],
            discharge: signal.discharge || 'none',
            notes: signal.notes || '',
          };
        });
        setDaySignals(signalsMap);
      }
    } catch (error) {
      console.error('Error loading calendar data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load calendar data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const savePeriodTracking = async (startDate: Date, endDate: Date, cycleLen: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('period_tracking')
        .upsert({
          user_id: user.id,
          period_start_date: format(startDate, 'yyyy-MM-dd'),
          period_end_date: format(endDate, 'yyyy-MM-dd'),
          cycle_length: cycleLen,
        }, {
          onConflict: 'user_id,period_start_date'
        });

      if (error) throw error;
      
      toast({
        title: 'Saved',
        description: 'Period tracking updated successfully',
      });
    } catch (error) {
      console.error('Error saving period tracking:', error);
      toast({
        title: 'Error',
        description: 'Failed to save period tracking',
        variant: 'destructive',
      });
    }
  };
  
  const saveHealthSignal = async (date: Date, signal: DaySignal) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('daily_health_signals')
        .upsert({
          user_id: user.id,
          signal_date: format(date, 'yyyy-MM-dd'),
          symptoms: signal.symptoms,
          intercourse: signal.intercourse,
          mood: signal.mood,
          discharge: signal.discharge,
          notes: signal.notes,
        }, {
          onConflict: 'user_id,signal_date'
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error saving health signal:', error);
      toast({
        title: 'Error',
        description: 'Failed to save health signal',
        variant: 'destructive',
      });
    }
  };
  
  // Get or create signal for a date
  const getSignalForDate = (date: Date): DaySignal => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return daySignals[dateKey] || {
      date: dateKey,
      symptoms: [],
      intercourse: [],
      mood: [],
      discharge: 'none',
      notes: '',
    };
  };
  
  // Update signal for a date
  const updateSignalForDate = (date: Date, signal: Partial<DaySignal>) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const updatedSignal = {
      ...getSignalForDate(date),
      ...signal,
    };
    setDaySignals(prev => ({
      ...prev,
      [dateKey]: updatedSignal
    }));
    // Save immediately to database
    saveHealthSignal(date, updatedSignal);
  };

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
    // Cycle day starts at 1, not 0
    return (daysSince % cycleLength) + 1;
  };

  const getDayType = (date: Date) => {
    // Don't show cycle tracking for non-menstrual modes
    if (['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode)) {
      return { type: 'regular', color: 'bg-muted/30', label: 'Day' };
    }
    
    // First check if this date has EWCM discharge - that's the strongest ovulation indicator
    const dateKey = format(date, 'yyyy-MM-dd');
    const signal = daySignals[dateKey];
    if (signal?.discharge === 'ewcm') {
      return { type: 'ovulation', color: 'bg-secondary', label: 'Ovulation (EWCM detected)' };
    }
    
    const cycleDay = getCycleDay(date);
    
    // Period days (cycle days 1-5 for 5-day period)
    if (cycleDay <= periodLength) {
      return { type: 'period', color: 'bg-primary', label: 'Period' };
    }
    
    // Use AI prediction if available
    if (ovulationPrediction?.predictedOvulationDate) {
      const predictedOvDate = new Date(ovulationPrediction.predictedOvulationDate);
      const fertileStart = ovulationPrediction.fertileWindowStart ? new Date(ovulationPrediction.fertileWindowStart) : null;
      const fertileEnd = ovulationPrediction.fertileWindowEnd ? new Date(ovulationPrediction.fertileWindowEnd) : null;
      
      // Check if date is within 1 day of predicted ovulation
      const daysDiff = Math.abs(differenceInDays(date, predictedOvDate));
      if (daysDiff === 0) {
        return { type: 'ovulation', color: 'bg-secondary', label: 'AI Predicted Ovulation' };
      }
      
      if (fertileStart && fertileEnd && date >= fertileStart && date <= fertileEnd && !isSameDay(date, predictedOvDate)) {
        return { type: 'fertile', color: 'bg-accent', label: 'AI Fertile Window' };
      }
    }
    
    // Fallback to standard calculation
    const ovulationDay = cycleLength - 13;
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
  const ovulationDay = cycleLength - 13; // 14 days before next period
  const daysToOvulation = ovulationDay >= currentCycleDay 
    ? ovulationDay - currentCycleDay 
    : (cycleLength - currentCycleDay) + ovulationDay;
  const daysToNextPeriod = cycleLength >= currentCycleDay 
    ? (cycleLength + 1) - currentCycleDay 
    : 1;

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
          <div className="flex gap-2">
            <Dialog open={isEditingCycle} onOpenChange={setIsEditingCycle}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1">
                  <Settings2 className="h-3 w-3" />
                  <span className="text-xs">Cycle Settings</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Cycle Settings</DialogTitle>
                  <DialogDescription>
                    Update your average cycle length to improve predictions
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Average Cycle Length</label>
                    <Select
                      value={tempCycleLength.toString()}
                      onValueChange={(value) => setTempCycleLength(parseInt(value))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => i + 21).map((days) => (
                          <SelectItem key={days} value={days.toString()}>
                            {days} days
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Normal cycles range from 21-35 days. Most common: 28 days.
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setTempCycleLength(initialCycleLength);
                        setIsEditingCycle(false);
                      }} 
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={() => {
                        setCycleLength(tempCycleLength);
                        setIsEditingCycle(false);
                      }} 
                      className="flex-1"
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={isEditingPeriod} onOpenChange={(open) => {
              if (!open) {
                // Reset temp values when closing without saving
                setTempPeriodStartDate(undefined);
                setTempPeriodEndDate(undefined);
              } else {
                // Initialize temp values when opening
                setTempPeriodStartDate(periodStartDate);
                setTempPeriodEndDate(periodEndDate);
              }
              setIsEditingPeriod(open);
            }}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1">
                <Edit className="h-3 w-3" />
                <span className="text-xs">Edit Period</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Track Your Period</DialogTitle>
                <DialogDescription>
                  {!tempPeriodStartDate 
                    ? "Select when your last period started" 
                    : !tempPeriodEndDate 
                    ? "Now select when it ended" 
                    : "Review and save your period dates"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4 px-1">
                <div className="border rounded-lg p-4 bg-muted/20">
                  <Calendar
                    mode="single"
                    selected={!tempPeriodStartDate ? undefined : tempPeriodEndDate || tempPeriodStartDate}
                    onSelect={(date) => {
                      if (!tempPeriodStartDate) {
                        setTempPeriodStartDate(date);
                        setTempPeriodEndDate(undefined);
                      } else if (!tempPeriodEndDate) {
                        setTempPeriodEndDate(date);
                      } else {
                        // Reset and start over
                        setTempPeriodStartDate(date);
                        setTempPeriodEndDate(undefined);
                      }
                    }}
                    className={cn("rounded-md pointer-events-auto w-full")}
                    disabled={(date) => 
                      date > new Date() || 
                      (tempPeriodStartDate && !tempPeriodEndDate && date < tempPeriodStartDate)
                    }
                    captionLayout="dropdown-buttons"
                    fromYear={2020}
                    toYear={new Date().getFullYear()}
                  />
                </div>
                
                <div className="space-y-3">
                  {tempPeriodStartDate && (
                    <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Period started:</span>
                      </div>
                      <span className="text-sm font-semibold">{format(tempPeriodStartDate, 'MMM d, yyyy')}</span>
                    </div>
                  )}
                  {tempPeriodEndDate && tempPeriodStartDate && (
                    <>
                      <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Period ended:</span>
                        </div>
                        <span className="text-sm font-semibold">{format(tempPeriodEndDate, 'MMM d, yyyy')}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-accent/10 border border-accent/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Droplet className="h-4 w-4 text-accent" />
                          <span className="text-sm font-medium">Period length:</span>
                        </div>
                        <span className="text-sm font-bold">
                          {differenceInDays(tempPeriodEndDate, tempPeriodStartDate) + 1} days
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {tempPeriodStartDate && tempPeriodEndDate && (
                  <div className="bg-secondary/10 border border-secondary/20 rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-secondary" />
                      <p className="text-sm font-semibold">Predicted Fertile Window</p>
                    </div>
                    <div className="space-y-1 pl-6">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Ovulation:</span> ~{format(addDays(tempPeriodStartDate, cycleLength - 14), 'MMM d, yyyy')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Fertile window:</span> {format(addDays(tempPeriodStartDate, cycleLength - 18), 'MMM d')} - {format(addDays(tempPeriodStartDate, cycleLength - 14), 'MMM d')}
                      </p>
                    </div>
                  </div>
                )}
                
                <div className="flex gap-2 pt-2">
                  {tempPeriodStartDate && (
                    <Button 
                      variant="outline"
                      onClick={() => {
                        setTempPeriodStartDate(undefined);
                        setTempPeriodEndDate(undefined);
                      }} 
                      className="flex-1"
                    >
                      Reset Selection
                    </Button>
                  )}
                  <Button 
                    variant="secondary"
                    onClick={() => {
                      setTempPeriodStartDate(undefined);
                      setTempPeriodEndDate(undefined);
                      setIsEditingPeriod(false);
                    }} 
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => {
                      if (tempPeriodStartDate && tempPeriodEndDate) {
                        setPeriodStartDate(tempPeriodStartDate);
                        setPeriodEndDate(tempPeriodEndDate);
                        savePeriodTracking(tempPeriodStartDate, tempPeriodEndDate, cycleLength);
                        setTempPeriodStartDate(undefined);
                        setTempPeriodEndDate(undefined);
                        setIsEditingPeriod(false);
                      }
                    }} 
                    className="flex-1"
                    disabled={!tempPeriodStartDate || !tempPeriodEndDate}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          </div>
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
            const dateKey = format(date, 'yyyy-MM-dd');
            const hasSignals = daySignals[dateKey];

            return (
              <button
                key={date.toISOString()}
                onClick={() => {
                  setSelectedDate(date);
                  setCurrentEditDate(date);
                  setIsEditingSignals(true);
                }}
                className={`
                  relative aspect-square rounded text-xs transition-all w-10 h-10
                  ${inCurrentMonth ? 'opacity-100' : 'opacity-30'}
                  ${dayInfo.color}
                  ${today ? 'ring-1 ring-foreground' : ''}
                  ${isSelected ? 'ring-1 ring-primary' : ''}
                  ${hasSignals ? 'ring-2 ring-accent' : ''}
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
                
                {/* Signal indicators */}
                {hasSignals && (
                  <div className="absolute bottom-0.5 left-0 right-0 flex justify-center gap-0.5">
                    {hasSignals.symptoms.length > 0 && (
                      <div className="w-1 h-1 rounded-full bg-red-500" />
                    )}
                    {hasSignals.intercourse.length > 0 && (
                      <div className="w-1 h-1 rounded-full bg-pink-500" />
                    )}
                    {hasSignals.mood.length > 0 && (
                      <div className="w-1 h-1 rounded-full bg-yellow-500" />
                    )}
                  </div>
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
      
      {/* Signal Tracking Dialog */}
      {currentEditDate && (
        <Dialog open={isEditingSignals} onOpenChange={setIsEditingSignals}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Track Health Signals - {format(currentEditDate, 'MMM d, yyyy')}
              </DialogTitle>
              <DialogDescription>
                Log symptoms, mood, intercourse, and other health signals for this day
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="space-y-6 py-4">
                {/* Intercourse Tracking */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Heart className="h-4 w-4 text-pink-500" />
                    Intercourse
                  </h4>
                  <div className="space-y-2">
                    {getSignalForDate(currentEditDate).intercourse.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                        <Heart className="h-3 w-3 text-pink-500" />
                        <span className="text-sm flex-1">
                          {entry.protected ? '🛡️ Protected' : '⚠️ Unprotected'}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            const signal = getSignalForDate(currentEditDate);
                            updateSignalForDate(currentEditDate, {
                              intercourse: signal.intercourse.filter((_, i) => i !== idx)
                            });
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const signal = getSignalForDate(currentEditDate);
                          updateSignalForDate(currentEditDate, {
                            intercourse: [...signal.intercourse, { protected: true }]
                          });
                        }}
                        className="flex-1"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Protected
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const signal = getSignalForDate(currentEditDate);
                          updateSignalForDate(currentEditDate, {
                            intercourse: [...signal.intercourse, { protected: false }]
                          });
                        }}
                        className="flex-1"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Unprotected
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Symptoms */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    Symptoms
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {SYMPTOM_OPTIONS.map((symptom) => {
                      const signal = getSignalForDate(currentEditDate);
                      const isSelected = signal.symptoms.includes(symptom.value);
                      return (
                        <div key={symptom.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`symptom-${symptom.value}`}
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              updateSignalForDate(currentEditDate, {
                                symptoms: checked
                                  ? [...signal.symptoms, symptom.value]
                                  : signal.symptoms.filter(s => s !== symptom.value)
                              });
                            }}
                          />
                          <Label
                            htmlFor={`symptom-${symptom.value}`}
                            className="text-sm cursor-pointer"
                          >
                            {symptom.icon} {symptom.label}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mood */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-yellow-500" />
                    Mood
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {MOOD_OPTIONS.map((mood) => {
                      const signal = getSignalForDate(currentEditDate);
                      const isSelected = signal.mood.includes(mood.value);
                      return (
                        <div key={mood.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`mood-${mood.value}`}
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              updateSignalForDate(currentEditDate, {
                                mood: checked
                                  ? [...signal.mood, mood.value]
                                  : signal.mood.filter(m => m !== mood.value)
                              });
                            }}
                          />
                          <Label
                            htmlFor={`mood-${mood.value}`}
                            className="text-sm cursor-pointer"
                          >
                            {mood.icon} {mood.label}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Discharge */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Droplet className="h-4 w-4 text-blue-500" />
                    Cervical Discharge
                  </h4>
                  <Select
                    value={getSignalForDate(currentEditDate).discharge}
                    onValueChange={(value) => {
                      updateSignalForDate(currentEditDate, { discharge: value });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DISCHARGE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </ScrollArea>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsEditingSignals(false)}
                className="flex-1"
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  // Save signal is already handled by updateSignalForDate
                  setIsEditingSignals(false);
                }}
                className="flex-1"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default CycleCalendar;
