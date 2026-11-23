import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Home is a short page: greeting, hero, Today, one button, "More for
// <stage>". The general lab cards live on Records; the stage lab cards,
// chart cards and visit cards moved off Home too (Records / Visits).
const CARDS = ['WeeklySummary', 'RecentFindings', 'OverdueTests', 'HealthTrends', 'HealthSummaryWidget'];
const MOVED_OFF_HOME = [
  // lab cards -> Records
  'ModeLabInsights', 'CycleLabInsights', 'PregnancyLabInsights', 'LabFreshnessCard', 'AmhAgeContext',
  // charts & cycle insight cards -> Records (My charts)
  'CyclePredictionInsights', 'CyclePredictionAccuracyCard', 'SleepCycleCorrelation', 'SymptomPatternsCard',
  'FertileWindowTimingCard', 'BBTChart', 'LHSurgeCard', 'FertilityForecast', 'PeriodFlowCard', 'SleepTrendCard',
  'CycleHistoryCard',
  // visit cards -> Visits
  'VisitPrepCard', 'DoctorNotesCard', 'UpcomingAppointments', 'AppointmentTodayBanner',
  // stage trackers -> /dashboard/stage
  'PregnancyTracker', 'ContraceptionDashboard', 'MenopauseDashboard', 'IVFTracker', 'PostpartumDashboard',
  'PreMenstrualDashboard', 'CycleCalendar', 'GuidesSection', 'PMSForecastCard', 'FertilityOutlookCard', 'EpdsScreener',
  // removed leftovers
  'OvulationPrediction', 'DocumentUpload', 'GettingStarted', 'TodayActions',
];
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('general lab card placement', () => {
  const home = read('./PatientDashboard.tsx');
  const records = read('./MedicalHistory.tsx');

  it.each(CARDS)('%s is not rendered on Home', (card) => {
    expect(home).not.toMatch(new RegExp(`<${card}\\b`));
  });

  it.each(CARDS)('%s is rendered exactly once on Health Records', (card) => {
    expect(records.match(new RegExp(`<${card}\\b`, 'g')) ?? []).toHaveLength(1);
  });

  it('Home keeps a route to Records (a "More for" row)', () => {
    expect(read('../lib/todayItems.ts')).toContain("RECORDS = '/dashboard/medical-history'");
    expect(home).toContain('moreFor(');
  });
});

describe('Home stays short', () => {
  const home = read('./PatientDashboard.tsx');

  it.each(MOVED_OFF_HOME)('%s is not on Home', (card) => {
    expect(home).not.toMatch(new RegExp(`<${card}\\b`));
    expect(home).not.toMatch(new RegExp(`import ${card}\\b`));
  });

  it('has no Back arrow to the marketing site, no Menu dropdown, no logo link', () => {
    expect(home).not.toContain("navigate('/')");
    expect(home).not.toMatch(/\bMenu\b/);
    expect(home).not.toContain('DropdownMenu');
    expect(home).not.toContain('href="/"');
  });

  it('no inline daily-log form, Daily Reminders or Quick Access card', () => {
    expect(home).not.toMatch(/<DailyLogging\b/);
    expect(home).not.toContain('Daily Reminders');
    expect(home).not.toContain('Quick Access');
    expect(home).not.toContain('withHero');
  });

  it('renders the five-block template: header, hero, Today, one button, More', () => {
    for (const block of ['<DashboardHeader', '{hero}', '<TodayList', '<PrimaryButton', '<MoreForStage']) {
      expect(home).toContain(block);
    }
    expect(home.match(/<PrimaryButton\b/g)).toHaveLength(1);
  });

  it('header has no Upload / Devices / Community pills or mode dropdown', () => {
    const header = read('../components/dashboard/DashboardHeader.tsx');
    for (const t of ['Upload', 'Devices', 'Community', 'Health Chat', 'Med Records', 'DropdownMenu']) {
      expect(header).not.toContain(t);
    }
    expect(header).toContain('to="/dashboard/settings#life-stage"');
  });
});
