import { Card } from '@/components/ui/card';
import { useLabResults } from '@/hooks/useLabResults';
import EvidenceNote from '@/components/research/EvidenceNote';
import { specsForLabs } from '@/lib/evidenceTopics';
import { LabAttentionBanner, LabCardHeader, LabEmptyCard, LabMissingTests, LabRow } from './LabInsightParts';

interface TestDef {
  names: string[];
  label: string;
  note: string;
  /** Titles containing any of these belong to another row (e.g. "LDL cholesterol" is not total cholesterol). */
  exclude?: string[];
}

const CHOLESTEROL_FRACTIONS = ['ldl', 'hdl', 'vldl'];

export function matchesTest(title: string, test: Pick<TestDef, 'names' | 'exclude'>): boolean {
  const t = title.toLowerCase();
  if (test.exclude?.some(x => t.includes(x))) return false;
  return test.names.some(n => t.includes(n));
}

const IVF_TESTS: TestDef[] = [
  { names: ['amh', 'anti-mullerian', 'anti-müllerian'], label: 'AMH', note: 'Egg reserve — key for IVF planning' },
  { names: ['fsh'], label: 'FSH', note: 'Ovarian response predictor' },
  { names: ['lh'], label: 'LH', note: 'Hormone balance' },
  { names: ['estradiol', 'e2'], label: 'Estradiol', note: 'Follicle development marker' },
  { names: ['progesterone'], label: 'Progesterone', note: 'Uterine lining support' },
  { names: ['tsh'], label: 'Thyroid (TSH)', note: 'Clinics often aim for under 2.5; guidelines differ' },
  { names: ['prolactin'], label: 'Prolactin', note: 'High = can suppress ovulation' },
  { names: ['vitamin d', '25-oh'], label: 'Vitamin D', note: 'Linked to IVF success rates' },
  { names: ['ferritin'], label: 'Iron Stores', note: 'Energy for treatment' },
  { names: ['testosterone'], label: 'Testosterone', note: 'Ovarian function marker' },
];

const MENOPAUSE_TESTS: TestDef[] = [
  { names: ['fsh'], label: 'FSH', note: 'Swings around menopause; not used alone to diagnose it after 45' },
  { names: ['estradiol', 'e2'], label: 'Estradiol', note: 'Low in menopause — affects bones' },
  { names: ['tsh'], label: 'Thyroid (TSH)', note: 'Thyroid issues common in menopause' },
  { names: ['vitamin d', '25-oh'], label: 'Vitamin D', note: 'Critical for bone density' },
  { names: ['calcium'], label: 'Calcium', note: 'Bone health: about 950-1200 mg a day, by age (Swiss BLV)' },
  { names: ['cholesterol', 'total cholesterol'], label: 'Cholesterol', note: 'Heart risk rises after menopause', exclude: CHOLESTEROL_FRACTIONS },
  { names: ['ldl'], label: 'LDL', note: '"Bad" cholesterol — watch closely' },
  { names: ['hdl'], label: 'HDL', note: '"Good" cholesterol — keep high' },
  { names: ['glucose', 'fasting glucose'], label: 'Blood Sugar', note: 'Insulin resistance increases' },
  { names: ['hba1c'], label: 'HbA1c', note: '3-month sugar average' },
  { names: ['ferritin'], label: 'Iron Stores', note: 'Often improves after periods stop' },
];

const CONTRACEPTION_TESTS: TestDef[] = [
  { names: ['ferritin'], label: 'Iron Stores', note: 'Hormonal methods may affect levels' },
  { names: ['hemoglobin', 'hb'], label: 'Hemoglobin', note: 'Blood health' },
  { names: ['tsh'], label: 'Thyroid', note: 'Affects hormone balance' },
  { names: ['vitamin d', '25-oh'], label: 'Vitamin D', note: 'Overall health' },
  { names: ['cholesterol', 'total cholesterol'], label: 'Cholesterol', note: 'Some pills affect lipids', exclude: CHOLESTEROL_FRACTIONS },
  { names: ['glucose'], label: 'Blood Sugar', note: 'Monitor with hormonal methods' },
];

const PRE_MENSTRUAL_TESTS: TestDef[] = [
  { names: ['ferritin'], label: 'Iron Stores', note: 'Important before periods start' },
  { names: ['vitamin d', '25-oh'], label: 'Vitamin D', note: 'Growth & immunity' },
  { names: ['tsh'], label: 'Thyroid', note: 'Puberty development' },
  { names: ['hemoglobin', 'hb'], label: 'Hemoglobin', note: 'Blood health' },
];

const POSTPARTUM_TESTS: TestDef[] = [
  { names: ['ferritin'], label: 'Iron Stores', note: 'Often low after birth blood loss' },
  { names: ['hemoglobin', 'hb'], label: 'Hemoglobin', note: 'Anemia screen' },
  { names: ['tsh'], label: 'Thyroid (TSH)', note: 'Postpartum thyroiditis peaks 3–6 mo' },
  { names: ['vitamin d', '25-oh'], label: 'Vitamin D', note: 'Needed for you + (if breastfeeding) baby' },
  { names: ['b12', 'vitamin b12', 'cobalamin'], label: 'Vitamin B12', note: 'Energy + nerve recovery' },
  { names: ['glucose', 'fasting glucose'], label: 'Blood Sugar', note: 'Especially after gestational diabetes' },
];

const TEST_MAP: Record<string, TestDef[]> = {
  'ivf': IVF_TESTS,
  'menopause': MENOPAUSE_TESTS,
  'post-menopause': MENOPAUSE_TESTS,
  'contraception': CONTRACEPTION_TESTS,
  'pre-menstrual': PRE_MENSTRUAL_TESTS,
  'postpartum': POSTPARTUM_TESTS,
};

const MODE_LABELS: Record<string, string> = {
  'ivf': 'IVF treatment',
  'menopause': 'menopause',
  'post-menopause': 'post-menopause',
  'contraception': 'contraception',
  'pre-menstrual': 'your health',
  'postpartum': 'postpartum recovery',
};

interface ModeLabInsightsProps {
  mode: string;
}

export default function ModeLabInsights({ mode }: ModeLabInsightsProps) {
  const { labs, loading } = useLabResults();

  const tests = TEST_MAP[mode];
  if (!tests) return null;

  if (loading) return null;

  const matched = tests.map(test => {
    const found = labs.find(l => matchesTest(l.title, test));
    return { ...test, result: found || null };
  });

  const tested = matched.filter(m => m.result);
  const missing = matched.filter(m => !m.result);
  const flagged = tested.filter(m => m.result?.status === 'abnormal' || m.result?.status === 'critical');

  if (labs.length === 0) {
    return <LabEmptyCard title="Upload blood tests" text={`See results relevant to ${MODE_LABELS[mode] || 'your health'}`} />;
  }

  return (
    <Card className="p-4 space-y-3">
      <LabCardHeader />

      {flagged.length > 0 && (
        <LabAttentionBanner>
          {flagged.length} result{flagged.length !== 1 ? 's' : ''} to discuss
        </LabAttentionBanner>
      )}

      <ul>
        {tested.map(item => {
          const r = item.result!;
          return <LabRow key={item.label} label={item.label} note={item.note} value={r.value} unit={r.unit} status={r.status} />;
        })}
      </ul>

      {missing.length > 0 && missing.length <= 6 && (
        <LabMissingTests title="Recommended tests" labels={missing.map(m => m.label)} />
      )}
      {/* What the research says about her own tested markers (flagged first). */}
      <EvidenceNote
        specs={specsForLabs(tested.map(t => ({ title: t.result!.title, label: t.label, status: t.result!.status })), mode)}
        className="pt-1 border-t border-border/50"
      />
    </Card>
  );
}
