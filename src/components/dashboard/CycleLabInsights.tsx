import { Card } from '@/components/ui/card';
import { useLabResults } from '@/hooks/useLabResults';
import EvidenceNote from '@/components/research/EvidenceNote';
import { specsForLabs } from '@/lib/evidenceTopics';
import { LabCardHeader, LabEmptyCard, LabMissingTests, LabRow } from './LabInsightParts';

interface CycleLabInsightsProps {
  mode: string;
  /** True when the page already shows its own primary upload button: then
   *  the empty "Upload blood tests" card hides (one upload button per page). */
  hideUploadCard?: boolean;
}

const CYCLE_TESTS = [
  { names: ['ferritin'], label: 'Iron Stores', note: 'Low iron = fatigue & heavy periods' },
  { names: ['hemoglobin', 'hb', 'hgb'], label: 'Hemoglobin', note: 'Oxygen-carrying capacity' },
  { names: ['tsh'], label: 'Thyroid (TSH)', note: 'Affects cycle regularity' },
  { names: ['vitamin d', '25-oh'], label: 'Vitamin D', note: 'Mood, immunity, fertility' },
  { names: ['estradiol', 'e2'], label: 'Estradiol', note: 'Main estrogen — drives cycle' },
  { names: ['progesterone'], label: 'Progesterone', note: 'Confirms ovulation' },
  { names: ['fsh'], label: 'FSH', note: 'Ovarian function' },
  { names: ['lh'], label: 'LH', note: 'Triggers ovulation' },
];

const CONCEPTION_EXTRA = [
  { names: ['amh', 'anti-mullerian', 'anti-müllerian'], label: 'AMH', note: 'Egg reserve' },
  { names: ['prolactin'], label: 'Prolactin', note: 'Can suppress ovulation if high' },
  { names: ['folate', 'folic acid'], label: 'Folate', note: 'Critical for early pregnancy' },
  { names: ['vitamin b12', 'b12'], label: 'Vitamin B12', note: 'Fertility & nerve health' },
  { names: ['testosterone'], label: 'Testosterone', note: 'High = possible PCOS' },
];

export default function CycleLabInsights({ mode, hideUploadCard = false }: CycleLabInsightsProps) {
  const { labs, loading } = useLabResults();

  if (loading) return null;

  const testsToShow = mode === 'conception' || mode === 'ivf'
    ? [...CYCLE_TESTS, ...CONCEPTION_EXTRA]
    : CYCLE_TESTS;

  const matched = testsToShow.map(test => {
    const found = labs.find(l =>
      test.names.some(n => l.title.toLowerCase().includes(n))
    );
    return { ...test, result: found || null };
  });

  const tested = matched.filter(m => m.result);
  const missing = matched.filter(m => !m.result);

  if (labs.length === 0) {
    if (hideUploadCard) return null;
    return <LabEmptyCard title="Upload blood tests" text="See your hormone levels, iron, thyroid and more" />;
  }

  return (
    <Card className="p-4 space-y-3">
      <LabCardHeader />

      {/* No "N results need attention" banner: Records lists each flagged
          result once, under "Talk to your doctor about". */}

      <ul>
        {tested.map(item => {
          const r = item.result!;
          return <LabRow key={item.label} label={item.label} note={item.note} value={r.value} unit={r.unit} status={r.status} />;
        })}
      </ul>

      {missing.length > 0 && missing.length <= 6 && (
        <LabMissingTests title={mode === 'conception' ? 'Recommended for fertility' : 'Consider testing'} labels={missing.map(m => m.label)} />
      )}
      {/* What the research says about her own tested markers (flagged first). */}
      <EvidenceNote
        specs={specsForLabs(tested.map(t => ({ title: t.result!.title, label: t.label, status: t.result!.status })), mode)}
        className="pt-1 border-t border-border/50"
      />
    </Card>
  );
}
