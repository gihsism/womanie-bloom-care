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

export type PredictionTier = 1 | 2 | 3 | 4;

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

  // PMS window
  pmsWindowStart: Date;

  // Confidence & data quality
  confidenceLevel: 'low' | 'medium' | 'high';
  cyclesLogged: number;
  dataQualityMessage: string;

  // Tier system
  tier: PredictionTier;
  tierLabel: string;

  // Trend analysis
  cycleTrend: 'stable' | 'lengthening' | 'shortening' | 'irregular';

  // Anomaly detection
  currentCycleAnomaly: boolean;
  anomalyMessage?: string;
  excludedCycles: number;
}

export interface SymptomPattern {
  symptom: string;
  typicalDays: number[]; // cycle days where this symptom typically occurs
  frequency: number; // percentage of cycles where it occurs
}

export interface OnboardingEstimates {
  cycleLength?: number;
  periodLength?: number;
  lastPeriodStart?: string; // ISO date
}

interface CyclePredictionInput {
  periodRecords: PeriodRecord[];
  daySignals: Record<string, DaySignal>;
  onboardingEstimates?: OnboardingEstimates;
}

// Population baseline constants
const POPULATION_CYCLE_LENGTH = 28.5;
const POPULATION_PERIOD_LENGTH = 5;
const LUTEAL_PHASE = 14;
const MIN_VALID_CYCLE = 18;
const MAX_VALID_CYCLE = 60;

// Statistical helpers
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

const calculateWeightedAverage = (values: number[]): number => {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  // Most recent = highest weight
  const totalWeight = values.reduce((sum, _, i) => sum + (values.length - i), 0);
  return values.reduce((sum, val, i) => sum + val * ((values.length - i) / totalWeight), 0);
};

// Main prediction hook — always returns a prediction (never null)
export function useCyclePrediction({
  periodRecords,
  daySignals,
  onboardingEstimates,
}: CyclePredictionInput): CyclePrediction {
  return useMemo(() => {
    // Sort records most recent first
    const sortedRecords = [...periodRecords].sort(
      (a, b) => new Date(b.period_start_date).getTime() - new Date(a.period_start_date).getTime()
    );

    const cyclesLogged = sortedRecords.length;

    // Calculate cycle lengths from consecutive periods
    const rawCycleLengths: number[] = [];
    for (let i = 0; i < sortedRecords.length - 1; i++) {
      const currentStart = parseISO(sortedRecords[i].period_start_date);
      const previousStart = parseISO(sortedRecords[i + 1].period_start_date);
      rawCycleLengths.push(differenceInDays(currentStart, previousStart));
    }

    // Filter valid cycles (18-60 days)
    const validCycleLengths = rawCycleLengths.filter(
      len => len >= MIN_VALID_CYCLE && len <= MAX_VALID_CYCLE
    );
    const excludedCycles = rawCycleLengths.length - validCycleLengths.length;

    // Calculate period lengths
    const periodLengths = sortedRecords
      .map(r => differenceInDays(parseISO(r.period_end_date), parseISO(r.period_start_date)) + 1)
      .filter(len => len > 0 && len <= 14);

    // ─── Determine Tier ───
    let tier: PredictionTier;
    let tierLabel: string;
    let avgCycleLength: number;
    let avgPeriodLength: number;

    const hasOnboarding = !!(onboardingEstimates?.cycleLength);
    const hasValidPersonalCycles = validCycleLengths.length > 0;

    if (cyclesLogged === 0 && !hasOnboarding) {
      // Tier 1: population baseline
      tier = 1;
      tierLabel = 'Based on typical cycle statistics — start tracking to personalise';
      avgCycleLength = Math.round(POPULATION_CYCLE_LENGTH);
      avgPeriodLength = POPULATION_PERIOD_LENGTH;
    } else if (cyclesLogged === 0 && hasOnboarding) {
      // Tier 2: onboarding estimates only
      tier = 2;
      tierLabel = 'Based on your estimates';
      avgCycleLength = onboardingEstimates!.cycleLength!;
      avgPeriodLength = onboardingEstimates?.periodLength || POPULATION_PERIOD_LENGTH;
    } else if (validCycleLengths.length >= 0 && validCycleLengths.length < 3 && cyclesLogged >= 1) {
      // Tier 3: 1-2 logged cycles (or 3+ records but <3 valid inter-cycle lengths)
      tier = 3;
      tierLabel = 'Based on your tracked cycles';

      if (hasValidPersonalCycles) {
        avgCycleLength = Math.round(calculateMean(validCycleLengths));
      } else if (hasOnboarding) {
        // All cycles were outliers — fall back to onboarding
        avgCycleLength = onboardingEstimates!.cycleLength!;
      } else {
        avgCycleLength = Math.round(POPULATION_CYCLE_LENGTH);
      }
      avgPeriodLength = periodLengths.length > 0
        ? Math.round(calculateMean(periodLengths))
        : onboardingEstimates?.periodLength || POPULATION_PERIOD_LENGTH;
    } else {
      // Tier 4: 3+ valid cycle lengths — weighted average, personal only
      tier = 4;
      tierLabel = 'Based on your personal cycle pattern';
      avgCycleLength = Math.round(calculateWeightedAverage(validCycleLengths));
      avgPeriodLength = periodLengths.length > 0
        ? Math.round(calculateMean(periodLengths))
        : onboardingEstimates?.periodLength || POPULATION_PERIOD_LENGTH;
    }

    // ─── Compute Dates ───
    const now = new Date();

    // Determine last cycle start
    let lastCycleStart: Date;
    if (sortedRecords.length > 0) {
      lastCycleStart = parseISO(sortedRecords[0].period_start_date);
    } else if (onboardingEstimates?.lastPeriodStart) {
      lastCycleStart = parseISO(onboardingEstimates.lastPeriodStart);
    } else {
      // No data at all — assume period started ~14 days ago for a reasonable calendar
      lastCycleStart = addDays(now, -14);
    }

    // Next period — advance until future
    let predictedPeriodStart = addDays(lastCycleStart, avgCycleLength);
    while (predictedPeriodStart < now) {
      predictedPeriodStart = addDays(predictedPeriodStart, avgCycleLength);
    }
    const predictedPeriodEnd = addDays(predictedPeriodStart, avgPeriodLength - 1);

    // Ovulation & fertile window
    const predictedOvulationDate = addDays(predictedPeriodStart, -LUTEAL_PHASE);
    const fertileWindowStart = addDays(predictedOvulationDate, -5);
    const fertileWindowEnd = addDays(predictedOvulationDate, 1);

    // PMS window
    const pmsWindowStart = addDays(predictedPeriodStart, -5);

    // ─── Statistics ───
    const standardDeviation = validCycleLengths.length >= 2
      ? calculateStandardDeviation(validCycleLengths)
      : 0;
    const isRegular = standardDeviation < 3;
    const confidenceWindow = isRegular ? 1 : Math.min(Math.ceil(standardDeviation), 7);

    // Confidence level
    let confidenceLevel: 'low' | 'medium' | 'high' = 'low';
    let dataQualityMessage = '';

    if (tier === 1) {
      confidenceLevel = 'low';
      dataQualityMessage = 'Using population averages. Log your periods for personal predictions.';
    } else if (tier === 2) {
      confidenceLevel = 'low';
      dataQualityMessage = 'Using your onboarding estimates. Log periods for better accuracy.';
    } else if (tier === 3) {
      confidenceLevel = cyclesLogged >= 2 ? 'medium' : 'low';
      dataQualityMessage = `Based on ${cyclesLogged} tracked cycle${cyclesLogged > 1 ? 's' : ''}. Log more for better accuracy.`;
    } else {
      // Tier 4
      if (cyclesLogged >= 6) {
        confidenceLevel = 'high';
        dataQualityMessage = `Based on ${cyclesLogged} logged cycles`;
      } else {
        confidenceLevel = 'medium';
        dataQualityMessage = `Based on ${cyclesLogged} cycles. More data = higher accuracy.`;
      }
    }

    // ─── Trend analysis ───
    let cycleTrend: 'stable' | 'lengthening' | 'shortening' | 'irregular' = 'stable';
    if (validCycleLengths.length >= 3) {
      if (standardDeviation > 7) {
        cycleTrend = 'irregular';
      } else {
        const recentCycles = validCycleLengths.slice(0, 3);
        const olderCycles = validCycleLengths.slice(3, 6);
        if (olderCycles.length > 0) {
          const diff = calculateMean(recentCycles) - calculateMean(olderCycles);
          if (diff > 2) cycleTrend = 'lengthening';
          else if (diff < -2) cycleTrend = 'shortening';
        }
      }
    }

    // ─── Anomaly detection ───
    let currentCycleAnomaly = false;
    let anomalyMessage: string | undefined;

    if (sortedRecords.length > 0) {
      const lastPeriodEnd = parseISO(sortedRecords[0].period_end_date);
      const daysSinceLastPeriod = differenceInDays(now, lastPeriodEnd);
      const expectedCycleEnd = avgCycleLength + (2 * standardDeviation);

      if (daysSinceLastPeriod > expectedCycleEnd && daysSinceLastPeriod > 45) {
        currentCycleAnomaly = true;
        anomalyMessage = `Your period is ${Math.round(daysSinceLastPeriod - avgCycleLength)} days late. If concerned, consider consulting a healthcare provider.`;
      }
    }

    if (excludedCycles > 0) {
      const outlierMsg = 'One of your cycles was excluded — it may have been logged incorrectly. You can review it in Cycle History.';
      anomalyMessage = anomalyMessage ? `${anomalyMessage} ${outlierMsg}` : outlierMsg;
      currentCycleAnomaly = true;
    }

    return {
      predictedPeriodStart,
      predictedPeriodEnd,
      confidenceWindow,
      averageCycleLength: avgCycleLength,
      averagePeriodLength: avgPeriodLength,
      standardDeviation,
      isRegular,
      predictedOvulationDate,
      fertileWindowStart,
      fertileWindowEnd,
      pmsWindowStart,
      confidenceLevel,
      cyclesLogged,
      dataQualityMessage,
      tier,
      tierLabel,
      cycleTrend,
      currentCycleAnomaly,
      anomalyMessage,
      excludedCycles,
    };
  }, [periodRecords, daySignals, onboardingEstimates]);
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

    periodRecords.slice(0, cycleCount).forEach((record) => {
      const cycleStart = parseISO(record.period_start_date);

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
  return date.getTime() >= fertileWindowStart.getTime() && date.getTime() <= fertileWindowEnd.getTime();
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
