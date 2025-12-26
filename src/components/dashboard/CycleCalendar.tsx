import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Settings2, X } from 'lucide-react';
import { format, addMonths, subMonths, addDays, differenceInDays, startOfDay, isSameDay } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// Import sub-components
import TodayStatusCard from './calendar/TodayStatusCard';
import QuickLogButtons from './calendar/QuickLogButtons';
import CalendarGrid from './calendar/CalendarGrid';
import CalendarLegend from './calendar/CalendarLegend';
import DailyLogSheet from './calendar/DailyLogSheet';

// Health signal types
interface DaySignal {
  date: string;
  symptoms: string[];
  intercourse: { protected: boolean; timestamp?: string }[];
  mood: string[];
  discharge: string;
  notes: string;
}

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
  
  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Period tracking state
  const [periodStartDate, setPeriodStartDate] = useState<Date | undefined>(initialPeriodStart || new Date(2025, 9, 1));
  const [periodEndDate, setPeriodEndDate] = useState<Date | undefined>(
    initialPeriodStart ? addDays(initialPeriodStart, initialPeriodLength - 1) : addDays(new Date(2025, 9, 1), 4)
  );
  const [cycleLength, setCycleLength] = useState(initialCycleLength);
  
  // Current period tracking (for "period starts today" flow)
  const [isCurrentlyOnPeriod, setIsCurrentlyOnPeriod] = useState(false);
  const [currentPeriodStartDate, setCurrentPeriodStartDate] = useState<Date | null>(null);
  
  // Health signals
  const [daySignals, setDaySignals] = useState<Record<string, DaySignal>>({});
  
  // Sheet/dialog states
  const [isDailyLogSheetOpen, setIsDailyLogSheetOpen] = useState(false);
  const [dailyLogTab, setDailyLogTab] = useState<'symptoms' | 'mood' | 'intimacy' | 'discharge'>('symptoms');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempCycleLength, setTempCycleLength] = useState(initialCycleLength);
  const [isDayDetailOpen, setIsDayDetailOpen] = useState(false);

  // Load data from database on mount
  useEffect(() => {
    loadCalendarData();
  }, []);
  
  // Check if currently on period based on dates
  useEffect(() => {
    const today = startOfDay(new Date());
    if (periodStartDate && periodEndDate) {
      const isActive = today >= startOfDay(periodStartDate) && today <= startOfDay(periodEndDate);
      setIsCurrentlyOnPeriod(isActive);
      if (isActive) {
        setCurrentPeriodStartDate(periodStartDate);
      }
    }
  }, [periodStartDate, periodEndDate]);
  
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
  const updateSignalForDate = (date: Date, updates: Partial<DaySignal>) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const updatedSignal = {
      ...getSignalForDate(date),
      ...updates,
    };
    setDaySignals(prev => ({
      ...prev,
      [dateKey]: updatedSignal
    }));
    // Save immediately to database
    saveHealthSignal(date, updatedSignal);
  };

  // Computed values
  const lastPeriodStart = periodStartDate || new Date(2025, 9, 1);
  const periodLength = periodEndDate && periodStartDate 
    ? differenceInDays(periodEndDate, periodStartDate) + 1 
    : initialPeriodLength;

  const getCycleDay = (date: Date) => {
    const diffTime = date.getTime() - lastPeriodStart.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return (diffDays % cycleLength) + 1;
  };

  const currentCycleDay = getCycleDay(new Date());

  // Period logging handlers - simple one-tap approach like MyPeriodCalendar
  const handlePeriodStartToday = () => {
    const today = startOfDay(new Date());
    
    if (isCurrentlyOnPeriod) {
      // If already on period, this is a toggle off - end the period
      handlePeriodEndToday();
    } else {
      // Start a new period today
      setIsCurrentlyOnPeriod(true);
      setCurrentPeriodStartDate(today);
      // Set default end date 5 days from now (will be updated when user ends it)
      const defaultEndDate = addDays(today, 4);
      setPeriodStartDate(today);
      setPeriodEndDate(defaultEndDate);
      savePeriodTracking(today, defaultEndDate, cycleLength);
      toast({
        title: 'Period started',
        description: 'Tap "Period ended?" when your period ends',
      });
    }
  };

  const handlePeriodEndToday = () => {
    const today = startOfDay(new Date());
    
    if (currentPeriodStartDate) {
      setIsCurrentlyOnPeriod(false);
      setPeriodEndDate(today);
      savePeriodTracking(currentPeriodStartDate, today, cycleLength);
      toast({
        title: 'Period ended',
        description: `Period logged: ${differenceInDays(today, currentPeriodStartDate) + 1} days`,
      });
    }
  };

  const handleMarkOvulation = () => {
    // For now, just show a toast - could be extended to mark ovulation in the database
    toast({
      title: 'Ovulation marked',
      description: `Ovulation marked for ${format(new Date(), 'MMM d')}`,
    });
  };
  
  const openDailyLogWithTab = (tab: 'symptoms' | 'mood' | 'intimacy' | 'discharge') => {
    setSelectedDate(new Date());
    setDailyLogTab(tab);
    setIsDailyLogSheetOpen(true);
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setIsDayDetailOpen(true);
  };

  const handleSaveCycleSettings = () => {
    setCycleLength(tempCycleLength);
    if (periodStartDate && periodEndDate) {
      savePeriodTracking(periodStartDate, periodEndDate, tempCycleLength);
    }
    setIsSettingsOpen(false);
  };

  const showCycleInfo = !['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode);

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-20 bg-muted rounded-xl" />
          <div className="h-8 bg-muted rounded-full w-2/3" />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="aspect-square bg-muted rounded-full" />
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Today's Status Card with one-tap period logging */}
      {showCycleInfo && (
        <TodayStatusCard
          cycleDay={currentCycleDay}
          cycleLength={cycleLength}
          periodLength={periodLength}
          lastPeriodStart={lastPeriodStart}
          selectedMode={selectedMode}
          isPeriodActive={isCurrentlyOnPeriod}
          onPeriodStartToday={handlePeriodStartToday}
          onPeriodEndToday={handlePeriodEndToday}
          onMarkOvulation={handleMarkOvulation}
        />
      )}

      {/* Calendar Card */}
      <Card className="p-4">
        {/* Calendar Header */}
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <h4 className="text-lg font-semibold">
            {format(currentMonth, 'MMMM yyyy')}
          </h4>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            
            {/* Settings button */}
            {showCycleInfo && (
              <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Cycle Settings</DialogTitle>
                    <DialogDescription>
                      Adjust your average cycle length for better predictions
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
                        Normal cycles: 21-35 days. Most common: 28 days.
                      </p>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button 
                        variant="outline"
                        onClick={() => {
                          setTempCycleLength(cycleLength);
                          setIsSettingsOpen(false);
                        }} 
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleSaveCycleSettings} 
                        className="flex-1"
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Calendar Grid */}
        <CalendarGrid
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          onSelectDate={handleDateSelect}
          lastPeriodStart={lastPeriodStart}
          cycleLength={cycleLength}
          periodLength={periodLength}
          selectedMode={selectedMode}
          daySignals={daySignals}
          ovulationPrediction={ovulationPrediction}
        />

        {/* Legend */}
        <CalendarLegend selectedMode={selectedMode} />
      </Card>

      {/* Quick Log Buttons */}
      {showCycleInfo && (
        <Card className="p-4">
          <QuickLogButtons
            onLogSymptoms={() => openDailyLogWithTab('symptoms')}
            onLogMood={() => openDailyLogWithTab('mood')}
            onLogIntimacy={() => openDailyLogWithTab('intimacy')}
            onLogDischarge={() => openDailyLogWithTab('discharge')}
          />
        </Card>
      )}

      {/* Day Detail Sheet */}
      <Sheet open={isDayDetailOpen} onOpenChange={setIsDayDetailOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle>
                {selectedDate ? format(selectedDate, 'MMMM d') : 'Select Date'}
              </SheetTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsDayDetailOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>
          
          {selectedDate && (
            <QuickLogButtons
              onLogSymptoms={() => {
                setIsDayDetailOpen(false);
                setDailyLogTab('symptoms');
                setIsDailyLogSheetOpen(true);
              }}
              onLogMood={() => {
                setIsDayDetailOpen(false);
                setDailyLogTab('mood');
                setIsDailyLogSheetOpen(true);
              }}
              onLogIntimacy={() => {
                setIsDayDetailOpen(false);
                setDailyLogTab('intimacy');
                setIsDailyLogSheetOpen(true);
              }}
              onLogDischarge={() => {
                setIsDayDetailOpen(false);
                setDailyLogTab('discharge');
                setIsDailyLogSheetOpen(true);
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Daily Log Sheet */}
      <DailyLogSheet
        open={isDailyLogSheetOpen}
        onOpenChange={setIsDailyLogSheetOpen}
        date={selectedDate}
        signal={selectedDate ? getSignalForDate(selectedDate) : {
          date: '',
          symptoms: [],
          intercourse: [],
          mood: [],
          discharge: 'none',
          notes: ''
        }}
        onUpdateSignal={(updates) => {
          if (selectedDate) {
            updateSignalForDate(selectedDate, updates);
          }
        }}
        activeTab={dailyLogTab}
      />
    </div>
  );
};

export default CycleCalendar;
