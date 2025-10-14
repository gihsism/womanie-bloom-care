import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, TrendingUp, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, isValid } from 'date-fns';

interface OvulationPredictionProps {
  userId: string;
  lastPeriodStart?: Date;
  cycleLength?: number;
  onPredictionUpdate?: (prediction: Prediction | null) => void;
}

interface Prediction {
  predictedOvulationDate?: string;
  fertileWindowStart?: string;
  fertileWindowEnd?: string;
  confidence: 'low' | 'medium' | 'high';
  keyIndicators: string[];
  analysis: string;
  recommendations: string[];
}

const OvulationPrediction = ({ userId, lastPeriodStart, cycleLength = 28, onPredictionUpdate }: OvulationPredictionProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<Prediction | null>(null);

  const getConfidenceBadge = (confidence: string) => {
    const variants: Record<string, { className: string; label: string }> = {
      high: { className: 'bg-accent text-accent-foreground', label: 'High Confidence' },
      medium: { className: 'bg-secondary text-secondary-foreground', label: 'Medium Confidence' },
      low: { className: 'bg-muted text-muted-foreground', label: 'Low Confidence' }
    };
    const config = variants[confidence] || variants.low;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return 'Not available';
    try {
      const date = parseISO(dateStr);
      if (!isValid(date)) return 'Invalid date';
      return format(date, 'MMMM d, yyyy');
    } catch {
      return 'Invalid date';
    }
  };

  const getPrediction = async () => {
    setLoading(true);
    try {
      // Fetch recent health signals (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      console.log('Fetching health data for user:', userId);
      const { data: healthData, error: healthError } = await supabase
        .from('daily_health_signals')
        .select('*')
        .eq('user_id', userId)
        .gte('signal_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('signal_date', { ascending: false });

      if (healthError) {
        console.error('Health data fetch error:', healthError);
        throw healthError;
      }

      console.log('Health data fetched:', healthData?.length, 'records');

      if (!healthData || healthData.length === 0) {
        toast({
          title: 'Insufficient Data',
          description: 'Please log your daily health signals for at least a few days to get predictions.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      console.log('Calling predict-ovulation function...');
      // Call the edge function for prediction
      const { data, error } = await supabase.functions.invoke('predict-ovulation', {
        body: {
          healthData,
          cycleData: {
            cycleLength,
            lastPeriodStart: lastPeriodStart?.toISOString() || new Date().toISOString(),
          },
        },
      });

      console.log('Function response:', data);
      console.log('Function error:', error);

      if (error) {
        console.error('Function invocation error:', error);
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.prediction) {
        console.log('Prediction received:', data.prediction);
        setPrediction(data.prediction);
        onPredictionUpdate?.(data.prediction);
        toast({
          title: 'Prediction Generated',
          description: 'Your ovulation prediction is ready!',
        });
      } else {
        throw new Error('No prediction data returned');
      }
    } catch (error) {
      console.error('Prediction error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate prediction. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Ovulation Prediction
            </CardTitle>
            <CardDescription>
              AI-powered prediction based on your health signals
            </CardDescription>
          </div>
          <Button 
            onClick={getPrediction} 
            disabled={loading}
            className="gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Analyzing...' : 'Get Prediction'}
          </Button>
        </div>
      </CardHeader>

      {prediction && (
        <CardContent className="space-y-4">
          {/* Confidence Badge */}
          <div className="flex items-center gap-2">
            {getConfidenceBadge(prediction.confidence)}
          </div>

          {/* Predicted Dates */}
          {prediction.predictedOvulationDate && (
            <div className="bg-primary/10 rounded-lg p-4">
              <div className="text-sm font-medium text-muted-foreground mb-1">
                Predicted Ovulation Date
              </div>
              <div className="text-xl font-bold text-primary">
                {formatDate(prediction.predictedOvulationDate)}
              </div>
            </div>
          )}

          {prediction.fertileWindowStart && prediction.fertileWindowEnd && (
            <div className="bg-accent/10 rounded-lg p-4">
              <div className="text-sm font-medium text-muted-foreground mb-1">
                Fertile Window
              </div>
              <div className="text-sm font-semibold">
                {formatDate(prediction.fertileWindowStart)} - {formatDate(prediction.fertileWindowEnd)}
              </div>
            </div>
          )}

          {/* Key Indicators */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-secondary" />
              <h4 className="font-semibold text-sm">Key Indicators Detected</h4>
            </div>
            <ul className="space-y-1">
              {prediction.keyIndicators.map((indicator, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-accent">•</span>
                  <span>{indicator}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Analysis */}
          <div>
            <h4 className="font-semibold text-sm mb-2">Analysis</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-line">
              {prediction.analysis}
            </p>
          </div>

          {/* Recommendations */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-sm">Recommendations</h4>
            </div>
            <ul className="space-y-1">
              {prediction.recommendations.map((rec, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary">✓</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Disclaimer */}
          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
            <strong>Note:</strong> This prediction is based on AI analysis of your health data and cycle patterns. 
            It should be used as a guide only and not as a substitute for medical advice or contraception. 
            Individual cycles can vary, and predictions may not always be accurate.
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default OvulationPrediction;
