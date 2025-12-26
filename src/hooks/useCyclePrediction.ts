import { useMemo } from 'react';
import { parseISO, differenceInDays, addDays, format, isSameDay } from 'date-fns';

// Types
export interface PeriodRecord {
  id?: string;
  period_start_date: string;
  period_end_date: string;
  cycle_length: number;
}

export interface DaySignal {
  date: string;
  symptoms: string[];
  intercourse: { protected: boolean; timestamp?: string }[];
  mood: string[];
  discharge: string;
  notes: string;
}

export interface CyclePrediction {
  // Next period prediction
  predictedPeriodStart: Date;
  predictedPeriodEnd: Date;
  confidenceWindow: number; // ± days
  
  // Cycle metrics
  averageCycleLength: number;
  averagePeriodLength: number;
  standardDeviation: number;
  isRegular: boolean; // std dev < 3 days
  
  // Ovulation & fertility
  predictedOvulationDate: Date;
  fertileWindowStart: Date;
  fertileWindowEnd: Date;
  
  // Confidence & data quality
  confidenceLevel: 'low' | 'medium' | 'high';
  cyclesLogged: number;
  dataQualityMessage: string;
  
  // Trend analysis
  cycleTrend: 'stable' | 'lengthening' | 'shortening' | 'irregular';
  
  // Anomaly detection
  currentCycleAnomaly: boolean;
  anomalyMessage?: string;
}

export interface SymptomPattern {
  symptom: string;
  typicalDays: number[]; // cycle days where this symptom typically occurs
  frequency: number; // percentage of cycles where it occurs
}

interface CyclePredictionInput {
  periodRecords: PeriodRecord[];
  daySignals: Record<string, DaySignal>;
  defaultCycleLength?: number;
  defaultPeriodLength?: number;
}

// Statistical helper functions
const calculateMean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

const calculateStandardDeviation = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = calculateMean(values);
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(calculateMean(squaredDiffs));
};

const calculateWeightedAverage = (values: number[], weights?: number[]): number => {
  if (values.length === 0) return 0;
  
  // Default weights: 50% for last 3, 30% for 4-6, 20% for older
  const defaultWeights = values.map((_, i) => {
    if (i < 3) return 0.5 / Math.min(3, values.length);
    if (i < 6) return 0.3 / Math.min(3, values.length - 3);
    return 0.2 / (values.length - 6);
  });
  
  const w = weights || defaultWeights;
  const normalizedWeights = w.map(weight => weight / w.reduce((a, b) => a + b, 0));
  
  return values.reduce((sum, val, i) => sum + val * normalizedWeights[i], 0);
};

// Main prediction hook
export function useCyclePrediction({
  periodRecords,
  daySignals,
  defaultCycleLength = 28,
  defaultPeriodLength = 5
}: CyclePredictionInput): CyclePrediction | null {
  return useMemo(() => {
    // Sort records by date (most recent first)
    const sortedRecords = [...periodRecords].sort((a, b) => 
      new Date(b.period_start_date).getTime() - new Date(a.period_start_date).getTime()
    );
    
    // Need minimum 2 cycles for predictions
    if (sortedRecords.length < 1) {
      return null;
    }
    
    const cyclesLogged = sortedRecords.length;
    
    // Calculate cycle lengths from consecutive periods
    const cycleLengths: number[] = [];
    for (let i = 0; i < sortedRecords.length - 1; i++) {
      const currentStart = parseISO(sortedRecords[i].period_start_date);
      const previousStart = parseISO(sortedRecords[i + 1].period_start_date);
      const diff = differenceInDays(currentStart, previousStart);
      // Only include reasonable cycle lengths (21-45 days)
      if (diff >= 21 && diff <= 45) {
        cycleLengths.push(diff);
      }
    }
    
    // Calculate period lengths
    const periodLengths: number[] = sortedRecords.map(record => {
      const start = parseISO(record.period_start_date);
      const end = parseISO(record.period_end_date);
      return differenceInDays(end, start) + 1;
    }).filter(len => len > 0 && len <= 10);
    
    // Calculate statistics
    const averageCycleLength = cycleLengths.length > 0 
      ? Math.round(calculateWeightedAverage(cycleLengths))
      : defaultCycleLength;
      
    const averagePeriodLength = periodLengths.length > 0
      ? Math.round(calculateMean(periodLengths))
      : defaultPeriodLength;
      
    const standardDeviation = cycleLengths.length >= 2
      ? calculateStandardDeviation(cycleLengths)
      : 0;
    
    const isRegular = standardDeviation < 3;
    
    // Confidence window based on regularity
    const confidenceWindow = isRegular 
      ? 1 
      : Math.min(Math.ceil(standardDeviation), 7);
    
    // Confidence level based on data quality
    let confidenceLevel: 'low' | 'medium' | 'high' = 'low';
    let dataQualityMessage = '';
    
    if (cyclesLogged >= 6) {
      confidenceLevel = 'high';
      dataQualityMessage = `Based on ${cyclesLogged} logged cycles`;
    } else if (cyclesLogged >= 3) {
      confidenceLevel = 'medium';
      dataQualityMessage = `Based on ${cyclesLogged} cycles. Log more for better accuracy.`;
    } else if (cyclesLogged >= 2) {
      confidenceLevel = 'low';
      dataQualityMessage = `Limited data (${cyclesLogged} cycles). Predictions will improve.`;
    } else {
      confidenceLevel = 'low';
      dataQualityMessage = 'Log 2+ cycles for predictions';
    }
    
    // Last period for predictions
    const lastPeriodStart = parseISO(sortedRecords[0].period_start_date);
    const lastPeriodEnd = parseISO(sortedRecords[0].period_end_date);
    
    // Predict next period
    const predictedPeriodStart = addDays(lastPeriodStart, averageCycleLength);
    const predictedPeriodEnd = addDays(predictedPeriodStart, averagePeriodLength - 1);
    
    // Ovulation prediction (luteal phase is typically 14 days)
    // Using standard deviation to adjust if irregular
    const lutealPhase = 14;
    const ovulationDay = averageCycleLength - lutealPhase;
    const predictedOvulationDate = addDays(lastPeriodStart, ovulationDay);
    
    // Fertile window: 5 days before ovulation to 1 day after
    const fertileWindowStart = addDays(predictedOvulationDate, -5);
    const fertileWindowEnd = addDays(predictedOvulationDate, 1);
    
    // Trend analysis
    let cycleTrend: 'stable' | 'lengthening' | 'shortening' | 'irregular' = 'stable';
    if (cycleLengths.length >= 3) {
      if (standardDeviation > 7) {
        cycleTrend = 'irregular';
      } else {
        // Check last 3 cycles for trend
        const recentCycles = cycleLengths.slice(0, 3);
        const olderCycles = cycleLengths.slice(3, 6);
        
        if (olderCycles.length > 0) {
          const recentAvg = calculateMean(recentCycles);
          const olderAvg = calculateMean(olderCycles);
          const diff = recentAvg - olderAvg;
          
          if (diff > 2) cycleTrend = 'lengthening';
          else if (diff < -2) cycleTrend = 'shortening';
        }
      }
    }
    
    // Anomaly detection for current cycle
    const today = new Date();
    const daysSinceLastPeriod = differenceInDays(today, lastPeriodEnd);
    const expectedCycleEnd = averageCycleLength + (2 * standardDeviation);
    
    let currentCycleAnomaly = false;
    let anomalyMessage: string | undefined;
    
    if (daysSinceLastPeriod > expectedCycleEnd && daysSinceLastPeriod > 45) {
      currentCycleAnomaly = true;
      anomalyMessage = `Your period is ${Math.round(daysSinceLastPeriod - averageCycleLength)} days late. If concerned, consider consulting a healthcare provider.`;
    } else if (cycleLengths.length >= 3 && cycleLengths[0] < averageCycleLength - (2 * standardDeviation)) {
      currentCycleAnomaly = true;
      anomalyMessage = 'Your last cycle was shorter than usual.';
    }
    
    return {
      predictedPeriodStart,
      predictedPeriodEnd,
      confidenceWindow,
      averageCycleLength,
      averagePeriodLength,
      standardDeviation,
      isRegular,
      predictedOvulationDate,
      fertileWindowStart,
      fertileWindowEnd,
      confidenceLevel,
      cyclesLogged,
      dataQualityMessage,
      cycleTrend,
      currentCycleAnomaly,
      anomalyMessage
    };
  }, [periodRecords, daySignals, defaultCycleLength, defaultPeriodLength]);
}

// Symptom pattern recognition
export function useSymptomPatterns(
  periodRecords: PeriodRecord[],
  daySignals: Record<string, DaySignal>,
  cycleLength: number
): SymptomPattern[] {
  return useMemo(() => {
    if (periodRecords.length < 3) return [];
    
    const symptomOccurrences: Record<string, Record<number, number>> = {};
    const cycleCount = Math.min(periodRecords.length, 6);
    
    // Analyze each cycle
    periodRecords.slice(0, cycleCount).forEach((record, cycleIndex) => {
      const cycleStart = parseISO(record.period_start_date);
      
      // Go through each day of the cycle
      for (let day = 0; day < cycleLength; day++) {
        const date = addDays(cycleStart, day);
        const dateKey = format(date, 'yyyy-MM-dd');
        const signal = daySignals[dateKey];
        
        if (signal?.symptoms) {
          signal.symptoms.forEach(symptom => {
            if (!symptomOccurrences[symptom]) {
              symptomOccurrences[symptom] = {};
            }
            if (!symptomOccurrences[symptom][day + 1]) {
              symptomOccurrences[symptom][day + 1] = 0;
            }
            symptomOccurrences[symptom][day + 1]++;
          });
        }
      }
    });
    
    // Calculate patterns (70%+ frequency threshold)
    const patterns: SymptomPattern[] = [];
    const threshold = cycleCount * 0.7;
    
    Object.entries(symptomOccurrences).forEach(([symptom, dayOccurrences]) => {
      const typicalDays: number[] = [];
      let totalOccurrences = 0;
      
      Object.entries(dayOccurrences).forEach(([day, count]) => {
        if (count >= threshold) {
          typicalDays.push(parseInt(day));
        }
        totalOccurrences += count;
      });
      
      if (typicalDays.length > 0) {
        patterns.push({
          symptom,
          typicalDays: typicalDays.sort((a, b) => a - b),
          frequency: (totalOccurrences / cycleCount) * 100
        });
      }
    });
    
    return patterns.sort((a, b) => b.frequency - a.frequency);
  }, [periodRecords, daySignals, cycleLength]);
}

// Get current cycle day
export function getCurrentCycleDay(lastPeriodStart: Date, cycleLength: number): number {
  const today = new Date();
  const diffDays = differenceInDays(today, lastPeriodStart);
  const day = (diffDays % cycleLength) + 1;
  return day > 0 ? day : day + cycleLength;
}

// Check if a date falls within fertile window
export function isInFertileWindow(
  date: Date,
  fertileWindowStart: Date,
  fertileWindowEnd: Date
): boolean {
  const dateTime = date.getTime();
  return dateTime >= fertileWindowStart.getTime() && dateTime <= fertileWindowEnd.getTime();
}

// Check if it's ovulation day
export function isOvulationDay(date: Date, predictedOvulationDate: Date): boolean {
  return isSameDay(date, predictedOvulationDate);
}

// Get prediction message for display
export function getPredictionMessage(prediction: CyclePrediction): string {
  const { confidenceWindow, isRegular } = prediction;
  
  if (isRegular) {
    return `Expected ${format(prediction.predictedPeriodStart, 'MMM d')}`;
  }
  
  const rangeStart = addDays(prediction.predictedPeriodStart, -confidenceWindow);
  const rangeEnd = addDays(prediction.predictedPeriodStart, confidenceWindow);
  return `Expected ${format(rangeStart, 'MMM d')}-${format(rangeEnd, 'd')}`;
}
