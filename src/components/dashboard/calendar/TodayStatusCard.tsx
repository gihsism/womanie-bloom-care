import { Droplet, Sparkles, Heart, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, differenceInDays, addDays } from 'date-fns';

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
  const daysToOvulation = ovulationDay >= cycleDay ? ovulationDay - cycleDay : (cycleLength - cycleDay) + ovulationDay;
  const daysToNextPeriod = cycleLength >= cycleDay ? (cycleLength + 1) - cycleDay : 1;
  const nextPeriodDate = addDays(lastPeriodStart, cycleLength);
  
  // Determine current phase
  const getPhaseInfo = () => {
    if (cycleDay <= periodLength) {
      return {
        phase: 'Period',
        description: `Day ${cycleDay} of your period`,
        icon: Droplet,
        gradient: 'from-primary to-primary/80',
        textColor: 'text-primary-foreground'
      };
    }
    if (cycleDay >= ovulationDay - 4 && cycleDay <= ovulationDay) {
      return {
        phase: 'Fertile Window',
        description: cycleDay === ovulationDay ? 'Ovulation day!' : `${ovulationDay - cycleDay} days to ovulation`,
        icon: Heart,
        gradient: 'from-accent to-secondary',
        textColor: 'text-accent-foreground'
      };
    }
    if (cycleDay === ovulationDay) {
      return {
        phase: 'Ovulation',
        description: 'Peak fertility today',
        icon: Sparkles,
        gradient: 'from-secondary to-accent',
        textColor: 'text-secondary-foreground'
      };
    }
    return {
      phase: 'Regular',
      description: `Period in ${daysToNextPeriod} days`,
      icon: Calendar,
      gradient: 'from-muted to-muted/80',
      textColor: 'text-foreground'
    };
  };

  const phaseInfo = getPhaseInfo();
  const PhaseIcon = phaseInfo.icon;

  // For non-menstrual modes, show simplified status
  if (['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode)) {
    return null;
  }

  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br",
      phaseInfo.gradient
    )}>
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-24 h-24 opacity-20">
        <PhaseIcon className="w-full h-full" />
      </div>
      
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 rounded-full bg-background/20">
            <PhaseIcon className={cn("h-5 w-5", phaseInfo.textColor)} />
          </div>
          <div>
            <h3 className={cn("text-lg font-bold", phaseInfo.textColor)}>
              {phaseInfo.phase}
            </h3>
            <p className={cn("text-sm opacity-90", phaseInfo.textColor)}>
              {phaseInfo.description}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 mt-3">
          <div className={cn("text-center", phaseInfo.textColor)}>
            <div className="text-2xl font-bold">{cycleDay}</div>
            <div className="text-xs opacity-80">Cycle Day</div>
          </div>
          <div className="w-px h-8 bg-current opacity-20" />
          <div className={cn("text-center", phaseInfo.textColor)}>
            <div className="text-2xl font-bold">{daysToNextPeriod}</div>
            <div className="text-xs opacity-80">Days to Period</div>
          </div>
          <div className="w-px h-8 bg-current opacity-20" />
          <div className={cn("flex-1 text-right", phaseInfo.textColor)}>
            <div className="text-sm font-medium">{format(nextPeriodDate, 'MMM d')}</div>
            <div className="text-xs opacity-80">Next Period</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TodayStatusCard;
