import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
import { format, addMonths, subMonths, addDays, differenceInDays, startOfDay, isSameDay, parseISO } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Import sub-components
import TodayStatusCard from './calendar/TodayStatusCard';
import CalendarGrid from './calendar/CalendarGrid';
import CalendarLegend from './calendar/CalendarLegend';
import DailyLogSheet from './calendar/DailyLogSheet';
import DayActionSheet from './calendar/DayActionSheet';

// Import ML prediction hook
import { useCyclePrediction, useSymptomPatterns, getCurrentCycleDay, type PeriodRecord, type DaySignal } from '@/hooks/useCyclePrediction';

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
  
  // Period tracking state - store all period records for ML calculations
  const [periodRecords, setPeriodRecords] = useState<PeriodRecord[]>([]);
  const [manualCycleLength, setManualCycleLength] = useState<number | null>(null);
  
  // Marked ovulation days (user-confirmed)
  const [markedOvulationDays, setMarkedOvulationDays] = useState<Set<string>>(new Set());
  
  // Health signals
  const [daySignals, setDaySignals] = useState<Record<string, DaySignal>>({});
  
  // Sheet/dialog states
  const [isDailyLogSheetOpen, setIsDailyLogSheetOpen] = useState(false);
  const [dailyLogTab, setDailyLogTab] = useState<'symptoms' | 'mood' | 'intimacy' | 'discharge'>('symptoms');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempCycleLength, setTempCycleLength] = useState(initialCycleLength);
  const [isDayActionOpen, setIsDayActionOpen] = useState(false);

  // Build onboarding estimates for the prediction hook
  const onboardingEstimates = useMemo(() => ({
    cycleLength: manualCycleLength || initialCycleLength,
    periodLength: initialPeriodLength,
    lastPeriodStart: initialPeriodStart ? format(initialPeriodStart, 'yyyy-MM-dd') : undefined,
  }), [manualCycleLength, initialCycleLength, initialPeriodLength, initialPeriodStart]);

  // ML Prediction - always returns a prediction (never null)
  const prediction = useCyclePrediction({
    periodRecords,
    daySignals,
    onboardingEstimates,
  });
  
  // Symptom patterns for insights
  const symptomPatterns = useSymptomPatterns(
    periodRecords,
    daySignals,
    prediction.averageCycleLength
  );

  // Use prediction values
  const cycleLength = prediction.averageCycleLength;
  const periodLength = prediction.averagePeriodLength;

  // Load data from database on mount
  useEffect(() => {
    loadCalendarData();
  }, []);
  
  const loadCalendarData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load ALL period tracking records for ML calculations
      const { data: periodData } = await supabase
        .from('period_tracking')
        .select('*')
        .eq('user_id', user.id)
        .order('period_start_date', { ascending: false });

      if (periodData && periodData.length > 0) {
        setPeriodRecords(periodData);
        setTempCycleLength(periodData[0]?.cycle_length || initialCycleLength);
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
  
  // Get period days as a Set for quick lookup
  const periodDays = useMemo(() => {
    const days = new Set<string>();
    periodRecords.forEach(record => {
      const start = parseISO(record.period_start_date);
      const end = parseISO(record.period_end_date);
      let current = start;
      while (current <= end) {
        days.add(format(current, 'yyyy-MM-dd'));
        current = addDays(current, 1);
      }
    });
    return days;
  }, [periodRecords]);
  
  // Check if a date is a period day
  const isPeriodDay = (date: Date): boolean => {
    return periodDays.has(format(date, 'yyyy-MM-dd'));
  };
  
  // Check if a date is marked as ovulation
  const isOvulationDay = (date: Date): boolean => {
    return markedOvulationDays.has(format(date, 'yyyy-MM-dd'));
  };
  
  // Toggle period day
  const handleTogglePeriodDay = async (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const isCurrentlyPeriod = periodDays.has(dateKey);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      if (isCurrentlyPeriod) {
        // Remove this day from period - find the record it belongs to and update/split
        const affectedRecord = periodRecords.find(record => {
          const start = parseISO(record.period_start_date);
          const end = parseISO(record.period_end_date);
          return date >= start && date <= end;
        });
        
        if (affectedRecord) {
          const start = parseISO(affectedRecord.period_start_date);
          const end = parseISO(affectedRecord.period_end_date);
          
          if (isSameDay(date, start) && isSameDay(date, end)) {
            // Only day in period - delete entire record
            await supabase
              .from('period_tracking')
              .delete()
              .eq('user_id', user.id)
              .eq('period_start_date', affectedRecord.period_start_date);
          } else if (isSameDay(date, start)) {
            // First day - move start forward
            await supabase
              .from('period_tracking')
              .update({ period_start_date: format(addDays(date, 1), 'yyyy-MM-dd') })
              .eq('user_id', user.id)
              .eq('period_start_date', affectedRecord.period_start_date);
          } else if (isSameDay(date, end)) {
            // Last day - move end backward
            await supabase
              .from('period_tracking')
              .update({ period_end_date: format(addDays(date, -1), 'yyyy-MM-dd') })
              .eq('user_id', user.id)
              .eq('period_start_date', affectedRecord.period_start_date);
          } else {
            // Middle day - need to split the record
            await supabase
              .from('period_tracking')
              .update({ period_end_date: format(addDays(date, -1), 'yyyy-MM-dd') })
              .eq('user_id', user.id)
              .eq('period_start_date', affectedRecord.period_start_date);
            
            await supabase
              .from('period_tracking')
              .insert({
                user_id: user.id,
                period_start_date: format(addDays(date, 1), 'yyyy-MM-dd'),
                period_end_date: affectedRecord.period_end_date,
                cycle_length: cycleLength
              });
          }
        }
        
        toast({ title: 'Period day removed' });
      } else {
        // Add this day as period - check if adjacent to existing period
        const dayBefore = format(addDays(date, -1), 'yyyy-MM-dd');
        const dayAfter = format(addDays(date, 1), 'yyyy-MM-dd');
        
        const adjacentBefore = periodRecords.find(r => r.period_end_date === dayBefore);
        const adjacentAfter = periodRecords.find(r => r.period_start_date === dayAfter);
        
        if (adjacentBefore && adjacentAfter) {
          // Merge two periods
          await supabase
            .from('period_tracking')
            .update({ period_end_date: adjacentAfter.period_end_date })
            .eq('user_id', user.id)
            .eq('period_start_date', adjacentBefore.period_start_date);
          
          await supabase
            .from('period_tracking')
            .delete()
            .eq('user_id', user.id)
            .eq('period_start_date', adjacentAfter.period_start_date);
        } else if (adjacentBefore) {
          // Extend previous period
          await supabase
            .from('period_tracking')
            .update({ period_end_date: dateKey })
            .eq('user_id', user.id)
            .eq('period_start_date', adjacentBefore.period_start_date);
        } else if (adjacentAfter) {
          // Extend next period backward
          await supabase
            .from('period_tracking')
            .update({ period_start_date: dateKey })
            .eq('user_id', user.id)
            .eq('period_start_date', adjacentAfter.period_start_date);
        } else {
          // Create new single-day period
          await supabase
            .from('period_tracking')
            .insert({
              user_id: user.id,
              period_start_date: dateKey,
              period_end_date: dateKey,
              cycle_length: cycleLength
            });
        }
        
        toast({ title: 'Period day marked' });
      }
      
      // Reload data to get updated records and recalculate predictions
      loadCalendarData();
      
    } catch (error) {
      console.error('Error updating period:', error);
      toast({
        title: 'Error',
        description: 'Failed to update period',
        variant: 'destructive',
      });
    }
  };
  
  // Toggle ovulation day
  const handleToggleOvulationDay = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    setMarkedOvulationDays(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
        toast({ title: 'Ovulation marker removed' });
      } else {
        // Only allow one ovulation per cycle - clear others
        next.clear();
        next.add(dateKey);
        toast({ title: 'Ovulation marked', description: format(date, 'MMMM d') });
      }
      return next;
    });
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
    saveHealthSignal(date, updatedSignal);
  };

  // Computed values - use most recent period for calculations
  const lastPeriodStart = periodRecords.length > 0 
    ? parseISO(periodRecords[0].period_start_date)
    : initialPeriodStart || new Date(2025, 9, 1);

  const currentCycleDay = getCurrentCycleDay(lastPeriodStart, cycleLength);

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setIsDayActionOpen(true);
  };

  const handleSaveCycleSettings = async () => {
    setManualCycleLength(tempCycleLength);
    
    // Update the most recent period record with new cycle length
    if (periodRecords.length > 0) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('period_tracking')
            .update({ cycle_length: tempCycleLength })
            .eq('user_id', user.id)
            .eq('period_start_date', periodRecords[0].period_start_date);
        }
      } catch (error) {
        console.error('Error updating cycle length:', error);
      }
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
      {/* Today's Status Card with ML Predictions */}
      {showCycleInfo && (
        <TodayStatusCard
          cycleDay={currentCycleDay}
          cycleLength={cycleLength}
          periodLength={periodLength}
          lastPeriodStart={lastPeriodStart}
          selectedMode={selectedMode}
          prediction={prediction}
          symptomPatterns={symptomPatterns}
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
                      {`Predicted cycle length: ${prediction.averageCycleLength} days (${prediction.isRegular ? 'regular' : 'irregular'})`}
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
                              {days} days {days === prediction.averageCycleLength && '(predicted)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {`${prediction.dataQualityMessage}. Confidence: ${prediction.confidenceLevel}`}
                      </p>
                    </div>
                    
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>• Standard deviation: ±{prediction.standardDeviation.toFixed(1)} days</p>
                      <p>• Cycle trend: {prediction.cycleTrend}</p>
                      <p>• Prediction window: ±{prediction.confidenceWindow} days</p>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button 
                        variant="outline"
                        onClick={() => {
                          setTempCycleLength(prediction.averageCycleLength);
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
          periodDays={periodDays}
          markedOvulationDays={markedOvulationDays}
          prediction={prediction}
          periodRecords={periodRecords}
        />

        {/* Legend */}
        <CalendarLegend selectedMode={selectedMode} />
      </Card>

      {/* Day Action Sheet - Period and quick log options */}
      <DayActionSheet
        open={isDayActionOpen}
        onOpenChange={setIsDayActionOpen}
        date={selectedDate}
        isPeriodDay={selectedDate ? isPeriodDay(selectedDate) : false}
        isOvulationDay={selectedDate ? isOvulationDay(selectedDate) : false}
        onTogglePeriod={() => selectedDate && handleTogglePeriodDay(selectedDate)}
        onMarkOvulation={() => selectedDate && handleToggleOvulationDay(selectedDate)}
        onLogSymptoms={() => {
          setIsDayActionOpen(false);
          setDailyLogTab('symptoms');
          setIsDailyLogSheetOpen(true);
        }}
        onLogMood={() => {
          setIsDayActionOpen(false);
          setDailyLogTab('mood');
          setIsDailyLogSheetOpen(true);
        }}
        onLogIntimacy={() => {
          setIsDayActionOpen(false);
          setDailyLogTab('intimacy');
          setIsDailyLogSheetOpen(true);
        }}
        onLogDischarge={() => {
          setIsDayActionOpen(false);
          setDailyLogTab('discharge');
          setIsDailyLogSheetOpen(true);
        }}
      />

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
