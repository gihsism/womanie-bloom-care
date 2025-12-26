import { Droplet, Sparkles, Heart, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays } from 'date-fns';

interface TodayStatusCardProps {
  cycleDay: number;
  cycleLength: number;
  periodLength: number;
  lastPeriodStart: Date;
  selectedMode: string;
  isPeriodActive: boolean;
  onPeriodStartToday: () => void;
  onPeriodEndToday: () => void;
  onMarkOvulation: () => void;
}

const TodayStatusCard = ({
  cycleDay,
  cycleLength,
  periodLength,
  lastPeriodStart,
  selectedMode,
  isPeriodActive,
  onPeriodStartToday,
  onPeriodEndToday,
  onMarkOvulation
}: TodayStatusCardProps) => {
  const ovulationDay = cycleLength - 13;
  const daysToNextPeriod = cycleLength >= cycleDay ? (cycleLength + 1) - cycleDay : 1;
  const nextPeriodDate = addDays(lastPeriodStart, cycleLength);
  
  const isInFertileWindow = cycleDay >= ovulationDay - 4 && cycleDay <= ovulationDay;

  // For non-menstrual modes, show simplified status
  if (['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode)) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Period ended prompt - show when period is active */}
      {isPeriodActive && (
        <button
          onClick={onPeriodEndToday}
          className="w-full py-2.5 px-4 text-primary text-sm font-medium bg-primary/10 rounded-xl hover:bg-primary/15 transition-colors"
        >
          Period ended? Tap here
        </button>
      )}

      {/* Main status card */}
      <div className="bg-gradient-to-br from-muted/50 to-muted rounded-2xl p-5">
        <div className="text-center mb-4">
          <div className="text-6xl font-light text-foreground mb-1">
            {daysToNextPeriod}
          </div>
          <div className="text-muted-foreground text-sm">
            days until next period
          </div>
        </div>

        {/* Pagination dots - decorative like the reference app */}
        <div className="flex justify-center gap-1.5 mb-4">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
        </div>
      </div>

      {/* My Cycle Quick Actions - like MyPeriodCalendar */}
      <div className="bg-card rounded-2xl border">
        <div className="px-4 py-3 border-b">
          <h3 className="font-semibold text-foreground">My Cycle</h3>
        </div>
        
        {/* Period starts today button */}
        <button
          onClick={onPeriodStartToday}
          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/50 transition-colors border-b"
        >
          <div className="text-left">
            <div className="font-medium text-foreground">Period starts today</div>
            <div className="text-sm text-muted-foreground">Tap here if period starts today!</div>
          </div>
          <div className={cn(
            "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
            isPeriodActive 
              ? "border-primary bg-primary" 
              : "border-muted-foreground/30"
          )}>
            {isPeriodActive && <Droplet className="h-3 w-3 text-primary-foreground" />}
          </div>
        </button>

        {/* Mark ovulation button */}
        <button
          onClick={onMarkOvulation}
          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/50 transition-colors border-b"
        >
          <div className="text-left">
            <div className="font-medium text-foreground">Ovulation</div>
            <div className="text-sm text-muted-foreground">Tap here to mark ovulation</div>
          </div>
          <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center">
          </div>
        </button>

        {/* Fertility window info */}
        <div className="px-4 py-3.5">
          <div className="flex items-start gap-2">
            <div className="w-1 h-12 bg-secondary/60 rounded-full mt-0.5" />
            <div>
              <div className="font-medium text-foreground flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-secondary" />
                Fertility window
              </div>
              <div className="text-sm text-muted-foreground mt-0.5">
                {isInFertileWindow ? 'Medium to high chance of pregnancy' : 'Low chance of pregnancy'}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {daysToNextPeriod} days until next period
              </div>
              <div className="text-sm text-muted-foreground">
                {cycleDay}{cycleDay === 1 ? 'st' : cycleDay === 2 ? 'nd' : cycleDay === 3 ? 'rd' : 'th'} day of cycle
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TodayStatusCard;