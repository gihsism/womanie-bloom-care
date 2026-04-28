import { Sparkles, TrendingUp, TrendingDown, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addDays, differenceInDays, format, parseISO, startOfDay } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { CyclePrediction, SymptomPattern, PeriodRecord } from '@/hooks/useCyclePrediction';
import { useNotificationPrefs } from '@/hooks/useNotificationPrefs';

interface TodayStatusCardProps {
  cycleDay: number;
  cycleLength: number;
  periodLength: number;
  lastPeriodStart: Date;
  selectedMode: string;
  prediction: CyclePrediction;
  symptomPatterns?: SymptomPattern[];
  periodRecords?: PeriodRecord[];
}

const TodayStatusCard = ({
  cycleDay,
  cycleLength,
  periodLength,
  lastPeriodStart,
  selectedMode,
  prediction,
  symptomPatterns = [],
  periodRecords = []
}: TodayStatusCardProps) => {
  const today = new Date();
  const notificationPrefs = useNotificationPrefs();

  const ovulationCycleDay = differenceInDays(prediction.predictedOvulationDate, lastPeriodStart) + 1;
  const rawDaysToNextPeriod = Math.ceil((prediction.predictedPeriodStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const daysToNextPeriod = Math.max(0, rawDaysToNextPeriod);
  // Negative ⇒ past predicted start ⇒ period is "late". We allow a
  // small grace window before declaring "late" because cycle-length
  // variance routinely shifts the predicted day by 1-2 days.
  const periodLateBy = rawDaysToNextPeriod < 0 ? Math.abs(rawDaysToNextPeriod) : 0;
  const isInFertileWindow = today >= prediction.fertileWindowStart && today <= prediction.fertileWindowEnd;

  // Whether the user is "on her period" right now should reflect the
  // most recent period record's actual end date — not just whether
  // today's cycle-day index is ≤ avgPeriodLength. If the period was
  // confirmed to end early (e.g. on day 3 of a 5-day average), this
  // card was still saying "day 5 of period" through day 5. Same gap
  // the calendar's bleeding-rendering cap closed: source-of-truth is
  // the period record, not the average.
  const todayStart = startOfDay(today);
  const ACTIVE_PERIOD_GRACE_DAYS = 2;
  const isOnPeriod = (() => {
    const sorted = [...periodRecords].sort(
      (a, b) => parseISO(b.period_start_date).getTime() - parseISO(a.period_start_date).getTime()
    );
    const latest = sorted[0];
    if (!latest) return false;
    const start = parseISO(latest.period_start_date);
    if (todayStart < startOfDay(start)) return false;
    if (latest.period_end_date) {
      const end = parseISO(latest.period_end_date);
      return todayStart <= startOfDay(end);
    }
    // Active (un-ended) — match the calendar's cap so the two stay
    // visually consistent.
    const renderEnd = addDays(start, periodLength - 1 + ACTIVE_PERIOD_GRACE_DAYS);
    return todayStart <= startOfDay(renderEnd);
  })();

  if (['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode)) {
    return null;
  }

  const getConfidenceBadgeVariant = () => {
    switch (prediction.confidenceLevel) {
      case 'high': return 'default' as const;
      case 'medium': return 'secondary' as const;
      case 'low': return 'outline' as const;
    }
  };

  const getTierBadgeColor = () => {
    switch (prediction.tier) {
      case 1: return 'bg-muted text-muted-foreground';
      case 2: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 3: return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
      case 4: return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    }
  };

  const getStatusText = () => {
    if (isOnPeriod) {
      return { main: cycleDay, sub: 'day of period' };
    }
    if (isInFertileWindow) {
      const daysToOvulation = differenceInDays(prediction.predictedOvulationDate, today);
      if (daysToOvulation === 0) {
        return { main: 'Ovulation', sub: 'High chance of pregnancy' };
      }
      return { main: Math.max(0, daysToOvulation), sub: 'days until ovulation' };
    }
    return { main: daysToNextPeriod, sub: 'days until next period' };
  };

  const getTrendIcon = () => {
    switch (prediction.cycleTrend) {
      case 'lengthening':
        return <TrendingUp className="h-3 w-3 text-amber-500" />;
      case 'shortening':
        return <TrendingDown className="h-3 w-3 text-blue-500" />;
      case 'irregular':
        return <AlertCircle className="h-3 w-3 text-orange-500" />;
      default:
        return null;
    }
  };

  const getTodaySymptomPredictions = () => {
    return symptomPatterns.filter(pattern =>
      pattern.typicalDays.includes(cycleDay) && pattern.frequency >= 70
    );
  };

  const status = getStatusText();
  const predictedSymptoms = getTodaySymptomPredictions();

  // Current cycle phase. Order matters: menstrual takes precedence
  // over the fallback follicular/luteal split because day 1-N can
  // overlap with the start of the follicular phase. Then ovulation
  // /fertile window, then luteal (past fertile window), else
  // follicular (post-period, pre-fertile).
  const cyclePhase: { label: string; description: string; tone: string } = (() => {
    if (isOnPeriod) {
      return {
        label: 'Menstrual phase',
        description: 'Your body is shedding the uterine lining. Lower energy and cramps are normal — rest is welcome.',
        tone: 'text-red-700 dark:text-red-300',
      };
    }
    const daysToOvulation = differenceInDays(prediction.predictedOvulationDate, today);
    if (isInFertileWindow) {
      if (Math.abs(daysToOvulation) <= 1) {
        return {
          label: 'Ovulation phase',
          description: 'Egg is being released. Highest fertility window of your cycle.',
          tone: 'text-secondary',
        };
      }
      return {
        label: 'Fertile window',
        description: 'Approaching ovulation. Higher chance of conception this week.',
        tone: 'text-secondary',
      };
    }
    if (daysToOvulation > 0) {
      return {
        label: 'Follicular phase',
        description: 'Estrogen is rising as your body prepares for ovulation. Often a higher-energy stretch.',
        tone: 'text-blue-600 dark:text-blue-400',
      };
    }
    // Past ovulation
    const daysToPeriod = daysToNextPeriod;
    if (daysToPeriod <= 5 && daysToPeriod > 0) {
      return {
        label: 'Late luteal · PMS likely',
        description: `${daysToPeriod} ${daysToPeriod === 1 ? 'day' : 'days'} until your next period. PMS symptoms (mood shifts, cramps, bloating) are most common in this window.`,
        tone: 'text-amber-700 dark:text-amber-300',
      };
    }
    return {
      label: 'Luteal phase',
      description: 'Progesterone has risen after ovulation. Body is preparing for either implantation or the next cycle.',
      tone: 'text-violet-600 dark:text-violet-400',
    };
  })();

  // Robust ordinal — the previous one only handled 1/2/3 and silently
  // wrote "21th" / "22th" / "23th".
  const ordinal = (n: number): string => {
    const tens = n % 100;
    if (tens >= 11 && tens <= 13) return `${n}th`;
    const ones = n % 10;
    return `${n}${ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'}`;
  };

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

          {/* Tier label badge */}
          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
            <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium", getTierBadgeColor())}>
              {prediction.tierLabel}
            </span>
          </div>

          {/* Confidence & trend */}
          <div className="flex items-center justify-center gap-2 mt-1.5">
            <Badge variant={getConfidenceBadgeVariant()} className="text-xs">
              {prediction.confidenceLevel} confidence
            </Badge>
            {getTrendIcon()}
          </div>
        </div>

        {/* Pagination dots */}
        <div className="flex justify-center gap-1.5 mb-4">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Next period prediction */}
        <div className="text-center text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Next period: </span>
          {prediction.isRegular
            ? format(prediction.predictedPeriodStart, 'MMM d')
            : `${format(addDays(prediction.predictedPeriodStart, -prediction.confidenceWindow), 'MMM d')}-${format(addDays(prediction.predictedPeriodStart, prediction.confidenceWindow), 'd')}`
          }
        </div>
      </div>

      {/* Period-late alert — surfaced before the phase card so the
          user sees it first when applicable. Only flagged once the
          cycle is past the prediction's confidence window so a
          slightly-variable cycle doesn't fire false alarms.
          Hidden when a period is currently active. */}
      {!isOnPeriod && periodLateBy > prediction.confidenceWindow && notificationPrefs.cycleReminders && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Your period is {periodLateBy} {periodLateBy === 1 ? 'day' : 'days'} later than expected
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1 leading-relaxed">
                Some variation between cycles is normal. If your period started, tap any day on the calendar to log it.
                {periodLateBy >= 7 && ' If it has been late by more than a week and pregnancy is possible, consider taking a test.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cycle phase card — clear, plain-language label of the
          phase the user is in right now plus a one-line
          explanation. Replaces the previous mental-math reader had
          to do from cycleDay alone. */}
      <div className="bg-card rounded-2xl border p-4">
        <div className="flex items-start gap-3">
          <div className={cn("w-1 h-12 rounded-full mt-0.5 bg-current opacity-60", cyclePhase.tone)} />
          <div className="flex-1 min-w-0">
            <div className={cn("font-semibold", cyclePhase.tone)}>{cyclePhase.label}</div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {cyclePhase.description}
            </p>
          </div>
        </div>
      </div>

      {/* Fertility info card */}
      <div className="bg-card rounded-2xl border p-4">
        <div className="flex items-start gap-2">
          <div className={cn(
            "w-1 h-12 rounded-full mt-0.5",
            isInFertileWindow ? "bg-secondary" : "bg-muted-foreground/30"
          )} />
          <div className="flex-1">
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
              {ordinal(cycleDay)} day of cycle
            </div>
          </div>
        </div>
      </div>

      {/* Cycle insights card */}
      {(prediction.cyclesLogged >= 3 || prediction.currentCycleAnomaly) && (
        <div className="bg-card rounded-2xl border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Cycle Insights</span>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            {prediction.isRegular !== undefined && prediction.cyclesLogged >= 3 && (
              <p>
                Your cycles are <span className="font-medium text-foreground">
                  {prediction.isRegular ? 'regular' : 'somewhat irregular'}
                </span> (±{prediction.standardDeviation.toFixed(0)} days)
              </p>
            )}

            {prediction.cycleTrend !== 'stable' && (
              <p className="flex items-center gap-1">
                {getTrendIcon()}
                Cycles are {prediction.cycleTrend === 'lengthening' ? 'getting longer' :
                  prediction.cycleTrend === 'shortening' ? 'getting shorter' : 'irregular'}
              </p>
            )}

            {prediction.currentCycleAnomaly && prediction.anomalyMessage && (
              <p className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {prediction.anomalyMessage}
              </p>
            )}

            <p className="text-xs">
              {prediction.dataQualityMessage}
            </p>
          </div>
        </div>
      )}

      {/* Predicted symptoms for today */}
      {predictedSymptoms.length > 0 && (
        <div className="bg-card rounded-2xl border p-4">
          <div className="text-sm font-medium mb-2">You may experience today:</div>
          <div className="flex flex-wrap gap-1.5">
            {predictedSymptoms.map(pattern => (
              <Badge key={pattern.symptom} variant="secondary" className="text-xs">
                {pattern.symptom}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TodayStatusCard;
