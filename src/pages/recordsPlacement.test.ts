import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// Simplify plan steps 5, 6, 7, 13: the cards that left Home live on
// Records (Results / My charts) and Visits. These tests read the source,
// like labCardsPlacement.test.ts, so a later edit can't silently drop them.
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const records = read('./MedicalHistory.tsx');
const stageLabs = read('../components/records/StageLabCards.tsx');
const myCharts = read('../components/records/MyCharts.tsx');
const visits = read('./dashboard/Appointments.tsx');

const count = (src: string, re: RegExp) => (src.match(new RegExp(re.source, 'g')) ?? []).length;

describe('Records segments', () => {
  it('has Results, Documents and My charts, with Results as the default', () => {
    expect(records).toContain("['results', 'Results']");
    expect(records).toContain("['documents', 'Documents']");
    expect(records).toContain("['charts', 'My charts']");
    expect(records).toContain("return t === 'charts' ? 'charts' : 'results';");
  });

  // WAI-ARIA tabs pattern (QA round 3): tabs point at one tabpanel that is
  // labelled by the selected tab; only the selected tab is in the Tab
  // order, arrow keys / Home / End move between tabs.
  it('segments are proper tabs with a tabpanel and keyboard support', () => {
    expect(records).toContain('role="tablist" aria-label="Records sections"');
    expect(records).toContain('id={`records-tab-${key}`}');
    expect(records).toContain('aria-controls="records-panel"');
    expect(records).toContain('tabIndex={segment === key ? 0 : -1}');
    expect(count(records, /role="tabpanel"/)).toBe(1);
    expect(records).toContain('id="records-panel" role="tabpanel" aria-labelledby={`records-tab-${segment}`}');
    for (const k of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) expect(records).toContain(`e.key === '${k}'`);
    // Every segment's content sits inside the panel.
    const panel = records.slice(records.indexOf('id="records-panel"'), records.indexOf('<DocumentUpload open'));
    for (const seg of ["segment === 'charts'", "segment === 'documents'", "segment === 'results'"]) expect(panel).toContain(seg);
  });

  it('a ?doc= deep link opens the Documents segment', () => {
    expect(records).toContain("setSegment('documents');");
  });

  it('has one upload dialog and "Upload a document" as the action', () => {
    expect(count(records, /<DocumentUpload\b/)).toBe(1);
    expect(records).toContain('showTrigger={false}');
    expect(records).toContain('Upload a document');
    // The old always-on upload card is gone.
    expect(records).not.toContain('<DocumentUpload onUploaded={fetchData} />');
  });

  it('has no log-out control and no marketing-site link in the header', () => {
    expect(records).not.toMatch(/<UserMenu\b/);
    expect(records).not.toContain('LogOut');
    expect(records).not.toContain("window.location.href = '/'");
  });

  it('keeps "Re-analyze all" in the ⋯ menu', () => {
    expect(records).toContain('aria-label="More actions"');
    expect(records).toMatch(/<DropdownMenuItem onClick=\{reanalyzeAll\}/);
  });
});

describe('Records → Results: stage lab cards moved from Home', () => {
  it('renders the stage lab cards once, with the pregnancy window', () => {
    expect(count(records, /<StageLabCards\b/)).toBe(1);
    expect(records).toContain('<StageLabCards mode={mode} labSince={labSince} />');
    expect(records).toContain("mode === 'pregnancy' ? pregnancyStart(pregnancyDueDate) : null");
    expect(records).toContain("select('life_stage, pregnancy_due_date')");
  });

  it("pregnancy shows only this pregnancy's labs", () => {
    expect(stageLabs).toContain('<PregnancyLabInsights since={labSince} />');
  });

  it.each(['CycleLabInsights', 'ModeLabInsights', 'LabFreshnessCard', 'AmhAgeContext'])(
    '%s is rendered on Results',
    (card) => {
      expect(count(stageLabs, new RegExp(`<${card}\\b`))).toBe(1);
    },
  );

  it('shows AI risk screening as one row', () => {
    expect(records).toContain('Possible risks to ask about ({riskItems.length})');
    expect(records).not.toContain('AI Risk Screening');
  });

  it('merges the three trend sections into each test row', () => {
    expect(records).not.toContain('Results Breakdown');
    expect(records).not.toContain('How your results are changing');
    expect(records).not.toContain('Test Trends Over Time');
    expect(records).toContain('<TestTrend info={info}');
  });
});

describe('Records → My charts', () => {
  it('renders MyCharts for the current stage', () => {
    expect(records).toContain("{segment === 'charts' && <MyCharts mode={mode} />}");
  });

  it.each([
    'CyclePredictionInsights',
    'CyclePredictionAccuracyCard',
    'SleepCycleCorrelation',
    'SymptomPatternsCard',
    'FertileWindowTimingCard',
    'BBTChart',
    'LHSurgeCard',
    'FertilityForecast',
    'PeriodFlowCard',
    'SleepTrendCard',
    'CycleHistoryCard',
  ])('%s is rendered in My charts', (card) => {
    expect(count(myCharts, new RegExp(`<${card}\\b`))).toBe(1);
  });
});

describe('Visits', () => {
  it.each(['VisitPrepCard', 'DoctorNotesCard', 'PendingConnections', 'ConnectedDoctors', 'ChartAccessLog'])(
    '%s is rendered once on Visits',
    (card) => {
      expect(count(visits, new RegExp(`<${card}\\b`))).toBe(1);
    },
  );

  it('connected doctors moved off Records', () => {
    expect(records).not.toMatch(/<ConnectedDoctors\b/);
    expect(records).not.toMatch(/<PendingConnections\b/);
  });

  it('puts Questions to bring right after the next visit, before doctor notes', () => {
    const next = visits.indexOf('Your next visit');
    const prep = visits.indexOf('<VisitPrepCard');
    const notes = visits.indexOf('<DoctorNotesCard');
    expect(next).toBeGreaterThan(-1);
    expect(prep).toBeGreaterThan(next);
    expect(notes).toBeGreaterThan(prep);
  });

  it('keeps connected doctors behind "Your doctors"', () => {
    expect(visits.indexOf('<ConnectedDoctors')).toBeGreaterThan(visits.indexOf('Your doctors'));
  });

  it('has "Book a visit" opening FindDoctor', () => {
    expect(visits).toContain('Book a visit');
    expect(visits).toContain("const bookVisit = () => navigate('/find-doctor');");
  });
});
