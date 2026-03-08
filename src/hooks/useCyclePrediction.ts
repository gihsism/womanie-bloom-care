import { useMemo } from 'react';
import { parseISO, differenceInDays, addDays, format, isSameDay } from 'date-fns';

// Types
export interface PeriodRecord {
  id?: string;
  period_start_date: string;
  period_end_date: string | null; // null = active/unconfirmed period
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
  predictedPeriodStart: Date;
  predictedPeriodEnd: Date;
  confidenceWindow: number;
  averageCycleLength: number;
  averagePeriodLength: number;
  standardDeviation: number;
  isRegular: boolean;
  predictedOvulationDate: Date;
  fertileWindowStart: Date;
  fertileWindowEnd: Date;
  pmsWindowStart: Date;
  confidenceLevel: 'low' | 'medium' | 'high';
  cyclesLogged: number;
  dataQualityMessage: string;
  tier: PredictionTier;
  tierLabel: string;
  cycleTrend: 'stable' | 'lengthening' | 'shortening' | 'irregular';
  currentCycleAnomaly: boolean;
  anomalyMessage?: string;
  excludedCycles: number;
}

export interface SymptomPattern {
  symptom: string;
  typicalDays: number[];
  frequency: number;
}

export interface OnboardingEstimates {
  cycleLength?: number;
  periodLength?: number;
  lastPeriodStart?: string;
}

interface CyclePredictionInput {
  periodRecords: PeriodRecord[];
  daySignals: Record<string, DaySignal>;
  onboardingEstimates?: OnboardingEstimates;
  manualOverrides?: { cycleLength?: number; periodLength?: number };
}

// Constants
const POPULATION_CYCLE_LENGTH = 28.5;
const POPULATION_PERIOD_LENGTH = 5;
const LUTEAL_PHASE = 14;
const MIN_VALID_CYCLE = 18;
const MAX_VALID_CYCLE = 60;

// Stats helpers
const calculateMean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

const calculateStandardDeviation = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = calculateMean(values);
  return Math.sqrt(calculateMean(values.map(v => Math.pow(v - mean, 2))));
};

const calculateWeightedAverage = (values: number[]): number => {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const totalWeight = values.reduce((sum, _, i) => sum + (values.length - i), 0);
  return values.reduce((sum, val, i) => sum + val * ((values.length - i) / totalWeight), 0);
};

/**
 * Get the effective end date for a period record.
 * If end_date is null (active period), use start + avgPeriodLength as predicted end.
 */
export function getEffectiveEndDate(record: PeriodRecord, avgPeriodLength: number): string {
  if (record.period_end_date) return record.period_end_date;
  return format(addDays(parseISO(record.period_start_date), avgPeriodLength - 1), 'yyyy-MM-dd');
}

/**
 * Check if a period record is still active (no confirmed end date).
 */
export function isActivePeriod(record: PeriodRecord): boolean {
  return record.period_end_date === null;
}

// Main prediction hook — always returns a prediction (never null)
export function useCyclePrediction({
  periodRecords,
  daySignals,
  onboardingEstimates,
  manualOverrides,
}: CyclePredictionInput): CyclePrediction {
  return useMemo(() => {
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

    const validCycleLengths = rawCycleLengths.filter(
      len => len >= MIN_VALID_CYCLE && len <= MAX_VALID_CYCLE
    );
    const excludedCycles = rawCycleLengths.length - validCycleLengths.length;

    // Calculate CONFIRMED period lengths (only from records with a real end_date, not legacy end===start)
    const confirmedPeriodLengths = sortedRecords
      .filter(r => r.period_end_date !== null && r.period_end_date !== r.period_start_date)
      .map(r => differenceInDays(parseISO(r.period_end_date!), parseISO(r.period_start_date)) + 1)
      .filter(len => len >= 2 && len <= 14);

    // ─── Determine Tier & averages ───
    let tier: PredictionTier;
    let tierLabel: string;
    let avgCycleLength: number;
    let avgPeriodLength: number;

    const hasOnboarding = !!(onboardingEstimates?.cycleLength);
    const hasValidPersonalCycles = validCycleLengths.length > 0;

    // Period length fallback cascade: confirmed personal → onboarding → population
    const getAvgPeriodLength = () => {
      if (confirmedPeriodLengths.length > 0) return Math.round(calculateMean(confirmedPeriodLengths));
      if (onboardingEstimates?.periodLength) return onboardingEstimates.periodLength;
      return POPULATION_PERIOD_LENGTH;
    };

    if (cyclesLogged === 0 && !hasOnboarding) {
      tier = 1;
      tierLabel = 'Based on typical cycle statistics — start tracking to personalise';
      avgCycleLength = Math.round(POPULATION_CYCLE_LENGTH);
      avgPeriodLength = POPULATION_PERIOD_LENGTH;
    } else if (cyclesLogged === 0 && hasOnboarding) {
      tier = 2;
      tierLabel = 'Based on your estimates';
      avgCycleLength = onboardingEstimates!.cycleLength!;
      avgPeriodLength = onboardingEstimates?.periodLength || POPULATION_PERIOD_LENGTH;
    } else if (validCycleLengths.length < 3 && cyclesLogged >= 1) {
      tier = 3;
      tierLabel = 'Based on your tracked cycles';
      avgCycleLength = hasValidPersonalCycles
        ? Math.round(calculateMean(validCycleLengths))
        : hasOnboarding ? onboardingEstimates!.cycleLength! : Math.round(POPULATION_CYCLE_LENGTH);
      avgPeriodLength = getAvgPeriodLength();
    } else {
      tier = 4;
      tierLabel = 'Based on your personal cycle pattern';
      avgCycleLength = Math.round(calculateWeightedAverage(validCycleLengths));
      avgPeriodLength = getAvgPeriodLength();
    }

    // ─── Compute Dates ───
    const now = new Date();

    let lastCycleStart: Date;
    if (sortedRecords.length > 0) {
      lastCycleStart = parseISO(sortedRecords[0].period_start_date);
    } else if (onboardingEstimates?.lastPeriodStart) {
      lastCycleStart = parseISO(onboardingEstimates.lastPeriodStart);
    } else {
      lastCycleStart = addDays(now, -14);
    }

    let predictedPeriodStart = addDays(lastCycleStart, avgCycleLength);
    while (predictedPeriodStart < now) {
      predictedPeriodStart = addDays(predictedPeriodStart, avgCycleLength);
    }
    const predictedPeriodEnd = addDays(predictedPeriodStart, avgPeriodLength - 1);

    const predictedOvulationDate = addDays(predictedPeriodStart, -LUTEAL_PHASE);
    const fertileWindowStart = addDays(predictedOvulationDate, -5);
    const fertileWindowEnd = addDays(predictedOvulationDate, 1);
    const pmsWindowStart = addDays(predictedPeriodStart, -5);

    // ─── Statistics ───
    const standardDeviation = validCycleLengths.length >= 2
      ? calculateStandardDeviation(validCycleLengths) : 0;
    const isRegular = standardDeviation < 3;
    const confidenceWindow = isRegular ? 1 : Math.min(Math.ceil(standardDeviation), 7);

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
      confidenceLevel = cyclesLogged >= 6 ? 'high' : 'medium';
      dataQualityMessage = cyclesLogged >= 6
        ? `Based on ${cyclesLogged} logged cycles`
        : `Based on ${cyclesLogged} cycles. More data = higher accuracy.`;
    }

    // ─── Trend analysis ───
    let cycleTrend: 'stable' | 'lengthening' | 'shortening' | 'irregular' = 'stable';
    if (validCycleLengths.length >= 3) {
      if (standardDeviation > 7) {
        cycleTrend = 'irregular';
      } else {
        const recent = validCycleLengths.slice(0, 3);
        const older = validCycleLengths.slice(3, 6);
        if (older.length > 0) {
          const diff = calculateMean(recent) - calculateMean(older);
          if (diff > 2) cycleTrend = 'lengthening';
          else if (diff < -2) cycleTrend = 'shortening';
        }
      }
    }

    // ─── Anomaly detection ───
    let currentCycleAnomaly = false;
    let anomalyMessage: string | undefined;

    if (sortedRecords.length > 0) {
      const lastEndStr = sortedRecords[0].period_end_date;
      if (lastEndStr) {
        const lastPeriodEnd = parseISO(lastEndStr);
        const daysSince = differenceInDays(now, lastPeriodEnd);
        const expected = avgCycleLength + (2 * standardDeviation);
        if (daysSince > expected && daysSince > 45) {
          currentCycleAnomaly = true;
          anomalyMessage = `Your period is ${Math.round(daysSince - avgCycleLength)} days late. If concerned, consider consulting a healthcare provider.`;
        }
      }
    }

    if (excludedCycles > 0) {
      const msg = 'One of your cycles was excluded — it may have been logged incorrectly. You can review it in Cycle History.';
      anomalyMessage = anomalyMessage ? `${anomalyMessage} ${msg}` : msg;
      currentCycleAnomaly = true;
    }

    return {
      predictedPeriodStart, predictedPeriodEnd, confidenceWindow,
      averageCycleLength: avgCycleLength, averagePeriodLength: avgPeriodLength,
      standardDeviation, isRegular,
      predictedOvulationDate, fertileWindowStart, fertileWindowEnd, pmsWindowStart,
      confidenceLevel, cyclesLogged, dataQualityMessage,
      tier, tierLabel, cycleTrend,
      currentCycleAnomaly, anomalyMessage, excludedCycles,
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
        const dateKey = format(addDays(cycleStart, day), 'yyyy-MM-dd');
        const signal = daySignals[dateKey];
        if (signal?.symptoms) {
          signal.symptoms.forEach(symptom => {
            if (!symptomOccurrences[symptom]) symptomOccurrences[symptom] = {};
            if (!symptomOccurrences[symptom][day + 1]) symptomOccurrences[symptom][day + 1] = 0;
            symptomOccurrences[symptom][day + 1]++;
          });
        }
      }
    });

    const patterns: SymptomPattern[] = [];
    const threshold = cycleCount * 0.7;
    Object.entries(symptomOccurrences).forEach(([symptom, dayOccurrences]) => {
      const typicalDays: number[] = [];
      let total = 0;
      Object.entries(dayOccurrences).forEach(([day, count]) => {
        if (count >= threshold) typicalDays.push(parseInt(day));
        total += count;
      });
      if (typicalDays.length > 0) {
        patterns.push({ symptom, typicalDays: typicalDays.sort((a, b) => a - b), frequency: (total / cycleCount) * 100 });
      }
    });
    return patterns.sort((a, b) => b.frequency - a.frequency);
  }, [periodRecords, daySignals, cycleLength]);
}

export function getCurrentCycleDay(lastPeriodStart: Date, cycleLength: number): number {
  const diffDays = differenceInDays(new Date(), lastPeriodStart);
  const day = (diffDays % cycleLength) + 1;
  return day > 0 ? day : day + cycleLength;
}

export function isInFertileWindow(date: Date, start: Date, end: Date): boolean {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

export function isOvulationDay(date: Date, predicted: Date): boolean {
  return isSameDay(date, predicted);
}

export function getPredictionMessage(prediction: CyclePrediction): string {
  if (prediction.isRegular) {
    return `Expected ${format(prediction.predictedPeriodStart, 'MMM d')}`;
  }
  const rangeStart = addDays(prediction.predictedPeriodStart, -prediction.confidenceWindow);
  const rangeEnd = addDays(prediction.predictedPeriodStart, prediction.confidenceWindow);
  return `Expected ${format(rangeStart, 'MMM d')}-${format(rangeEnd, 'd')}`;
}
