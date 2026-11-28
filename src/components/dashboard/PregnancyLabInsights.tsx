import { withinWindow } from '@/lib/labWindow';
import { isOutsideRange } from '@/lib/labFlags';
import { Card } from '@/components/ui/card';
import { useLabResults } from '@/hooks/useLabResults';
import EvidenceNote from '@/components/research/EvidenceNote';
import { specsForLabs } from '@/lib/evidenceTopics';
import { LabAttentionBanner, LabCardHeader, LabEmptyCard, LabMissingTests, LabRow } from './LabInsightParts';

// Key tests to highlight during pregnancy. The status comes from the lab's
// own range (isOutsideRange). Research round 10 removed unused cut-offs
// that were never shown and partly unsourced (vitamin D "30 ng/mL",
// fasting glucose "95 mg/dL", folate "5 ng/mL").
const PREGNANCY_TESTS = [
  { names: ['ferritin'], label: 'Iron Stores' },
  { names: ['hemoglobin', 'hb', 'hgb'], label: 'Hemoglobin' },
  { names: ['tsh'], label: 'Thyroid' },
  { names: ['vitamin d', '25-oh'], label: 'Vitamin D' },
  { names: ['glucose', 'fasting glucose'], label: 'Blood Sugar' },
  { names: ['hcg', 'beta-hcg', 'beta hcg'], label: 'HCG' },
  { names: ['folate', 'folic acid'], label: 'Folate' },
  { names: ['vitamin b12', 'b12'], label: 'Vitamin B12' },
  { names: ['platelets'], label: 'Platelets' },
  { names: ['calcium'], label: 'Calcium' },
];

export default function PregnancyLabInsights({ since = null }: { since?: Date | null } = {}) {
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
  const flagged = tested.filter(m => isOutsideRange(m.result?.status));

  if (labs.length === 0) {
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

      {/* Flagged items alert */}
      {flagged.length > 0 && (
        <LabAttentionBanner>
          {flagged.length} result{flagged.length !== 1 ? 's' : ''} need{flagged.length === 1 ? 's' : ''} attention for pregnancy
        </LabAttentionBanner>
      )}

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
