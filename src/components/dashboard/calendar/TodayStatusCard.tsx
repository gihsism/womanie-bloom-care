import { Sparkles, TrendingUp, TrendingDown, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addDays, differenceInDays, format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { CyclePrediction, SymptomPattern, getPredictionMessage } from '@/hooks/useCyclePrediction';

interface TodayStatusCardProps {
  cycleDay: number;
  cycleLength: number;
  periodLength: number;
  lastPeriodStart: Date;
  selectedMode: string;
  prediction?: CyclePrediction | null;
  symptomPatterns?: SymptomPattern[];
}

const TodayStatusCard = ({
  cycleDay,
  cycleLength,
  periodLength,
  lastPeriodStart,
  selectedMode,
  prediction,
  symptomPatterns = []
}: TodayStatusCardProps) => {
  const today = new Date();

  // Use prediction values if available, otherwise fall back to simple calculations
  const ovulationCycleDay = prediction
    ? differenceInDays(prediction.predictedOvulationDate, lastPeriodStart) + 1
    : cycleLength - 13;

  const daysToNextPeriod = prediction
    ? Math.max(0, Math.ceil((prediction.predictedPeriodStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
    : cycleLength >= cycleDay ? (cycleLength + 1) - cycleDay : 1;

  const isInFertileWindow = prediction
    ? today >= prediction.fertileWindowStart && today <= prediction.fertileWindowEnd
    : cycleDay >= ovulationCycleDay - 4 && cycleDay <= ovulationCycleDay;
    
  const isOnPeriod = cycleDay <= periodLength;

  // For non-menstrual modes, show simplified status
  if (['pregnancy', 'menopause', 'post-menopause'].includes(selectedMode)) {
    return null;
  }

  // Get confidence badge color
  const getConfidenceBadgeVariant = () => {
    if (!prediction) return 'secondary';
    switch (prediction.confidenceLevel) {
      case 'high': return 'default';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
    }
  };

  // Determine what to show based on cycle phase
  const getStatusText = () => {
    if (isOnPeriod) {
      return { main: cycleDay, sub: `day of period` };
    }
    if (isInFertileWindow) {
      if (prediction) {
        const daysToOvulation = differenceInDays(prediction.predictedOvulationDate, today);
        if (daysToOvulation === 0) {
          return { main: 'Ovulation', sub: 'High chance of pregnancy' };
        }
        return { main: Math.max(0, daysToOvulation), sub: 'days until ovulation' };
      }

      const daysToOvulation = ovulationCycleDay - cycleDay;
      if (daysToOvulation === 0) {
        return { main: 'Ovulation', sub: 'High chance of pregnancy' };
      }
      return { main: daysToOvulation, sub: 'days until ovulation' };
    }
    return { main: daysToNextPeriod, sub: 'days until next period' };
  };

  // Get trend icon
  const getTrendIcon = () => {
    if (!prediction) return null;
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

  // Get predicted symptoms for today
  const getTodaySymptomPredictions = () => {
    return symptomPatterns.filter(pattern => 
      pattern.typicalDays.includes(cycleDay) && pattern.frequency >= 70
    );
  };

  const status = getStatusText();
  const predictedSymptoms = getTodaySymptomPredictions();

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
          
          {/* Prediction confidence indicator */}
          {prediction && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <Badge variant={getConfidenceBadgeVariant()} className="text-xs">
                {prediction.confidenceLevel} confidence
              </Badge>
              {getTrendIcon()}
            </div>
          )}
        </div>

        {/* Pagination dots - decorative like the reference app */}
        <div className="flex justify-center gap-1.5 mb-4">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
        </div>
        
        {/* Next period prediction */}
        {prediction && (
          <div className="text-center text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Next period: </span>
            {prediction.isRegular 
              ? format(prediction.predictedPeriodStart, 'MMM d')
              : `${format(addDays(prediction.predictedPeriodStart, -prediction.confidenceWindow), 'MMM d')}-${format(addDays(prediction.predictedPeriodStart, prediction.confidenceWindow), 'd')}`
            }
          </div>
        )}
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
              {cycleDay}{cycleDay === 1 ? 'st' : cycleDay === 2 ? 'nd' : cycleDay === 3 ? 'rd' : 'th'} day of cycle
            </div>
          </div>
        </div>
      </div>

      {/* Cycle insights card - only show if we have predictions */}
      {prediction && (prediction.cyclesLogged >= 3 || prediction.currentCycleAnomaly) && (
        <div className="bg-card rounded-2xl border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Cycle Insights</span>
          </div>
          
          <div className="space-y-2 text-sm text-muted-foreground">
            {/* Cycle regularity */}
            <p>
              Your cycles are <span className="font-medium text-foreground">
                {prediction.isRegular ? 'regular' : 'somewhat irregular'}
              </span> (±{prediction.standardDeviation.toFixed(0)} days)
            </p>
            
            {/* Trend info */}
            {prediction.cycleTrend !== 'stable' && (
              <p className="flex items-center gap-1">
                {getTrendIcon()}
                Cycles are {prediction.cycleTrend === 'lengthening' ? 'getting longer' : 
                  prediction.cycleTrend === 'shortening' ? 'getting shorter' : 'irregular'}
              </p>
            )}
            
            {/* Anomaly warning */}
            {prediction.currentCycleAnomaly && prediction.anomalyMessage && (
              <p className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {prediction.anomalyMessage}
              </p>
            )}
            
            {/* Data quality */}
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
