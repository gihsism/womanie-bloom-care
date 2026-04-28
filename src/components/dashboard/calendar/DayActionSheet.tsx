import { format, isSameDay, startOfDay, parseISO, addDays } from 'date-fns';
import { Droplet, Sparkles, Heart, Smile, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface DayActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  isPeriodDay: boolean;
  isOvulationDay: boolean;
  hasActivePeriod: boolean;
  activePeriodStartDate?: string | null;
  onStartPeriod: () => void;
  onRemovePeriodDay: () => void;
  onMarkOvulation: () => void;
  onEndPeriod?: (endDate: string) => void;
  onLogSymptoms: () => void;
  onLogMood: () => void;
  onLogIntimacy: () => void;
  onLogDischarge: () => void;
}

const DayActionSheet = ({
  open,
  onOpenChange,
  date,
  isPeriodDay,
  isOvulationDay,
  hasActivePeriod,
  activePeriodStartDate,
  onStartPeriod,
  onRemovePeriodDay,
  onMarkOvulation,
  onEndPeriod,
  onLogSymptoms,
  onLogMood,
  onLogIntimacy,
  onLogDischarge
}: DayActionSheetProps) => {
  if (!date) return null;

  const todayStart = startOfDay(new Date());
  const isToday = isSameDay(date, todayStart);
  const isFutureDate = date > todayStart;
  const dateStart = startOfDay(date);

  // True when the tapped day falls on/after the active period start and not in the future,
  // so it's a valid candidate for "ended on this day".
  const canEndOnThisDay =
    hasActivePeriod &&
    !!activePeriodStartDate &&
    !!onEndPeriod &&
    !isFutureDate &&
    dateStart >= startOfDay(parseISO(activePeriodStartDate));

  const yesterdayStart = startOfDay(addDays(todayStart, -1));
  const isYesterday = isSameDay(dateStart, yesterdayStart);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-3xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-center">
            {format(date, 'EEEE, MMMM d')}
            {isToday && <span className="text-primary ml-2">(Today)</span>}
          </SheetTitle>
        </SheetHeader>
        
        <div className="space-y-4 pb-6">
          {/* Period & Ovulation Actions */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground px-1">Cycle Tracking</h4>
            
            {/* Period start button — only if not already a period day and no active period */}
            {!isPeriodDay && !hasActivePeriod && (
              <button
                onClick={() => {
                  onStartPeriod();
                  onOpenChange(false);
                }}
                disabled={isFutureDate}
                className={cn(
                  "w-full flex items-center justify-between p-4 rounded-xl border transition-colors",
                  "bg-card border-border hover:bg-muted/50",
                  isFutureDate && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Droplet className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">My period started</div>
                    <div className="text-sm text-muted-foreground">
                      {isToday ? 'Mark today as period start' : `Mark ${format(date, 'MMM d')} as start`}
                    </div>
                  </div>
                </div>
              </button>
            )}

            {/* If it's a period day, allow removal */}
            {isPeriodDay && (
              <button
                onClick={() => {
                  onRemovePeriodDay();
                  onOpenChange(false);
                }}
                className="w-full flex items-center justify-between p-4 rounded-xl border transition-colors bg-primary/10 border-primary"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                    <Droplet className="h-5 w-5 text-primary-foreground fill-current" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">Period day</div>
                    <div className="text-sm text-muted-foreground">Tap to remove this period</div>
                  </div>
                </div>
              </button>
            )}

            {/* Active period — inline end confirmation */}
            {hasActivePeriod && !isPeriodDay && (
              <div className="w-full p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Droplet className="h-5 w-5 text-primary animate-pulse" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-medium text-sm">Period is active</div>
                    <div className="text-xs text-muted-foreground">
                      {canEndOnThisDay
                        ? 'Confirm when it actually ended'
                        : 'Tap a day on or after your period start to mark when it ended'}
                    </div>
                  </div>
                </div>

                {canEndOnThisDay && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="text-xs gap-1.5"
                      onClick={() => {
                        onEndPeriod!(format(date, 'yyyy-MM-dd'));
                        onOpenChange(false);
                      }}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {isToday
                        ? 'Ended today'
                        : isYesterday
                        ? 'Ended yesterday'
                        : `Ended ${format(date, 'MMM d')}`}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Ovulation toggle */}
            <button
              onClick={() => {
                onMarkOvulation();
                onOpenChange(false);
              }}
              disabled={isFutureDate}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-xl border transition-colors",
                isOvulationDay 
                  ? "bg-secondary/10 border-secondary" 
                  : "bg-card border-border hover:bg-muted/50",
                isFutureDate && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  isOvulationDay ? "bg-secondary" : "bg-muted"
                )}>
                  <Sparkles className={cn(
                    "h-5 w-5",
                    isOvulationDay ? "text-secondary-foreground" : "text-muted-foreground"
                  )} />
                </div>
                <div className="text-left">
                  <div className="font-medium">
                    {isOvulationDay ? 'Ovulation marked' : 'Mark ovulation'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {isOvulationDay ? 'Tap to remove' : 'Confirmed ovulation day'}
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* Quick Log Actions */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground px-1">Log for this day</h4>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={onLogSymptoms} className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <span className="text-xs text-muted-foreground">Symptoms</span>
              </button>
              <button onClick={onLogMood} className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                  <Smile className="h-5 w-5 text-yellow-600" />
                </div>
                <span className="text-xs text-muted-foreground">Mood</span>
              </button>
              <button onClick={onLogIntimacy} className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-pink-500/10 flex items-center justify-center">
                  <Heart className="h-5 w-5 text-pink-500" />
                </div>
                <span className="text-xs text-muted-foreground">Intimacy</span>
              </button>
              <button onClick={onLogDischarge} className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-muted/50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                  <Droplet className="h-5 w-5 text-secondary" />
                </div>
                <span className="text-xs text-muted-foreground">Discharge</span>
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DayActionSheet;
