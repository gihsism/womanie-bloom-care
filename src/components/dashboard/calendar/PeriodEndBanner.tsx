import { format, differenceInDays, addDays, parseISO, isSameDay } from 'date-fns';
import { Droplet, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PeriodRecord, isActivePeriod, getEffectiveEndDate } from '@/hooks/useCyclePrediction';

interface PeriodEndBannerProps {
  periodRecords: PeriodRecord[];
  avgPeriodLength: number;
  onEndPeriod: (endDate: string) => void;
  onStillGoing: () => void;
}

const PeriodEndBanner = ({ periodRecords, avgPeriodLength, onEndPeriod, onStillGoing }: PeriodEndBannerProps) => {
  // Find active (unconfirmed) period
  const activePeriod = periodRecords.find(isActivePeriod);
  if (!activePeriod) return null;

  const startDate = parseISO(activePeriod.period_start_date);
  const today = new Date();
  const daysSinceStart = differenceInDays(today, startDate);
  const predictedEndDay = avgPeriodLength; // e.g. day 5

  // Show banner from predicted_end - 1 through predicted_end + 3
  const showFrom = predictedEndDay - 1;
  const showUntil = predictedEndDay + 3;

  if (daysSinceStart < showFrom || daysSinceStart > showUntil + 5) {
    // Outside prompt window entirely
    // But if period is way longer than predicted + 5, show a different message
    if (daysSinceStart > predictedEndDay + 5) {
      return (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Your period seems longer than usual ({daysSinceStart} days)
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Tap below to let us know when it ended
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-amber-300 dark:border-amber-700"
                  onClick={() => onEndPeriod(format(today, 'yyyy-MM-dd'))}
                >
                  It ended today
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-amber-300 dark:border-amber-700"
                  onClick={() => onEndPeriod(format(addDays(today, -1), 'yyyy-MM-dd'))}
                >
                  Ended yesterday
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  // Normal prompt window
  const todayStr = format(today, 'yyyy-MM-dd');
  const yesterdayStr = format(addDays(today, -1), 'yyyy-MM-dd');

  return (
    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Droplet className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            Still on your period?
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Let us know so we can improve your predictions
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button
              size="sm"
              variant="default"
              className="text-xs"
              onClick={onStillGoing}
            >
              Yes, still going
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => onEndPeriod(todayStr)}
            >
              No, ended today
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => onEndPeriod(yesterdayStr)}
            >
              Ended yesterday
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PeriodEndBanner;
