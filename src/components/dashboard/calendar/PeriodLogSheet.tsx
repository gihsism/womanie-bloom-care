import { useState } from 'react';
import { format, differenceInDays, addDays } from 'date-fns';
import { Droplet, Calendar, Sparkles, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface PeriodLogSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cycleLength: number;
  onSave: (startDate: Date, endDate: Date) => void;
}

const PeriodLogSheet = ({
  open,
  onOpenChange,
  currentPeriodStart,
  currentPeriodEnd,
  cycleLength,
  onSave
}: PeriodLogSheetProps) => {
  const [step, setStep] = useState<'start' | 'end' | 'confirm'>('start');
  const [tempStartDate, setTempStartDate] = useState<Date | undefined>(currentPeriodStart);
  const [tempEndDate, setTempEndDate] = useState<Date | undefined>(currentPeriodEnd);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset state when closing
      setStep('start');
      setTempStartDate(currentPeriodStart);
      setTempEndDate(currentPeriodEnd);
    }
    onOpenChange(newOpen);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    
    if (step === 'start') {
      setTempStartDate(date);
      setTempEndDate(undefined);
      setStep('end');
    } else if (step === 'end') {
      setTempEndDate(date);
      setStep('confirm');
    }
  };

  const handleSave = () => {
    if (tempStartDate && tempEndDate) {
      onSave(tempStartDate, tempEndDate);
      handleOpenChange(false);
    }
  };

  const handleReset = () => {
    setStep('start');
    setTempStartDate(undefined);
    setTempEndDate(undefined);
  };

  const periodDuration = tempStartDate && tempEndDate 
    ? differenceInDays(tempEndDate, tempStartDate) + 1 
    : 0;

  const predictedOvulation = tempStartDate 
    ? addDays(tempStartDate, cycleLength - 14) 
    : null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Droplet className="h-5 w-5 text-primary" />
            <span>Log Your Period</span>
          </SheetTitle>
          <SheetDescription>
            {step === 'start' && 'When did your period start?'}
            {step === 'end' && 'When did your period end?'}
            {step === 'confirm' && 'Review your period dates'}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {/* Progress indicator */}
          <div className="flex items-center gap-2">
            {['start', 'end', 'confirm'].map((s, i) => (
              <div
                key={s}
                className={cn(
                  "flex-1 h-1.5 rounded-full transition-all",
                  step === s || (step === 'end' && i === 0) || (step === 'confirm' && i <= 1)
                    ? "bg-primary"
                    : "bg-muted"
                )}
              />
            ))}
          </div>

          {/* Date summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className={cn(
                "p-3 rounded-xl border-2 transition-all",
                step === 'start' ? "border-primary bg-primary/5" : tempStartDate ? "border-muted bg-muted/50" : "border-dashed border-muted"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Started</span>
              </div>
              <p className="font-semibold">
                {tempStartDate ? format(tempStartDate, 'MMM d, yyyy') : 'Select date'}
              </p>
            </div>
            
            <div
              className={cn(
                "p-3 rounded-xl border-2 transition-all",
                step === 'end' ? "border-primary bg-primary/5" : tempEndDate ? "border-muted bg-muted/50" : "border-dashed border-muted"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Ended</span>
              </div>
              <p className="font-semibold">
                {tempEndDate ? format(tempEndDate, 'MMM d, yyyy') : 'Select date'}
              </p>
            </div>
          </div>

          {/* Calendar */}
          {(step === 'start' || step === 'end') && (
            <div className="flex justify-center py-2">
              <CalendarComponent
                mode="single"
                selected={step === 'start' ? tempStartDate : tempEndDate}
                onSelect={handleDateSelect}
                disabled={(date) => 
                  date > new Date() || 
                  (step === 'end' && tempStartDate && date < tempStartDate)
                }
                className="rounded-xl border p-3 pointer-events-auto"
                classNames={{
                  day_selected: "bg-primary text-primary-foreground hover:bg-primary",
                  day_today: "bg-accent text-accent-foreground",
                }}
              />
            </div>
          )}

          {/* Confirmation view */}
          {step === 'confirm' && tempStartDate && tempEndDate && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-primary/10 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Duration</span>
                  <span className="font-bold text-lg">{periodDuration} days</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Period</span>
                  <span className="font-medium">
                    {format(tempStartDate, 'MMM d')} - {format(tempEndDate, 'MMM d')}
                  </span>
                </div>
              </div>

              {predictedOvulation && (
                <div className="p-4 bg-secondary/10 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-secondary" />
                    <span className="font-medium text-sm">Predicted Fertile Window</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Ovulation expected around{' '}
                    <span className="font-semibold text-secondary">
                      {format(predictedOvulation, 'MMM d')}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Fertile days: {format(addDays(predictedOvulation, -5), 'MMM d')} - {format(predictedOvulation, 'MMM d')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t flex gap-3">
          {step !== 'start' && (
            <Button
              variant="outline"
              onClick={handleReset}
              className="flex-1 h-12 rounded-xl"
            >
              <X className="h-4 w-4 mr-2" />
              Reset
            </Button>
          )}
          {step === 'confirm' ? (
            <Button
              onClick={handleSave}
              className="flex-1 h-12 rounded-xl"
              disabled={!tempStartDate || !tempEndDate}
            >
              <Check className="h-4 w-4 mr-2" />
              Save Period
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              className="flex-1 h-12 rounded-xl"
            >
              Cancel
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default PeriodLogSheet;
