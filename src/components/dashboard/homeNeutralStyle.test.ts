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

// Idea 4: Home's own components take every colour from the tokens (the
// stage set in index.css, switched by <html data-stage>), never a hex or a
// named Tailwind palette colour of their own.
const HOME = ['StageHeader.tsx', 'TileGrid.tsx', 'TodayLog.tsx', 'HomeView.tsx', 'UndoBar.tsx', 'ChoiceSheet.tsx', 'TileIcon.tsx', 'LogTodaySheet.tsx'];
const PALETTE = /\b(?:text|bg|border|from|via|to|fill|stroke|ring)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/g;

describe('Home (idea 4) uses only tokens', () => {
  it.each(HOME)('%s has no hex colour and no palette colour class', (f) => {
    const src = readFileSync(resolve(__dirname, '../home', f), 'utf8');
    expect(src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(src.match(PALETTE) ?? []).toEqual([]);
  });

  it('the tiles and header use the stage tokens', () => {
    const tiles = readFileSync(resolve(__dirname, '../home/TileGrid.tsx'), 'utf8');
    const header = readFileSync(resolve(__dirname, '../home/StageHeader.tsx'), 'utf8');
    expect(tiles).toMatch(/bg-stage-tint/);
    expect(tiles).toMatch(/text-stage-accent/);
    expect(header).toMatch(/bg-stage-head/);
    expect(header).toMatch(/text-stage-ink/);
  });
});
