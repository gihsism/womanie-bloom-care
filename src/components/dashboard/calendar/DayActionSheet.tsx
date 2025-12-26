import { format, isSameDay, startOfDay } from 'date-fns';
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
  onTogglePeriod: () => void;
  onMarkOvulation: () => void;
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
  onTogglePeriod,
  onMarkOvulation,
  onLogSymptoms,
  onLogMood,
  onLogIntimacy,
  onLogDischarge
}: DayActionSheetProps) => {
  if (!date) return null;

  const isToday = isSameDay(date, startOfDay(new Date()));
  const isPastDate = date < startOfDay(new Date());
  const isFutureDate = date > startOfDay(new Date());

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
            
            {/* Period toggle */}
            <button
              onClick={() => {
                onTogglePeriod();
                onOpenChange(false);
              }}
              disabled={isFutureDate}
              className={cn(
                "w-full flex items-center justify-between p-4 rounded-xl border transition-colors",
                isPeriodDay 
                  ? "bg-primary/10 border-primary" 
                  : "bg-card border-border hover:bg-muted/50",
                isFutureDate && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  isPeriodDay ? "bg-primary" : "bg-muted"
                )}>
                  <Droplet className={cn(
                    "h-5 w-5",
                    isPeriodDay ? "text-primary-foreground fill-current" : "text-muted-foreground"
                  )} />
                </div>
                <div className="text-left">
                  <div className="font-medium">
                    {isPeriodDay ? 'Period day' : 'Mark as period day'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {isPeriodDay ? 'Tap to remove' : 'Tap to mark this day'}
                  </div>
                </div>
              </div>
              {isPeriodDay && (
                <Check className="h-5 w-5 text-primary" />
              )}
            </button>

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
              {isOvulationDay && (
                <Check className="h-5 w-5 text-secondary" />
              )}
            </button>
          </div>

          {/* Quick Log Actions */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground px-1">Log for this day</h4>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => {
                  onLogSymptoms();
                }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <span className="text-xs text-muted-foreground">Symptoms</span>
              </button>
              
              <button
                onClick={() => {
                  onLogMood();
                }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                  <Smile className="h-5 w-5 text-yellow-600" />
                </div>
                <span className="text-xs text-muted-foreground">Mood</span>
              </button>
              
              <button
                onClick={() => {
                  onLogIntimacy();
                }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-pink-500/10 flex items-center justify-center">
                  <Heart className="h-5 w-5 text-pink-500" />
                </div>
                <span className="text-xs text-muted-foreground">Intimacy</span>
              </button>
              
              <button
                onClick={() => {
                  onLogDischarge();
                }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-muted/50 transition-colors"
              >
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