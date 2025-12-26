import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addDays } from 'date-fns';

interface TodayStatusCardProps {
  cycleDay: number;
  cycleLength: number;
  periodLength: number;
  lastPeriodStart: Date;
  selectedMode: string;
}

const TodayStatusCard = ({
  cycleDay,
  cycleLength,
  periodLength,
  lastPeriodStart,
  selectedMode
}: TodayStatusCardProps) => {
  const ovulationDay = cycleLength - 13;
  const daysToNextPeriod = cycleLength >= cycleDay ? (cycleLength + 1) - cycleDay : 1;
  const nextPeriodDate = addDays(lastPeriodStart, cycleLength);
  
  const isInFertileWindow = cycleDay >= ovulationDay - 4 && cycleDay <= ovulationDay;
  const isOnPeriod = cycleDay <= periodLength;

  // For non-menstrual modes, show simplified status
  if (['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode)) {
    return null;
  }

  // Determine what to show based on cycle phase
  const getStatusText = () => {
    if (isOnPeriod) {
      return { main: cycleDay, sub: `day of period` };
    }
    if (isInFertileWindow) {
      const daysToOvulation = ovulationDay - cycleDay;
      if (daysToOvulation === 0) {
        return { main: 'Ovulation', sub: 'High chance of pregnancy' };
      }
      return { main: daysToOvulation, sub: 'days until ovulation' };
    }
    return { main: daysToNextPeriod, sub: 'days until next period' };
  };

  const status = getStatusText();

  return (
    <div className="space-y-3">
      {/* Main status card */}
      <div className="bg-gradient-to-br from-muted/50 to-muted rounded-2xl p-5">
        <div className="text-center mb-4">
          <div className="text-6xl font-light text-foreground mb-1">
            {status.main}
          </div>
          <div className="text-muted-foreground text-sm">
            {status.sub}
          </div>
        </div>

        {/* Pagination dots - decorative like the reference app */}
        <div className="flex justify-center gap-1.5 mb-4">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
        </div>
      </div>

      {/* Fertility info card */}
      <div className="bg-card rounded-2xl border p-4">
        <div className="flex items-start gap-2">
          <div className={cn(
            "w-1 h-12 rounded-full mt-0.5",
            isInFertileWindow ? "bg-secondary" : "bg-muted-foreground/30"
          )} />
          <div>
            <div className="font-medium text-foreground flex items-center gap-1.5">
              <Sparkles className={cn(
                "h-4 w-4",
                isInFertileWindow ? "text-secondary" : "text-muted-foreground"
              )} />
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
  );
};

export default TodayStatusCard;