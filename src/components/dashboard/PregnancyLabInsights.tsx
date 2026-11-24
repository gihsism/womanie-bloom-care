import { withinWindow } from '@/lib/labWindow';
import { Card } from '@/components/ui/card';
import { useLabResults } from '@/hooks/useLabResults';
import EvidenceNote from '@/components/research/EvidenceNote';
import { specsForLabs } from '@/lib/evidenceTopics';
import { LabCardHeader, LabEmptyCard, LabMissingTests, LabRow } from './LabInsightParts';

// Key tests to highlight during pregnancy
const PREGNANCY_TESTS = [
  { names: ['ferritin'], label: 'Iron Stores', criticalBelow: 30, idealLabel: '≥30 ng/mL' },
  { names: ['hemoglobin', 'hb', 'hgb'], label: 'Hemoglobin', criticalBelow: 11, idealLabel: '≥11 g/dL' },
  { names: ['tsh'], label: 'Thyroid', idealLabel: '0.1-2.5 mIU/L' },
  { names: ['vitamin d', '25-oh'], label: 'Vitamin D', criticalBelow: 30, idealLabel: '≥30 ng/mL' },
  { names: ['glucose', 'fasting glucose'], label: 'Blood Sugar', idealLabel: '<95 mg/dL' },
  { names: ['hcg', 'beta-hcg', 'beta hcg'], label: 'HCG', idealLabel: 'Rising' },
  { names: ['folate', 'folic acid'], label: 'Folate', criticalBelow: 5, idealLabel: '≥5 ng/mL' },
  { names: ['vitamin b12', 'b12'], label: 'Vitamin B12', criticalBelow: 200, idealLabel: '≥200 pg/mL' },
  { names: ['platelets'], label: 'Platelets', criticalBelow: 150, idealLabel: '≥150 k/µL' },
  { names: ['calcium'], label: 'Calcium', idealLabel: '8.5-10.5 mg/dL' },
];

export default function PregnancyLabInsights({ since = null, hideUploadCard = false }: { since?: Date | null; hideUploadCard?: boolean } = {}) {
  const { labs: allLabs, loading } = useLabResults();
  // Only results from this pregnancy (older ones stay in Health Records).
  const labs = withinWindow(allLabs, since);

  if (loading) return null;

  // Match lab results to pregnancy-important tests
  const matched = PREGNANCY_TESTS.map(test => {
    const found = labs.find(l =>
      test.names.some(n => l.title.toLowerCase().includes(n))
    );
    return { ...test, result: found || null };
  });

  const tested = matched.filter(m => m.result);
  const missing = matched.filter(m => !m.result);

  if (labs.length === 0) {
    // One upload button per page: Records already shows its own.
    if (hideUploadCard) return null;
    return (
      <LabEmptyCard
        title={allLabs.length > 0 ? 'No blood tests from this pregnancy yet' : 'Upload your blood tests'}
        text="Get personalized pregnancy health insights from your lab results"
      />
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <LabCardHeader />

      {/* No "N results need attention" banner: Records lists each flagged
          result once, under "Talk to your doctor about". */}

      {/* Tested results */}
      <ul>
        {tested.map(item => {
          const r = item.result!;
          return <LabRow key={item.label} label={item.label} value={r.value} unit={r.unit} status={r.status} />;
        })}
      </ul>

      {/* Missing important tests */}
      {missing.length > 0 && missing.length <= 5 && (
        <LabMissingTests title="Not yet tested" labels={missing.map(m => m.label)} />
      )}
      {/* What the research says about her own tested markers (flagged first). */}
      <EvidenceNote
        specs={specsForLabs(tested.map(t => ({ title: t.result!.title, label: t.label, status: t.result!.status })), 'pregnancy')}
        className="pt-1 border-t border-border/50"
      />
    </Card>
  );
}
