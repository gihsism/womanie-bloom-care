import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
import { format, addMonths, subMonths, addDays, differenceInDays, startOfDay, isSameDay, parseISO } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import TodayStatusCard from './calendar/TodayStatusCard';
import CalendarGrid from './calendar/CalendarGrid';
import CalendarLegend from './calendar/CalendarLegend';
import DailyLogSheet from './calendar/DailyLogSheet';
import DayActionSheet from './calendar/DayActionSheet';
import PeriodEndBanner from './calendar/PeriodEndBanner';

import { useCyclePrediction, useSymptomPatterns, getCurrentCycleDay, isActivePeriod, getEffectiveEndDate, type PeriodRecord, type DaySignal } from '@/hooks/useCyclePrediction';

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
}: CycleCalendarProps) => {
  const { toast } = useToast();
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [periodRecords, setPeriodRecords] = useState<PeriodRecord[]>([]);
  const [manualCycleLength, setManualCycleLength] = useState<number | null>(null);
  const [manualPeriodLength, setManualPeriodLength] = useState<number | null>(null);
  const [markedOvulationDays, setMarkedOvulationDays] = useState<Set<string>>(new Set());
  const [daySignals, setDaySignals] = useState<Record<string, DaySignal>>({});
  
  const [isDailyLogSheetOpen, setIsDailyLogSheetOpen] = useState(false);
  const [dailyLogTab, setDailyLogTab] = useState<'symptoms' | 'mood' | 'intimacy' | 'discharge'>('symptoms');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempCycleLength, setTempCycleLength] = useState(initialCycleLength);
  const [tempPeriodLength, setTempPeriodLength] = useState(initialPeriodLength);
  const [isDayActionOpen, setIsDayActionOpen] = useState(false);

  const onboardingEstimates = useMemo(() => ({
    cycleLength: manualCycleLength || initialCycleLength,
    periodLength: manualPeriodLength || initialPeriodLength,
    lastPeriodStart: initialPeriodStart ? format(initialPeriodStart, 'yyyy-MM-dd') : undefined,
  }), [manualCycleLength, manualPeriodLength, initialCycleLength, initialPeriodLength, initialPeriodStart]);

  const prediction = useCyclePrediction({
    periodRecords,
    daySignals,
    onboardingEstimates,
  });
  
  const symptomPatterns = useSymptomPatterns(
    periodRecords,
    daySignals,
    prediction.averageCycleLength
  );

  const cycleLength = prediction.averageCycleLength;
  const periodLength = prediction.averagePeriodLength;

  useEffect(() => {
    loadCalendarData();
  }, []);
  
  const loadCalendarData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: periodData } = await supabase
        .from('period_tracking')
        .select('*')
        .eq('user_id', user.id)
        .order('period_start_date', { ascending: false });

      if (periodData && periodData.length > 0) {
        setPeriodRecords(periodData);
        setTempCycleLength(periodData[0]?.cycle_length || initialCycleLength);
      }

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
      toast({ title: 'Error', description: 'Failed to load calendar data', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Determine which record is the "active" (ongoing) period:
  // - end_date is null, OR
  // - end_date === start_date AND start is within avgPeriodLength+2 days of today (legacy single-day record)
  const getEffectiveEnd = (record: PeriodRecord): string | null => {
    if (record.period_end_date === null) return null;
    // Legacy: if end === start and it's recent, treat as active
    if (
      record.period_end_date === record.period_start_date &&
      differenceInDays(new Date(), parseISO(record.period_start_date)) <= periodLength + 2
    ) {
      return null; // treat as active/unconfirmed
    }
    return record.period_end_date;
  };

  // Confirmed period days: from start to confirmed end_date (solid)
  const confirmedPeriodDays = useMemo(() => {
    const days = new Set<string>();
    periodRecords.forEach(record => {
      const effectiveEnd = getEffectiveEnd(record);
      if (effectiveEnd === null) return; // skip active periods
      const start = parseISO(record.period_start_date);
      const end = parseISO(effectiveEnd);
      let current = start;
      while (current <= end) {
        days.add(format(current, 'yyyy-MM-dd'));
        current = addDays(current, 1);
      }
    });
    return days;
  }, [periodRecords, periodLength]);

  // Active (unconfirmed) period days: start is confirmed, end is predicted
  const { activePeriodConfirmedDays, activePeriodPredictedDays } = useMemo(() => {
    const confirmed = new Set<string>();
    const predicted = new Set<string>();
    
    const activeRecord = periodRecords.find(r => getEffectiveEnd(r) === null);
    if (!activeRecord) return { activePeriodConfirmedDays: confirmed, activePeriodPredictedDays: predicted };

    const start = parseISO(activeRecord.period_start_date);
    const today = startOfDay(new Date());
    const predictedEnd = addDays(start, periodLength - 1);

    // Days from start up to min(today, predictedEnd) → solid
    let d = start;
    while (d <= today && d <= predictedEnd) {
      confirmed.add(format(d, 'yyyy-MM-dd'));
      d = addDays(d, 1);
    }
    // If today is before predicted end, remaining days → dashed
    if (today < predictedEnd) {
      d = addDays(today, 1);
      while (d <= predictedEnd) {
        predicted.add(format(d, 'yyyy-MM-dd'));
        d = addDays(d, 1);
      }
    }
    // If today is past predicted end but no confirmation yet, extend solid
    if (today > predictedEnd) {
      d = addDays(predictedEnd, 1);
      while (d <= today) {
        confirmed.add(format(d, 'yyyy-MM-dd'));
        d = addDays(d, 1);
      }
    }

    return { activePeriodConfirmedDays: confirmed, activePeriodPredictedDays: predicted };
  }, [periodRecords, periodLength]);

  // Merge all confirmed period days
  const allConfirmedPeriodDays = useMemo(() => {
    const merged = new Set(confirmedPeriodDays);
    activePeriodConfirmedDays.forEach(d => merged.add(d));
    return merged;
  }, [confirmedPeriodDays, activePeriodConfirmedDays]);

  const hasActivePeriod = periodRecords.some(r => getEffectiveEnd(r) === null);
  
  const isPeriodDay = (date: Date): boolean => {
    return allConfirmedPeriodDays.has(format(date, 'yyyy-MM-dd'));
  };
  
  const isOvulationMarked = (date: Date): boolean => {
    return markedOvulationDays.has(format(date, 'yyyy-MM-dd'));
  };

  // ─── Period Start (new flow) ───
  const handleStartPeriod = async (date: Date) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const dateKey = format(date, 'yyyy-MM-dd');

      // Insert with null end_date (active period)
      await supabase.from('period_tracking').insert({
        user_id: user.id,
        period_start_date: dateKey,
        period_end_date: null,
        cycle_length: cycleLength,
      });

      toast({
        title: 'Period started',
        description: `Predicted to last ~${periodLength} days. We'll check in with you.`,
      });

      loadCalendarData();
    } catch (error) {
      console.error('Error starting period:', error);
      toast({ title: 'Error', description: 'Failed to log period start', variant: 'destructive' });
    }
  };

  // ─── Period End Confirmation ───
  const handleEndPeriod = async (endDate: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const activeRecord = periodRecords.find(isActivePeriod);
      if (!activeRecord) return;

      await supabase
        .from('period_tracking')
        .update({ period_end_date: endDate })
        .eq('user_id', user.id)
        .eq('period_start_date', activeRecord.period_start_date);

      const duration = differenceInDays(parseISO(endDate), parseISO(activeRecord.period_start_date)) + 1;
      toast({
        title: 'Period ended',
        description: `Logged ${duration} day period. Predictions updated.`,
      });

      loadCalendarData();
    } catch (error) {
      console.error('Error ending period:', error);
      toast({ title: 'Error', description: 'Failed to update period end', variant: 'destructive' });
    }
  };

  const handleStillGoing = () => {
    toast({ title: 'Got it!', description: "We'll check again tomorrow." });
  };

  // ─── Remove a period record ───
  const handleRemovePeriod = async (date: Date) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const record = periodRecords.find(r => {
        const start = parseISO(r.period_start_date);
        const end = r.period_end_date ? parseISO(r.period_end_date) : addDays(start, periodLength);
        return date >= start && date <= end;
      });

      if (record) {
        await supabase
          .from('period_tracking')
          .delete()
          .eq('user_id', user.id)
          .eq('period_start_date', record.period_start_date);
        
        toast({ title: 'Period removed' });
        loadCalendarData();
      }
    } catch (error) {
      console.error('Error removing period:', error);
      toast({ title: 'Error', description: 'Failed to remove period', variant: 'destructive' });
    }
  };
  
  const handleToggleOvulationDay = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    setMarkedOvulationDays(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
        toast({ title: 'Ovulation marker removed' });
      } else {
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
        }, { onConflict: 'user_id,signal_date' });
      if (error) throw error;
    } catch (error) {
      console.error('Error saving health signal:', error);
      toast({ title: 'Error', description: 'Failed to save health signal', variant: 'destructive' });
    }
  };

  const getSignalForDate = (date: Date): DaySignal => {
    const dateKey = format(date, 'yyyy-MM-dd');
    return daySignals[dateKey] || { date: dateKey, symptoms: [], intercourse: [], mood: [], discharge: 'none', notes: '' };
  };
  
  const updateSignalForDate = (date: Date, updates: Partial<DaySignal>) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    const updatedSignal = { ...getSignalForDate(date), ...updates };
    setDaySignals(prev => ({ ...prev, [dateKey]: updatedSignal }));
    saveHealthSignal(date, updatedSignal);
  };

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
    setManualPeriodLength(tempPeriodLength);
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
    toast({ title: 'Settings saved', description: `Cycle: ${tempCycleLength} days, Period: ${tempPeriodLength} days` });
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
      {/* Period End Confirmation Banner */}
      {showCycleInfo && (
        <PeriodEndBanner
          periodRecords={periodRecords}
          avgPeriodLength={periodLength}
          onEndPeriod={handleEndPeriod}
          onStillGoing={handleStillGoing}
        />
      )}

      {/* Today's Status Card */}
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
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <h4 className="text-lg font-semibold">
            {format(currentMonth, 'MMMM yyyy')}
          </h4>
          
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
            
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
                      <Select value={tempCycleLength.toString()} onValueChange={(v) => setTempCycleLength(parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Average Period Length</label>
                      <Select value={tempPeriodLength.toString()} onValueChange={(v) => setTempPeriodLength(parseInt(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 10 }, (_, i) => i + 2).map((days) => (
                            <SelectItem key={days} value={days.toString()}>
                              {days} days {days === prediction.averagePeriodLength && '(predicted)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        How many days your period typically lasts
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>• Standard deviation: ±{prediction.standardDeviation.toFixed(1)} days</p>
                      <p>• Cycle trend: {prediction.cycleTrend}</p>
                      <p>• Prediction window: ±{prediction.confidenceWindow} days</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => { setTempCycleLength(prediction.averageCycleLength); setTempPeriodLength(prediction.averagePeriodLength); setIsSettingsOpen(false); }} className="flex-1">Cancel</Button>
                      <Button onClick={handleSaveCycleSettings} className="flex-1">Save</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <CalendarGrid
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          onSelectDate={handleDateSelect}
          lastPeriodStart={lastPeriodStart}
          cycleLength={cycleLength}
          periodLength={periodLength}
          selectedMode={selectedMode}
          daySignals={daySignals}
          periodDays={allConfirmedPeriodDays}
          predictedPeriodDays={activePeriodPredictedDays}
          markedOvulationDays={markedOvulationDays}
          prediction={prediction}
          periodRecords={periodRecords}
        />

        <CalendarLegend selectedMode={selectedMode} />
      </Card>

      {/* Day Action Sheet */}
      <DayActionSheet
        open={isDayActionOpen}
        onOpenChange={setIsDayActionOpen}
        date={selectedDate}
        isPeriodDay={selectedDate ? isPeriodDay(selectedDate) : false}
        isOvulationDay={selectedDate ? isOvulationMarked(selectedDate) : false}
        hasActivePeriod={hasActivePeriod}
        onStartPeriod={() => selectedDate && handleStartPeriod(selectedDate)}
        onRemovePeriodDay={() => selectedDate && handleRemovePeriod(selectedDate)}
        onMarkOvulation={() => selectedDate && handleToggleOvulationDay(selectedDate)}
        onLogSymptoms={() => { setIsDayActionOpen(false); setDailyLogTab('symptoms'); setIsDailyLogSheetOpen(true); }}
        onLogMood={() => { setIsDayActionOpen(false); setDailyLogTab('mood'); setIsDailyLogSheetOpen(true); }}
        onLogIntimacy={() => { setIsDayActionOpen(false); setDailyLogTab('intimacy'); setIsDailyLogSheetOpen(true); }}
        onLogDischarge={() => { setIsDayActionOpen(false); setDailyLogTab('discharge'); setIsDailyLogSheetOpen(true); }}
      />

      {/* Daily Log Sheet */}
      <DailyLogSheet
        open={isDailyLogSheetOpen}
        onOpenChange={setIsDailyLogSheetOpen}
        date={selectedDate}
        signal={selectedDate ? getSignalForDate(selectedDate) : { date: '', symptoms: [], intercourse: [], mood: [], discharge: 'none', notes: '' }}
        onUpdateSignal={(updates) => { if (selectedDate) updateSignalForDate(selectedDate, updates); }}
        activeTab={dailyLogTab}
      />
    </div>
  );
};

export default CycleCalendar;
