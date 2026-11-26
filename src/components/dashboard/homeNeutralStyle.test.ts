import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Traffic-light colours are reserved for HEALTH status (healthTone /
// attentionBanner in src/lib/medical-utils.ts). These Home cards show
// non-health things (onboarding ticks, appointments, adherence, phases,
// symptom heat, tips) and must use the neutral tokens: ink (foreground),
// muted-foreground and raspberry primary at varying opacity.
// Deliberately NOT listed: PostpartumLochiaCard (colour swatches are the
// data), ScreeningTracker and PregnancyVaccinations (care status).
const FILES = [
  'GettingStarted.tsx',
  'UpcomingAppointments.tsx',
  'AppointmentTodayBanner.tsx',
  'DoctorNotesCard.tsx',
  'MenopauseSymptomCalendar.tsx',
  'SymptomPatternsCard.tsx',
  'SleepCycleCorrelation.tsx',
  'CyclePhaseExercise.tsx',
  'CyclePhaseNutrition.tsx',
  'CyclePredictionAccuracyCard.tsx',
  'CyclePredictionInsights.tsx',
  'ContraceptionDashboard.tsx',
  'IVFMedicationAdherence.tsx',
  'IVFNutrition.tsx',
  'MenopauseNutrition.tsx',
  'PostpartumNutrition.tsx',
  'DailyLogging.tsx',
  'LHSurgeCard.tsx',
  'PMSForecastCard.tsx',
  'CycleExplainedCard.tsx',
  'ModeHeroStat.tsx',
  'MenopauseDashboard.tsx',
  'PostpartumDashboard.tsx',
  'PostpartumPelvicFloor.tsx',
  'PreMenstrualDashboard.tsx',
  'PregnancyTracker.tsx',
  'HospitalBagChecklist.tsx',
  'VisitPrepCard.tsx',
  'PregnancyExercise.tsx',
  'PregnancyNutrition.tsx',
];
const TRAFFIC = /\b(?:text|bg|border|border-l|from|via|to|fill|stroke|ring)-(?:green|emerald|lime|yellow|amber|orange)-\d{2,3}\b/g;
const HEAT = /\b(?:bg|text)-(?:red|orange|amber|yellow)-\d{2,3}\b/g;

describe('Home non-health cards use neutral tokens', () => {
  it.each(FILES)('%s has no traffic-light colour classes', (f) => {
    const src = readFileSync(resolve(__dirname, f), 'utf8');
    expect(src.match(TRAFFIC) ?? []).toEqual([]);
  });

  it('symptom heatmap scales primary opacity, not red/orange', () => {
    const src = readFileSync(resolve(__dirname, 'MenopauseSymptomCalendar.tsx'), 'utf8');
    expect(src.match(HEAT) ?? []).toEqual([]);
    expect(src).toMatch(/bg-primary\/15/);
    expect(src).toMatch(/bg-primary\/65/);
  });
});
