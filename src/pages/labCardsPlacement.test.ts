import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// The general lab cards live on Health Records, not Home, in every mode.
const CARDS = ['WeeklySummary', 'RecentFindings', 'OverdueTests', 'HealthTrends', 'HealthSummaryWidget'];
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

  it('Home keeps a route to Health Records', () => {
    expect(home).toContain("navigate('/dashboard/medical-history')");
  });

  it("pregnancy Home still shows only this pregnancy's labs", () => {
    expect(home).toContain('<PregnancyLabInsights since={labSince} />');
  });
});
