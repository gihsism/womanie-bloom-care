import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowRight, FlaskConical, AlertTriangle, CheckCircle2, Upload } from 'lucide-react';

interface LabItem {
  title: string;
  value: string | null;
  unit: string | null;
  status: string | null;
}

interface TestDef {
  names: string[];
  label: string;
  emoji: string;
  note: string;
}

const IVF_TESTS: TestDef[] = [
  { names: ['amh', 'anti-mullerian', 'anti-müllerian'], label: 'AMH', emoji: '🥚', note: 'Egg reserve — key for IVF planning' },
  { names: ['fsh'], label: 'FSH', emoji: '📊', note: 'Ovarian response predictor' },
  { names: ['lh'], label: 'LH', emoji: '⚡', note: 'Hormone balance' },
  { names: ['estradiol', 'e2'], label: 'Estradiol', emoji: '💗', note: 'Follicle development marker' },
  { names: ['progesterone'], label: 'Progesterone', emoji: '🌙', note: 'Uterine lining support' },
  { names: ['tsh'], label: 'Thyroid (TSH)', emoji: '🦋', note: 'Must be <2.5 for IVF' },
  { names: ['prolactin'], label: 'Prolactin', emoji: '🧪', note: 'High = can suppress ovulation' },
  { names: ['vitamin d', '25-oh'], label: 'Vitamin D', emoji: '☀️', note: 'Linked to IVF success rates' },
  { names: ['ferritin'], label: 'Iron Stores', emoji: '🩸', note: 'Energy for treatment' },
  { names: ['testosterone'], label: 'Testosterone', emoji: '📈', note: 'Ovarian function marker' },
];

const MENOPAUSE_TESTS: TestDef[] = [
  { names: ['fsh'], label: 'FSH', emoji: '📊', note: '>25 confirms menopause' },
  { names: ['estradiol', 'e2'], label: 'Estradiol', emoji: '💗', note: 'Low in menopause — affects bones' },
  { names: ['tsh'], label: 'Thyroid (TSH)', emoji: '🦋', note: 'Thyroid issues common in menopause' },
  { names: ['vitamin d', '25-oh'], label: 'Vitamin D', emoji: '☀️', note: 'Critical for bone density' },
  { names: ['calcium'], label: 'Calcium', emoji: '🦴', note: 'Bone health — need 1200mg/day' },
  { names: ['cholesterol', 'total cholesterol'], label: 'Cholesterol', emoji: '❤️', note: 'Heart risk rises after menopause' },
  { names: ['ldl'], label: 'LDL', emoji: '💔', note: '"Bad" cholesterol — watch closely' },
  { names: ['hdl'], label: 'HDL', emoji: '💚', note: '"Good" cholesterol — keep high' },
  { names: ['glucose', 'fasting glucose'], label: 'Blood Sugar', emoji: '🍬', note: 'Insulin resistance increases' },
  { names: ['hba1c'], label: 'HbA1c', emoji: '📉', note: '3-month sugar average' },
  { names: ['ferritin'], label: 'Iron Stores', emoji: '🩸', note: 'Often improves after periods stop' },
];

const CONTRACEPTION_TESTS: TestDef[] = [
  { names: ['ferritin'], label: 'Iron Stores', emoji: '🩸', note: 'Hormonal methods may affect levels' },
  { names: ['hemoglobin', 'hb'], label: 'Hemoglobin', emoji: '🔴', note: 'Blood health' },
  { names: ['tsh'], label: 'Thyroid', emoji: '🦋', note: 'Affects hormone balance' },
  { names: ['vitamin d', '25-oh'], label: 'Vitamin D', emoji: '☀️', note: 'Overall health' },
  { names: ['cholesterol', 'total cholesterol'], label: 'Cholesterol', emoji: '❤️', note: 'Some pills affect lipids' },
  { names: ['glucose'], label: 'Blood Sugar', emoji: '🍬', note: 'Monitor with hormonal methods' },
];

const PRE_MENSTRUAL_TESTS: TestDef[] = [
  { names: ['ferritin'], label: 'Iron Stores', emoji: '🩸', note: 'Important before periods start' },
  { names: ['vitamin d', '25-oh'], label: 'Vitamin D', emoji: '☀️', note: 'Growth & immunity' },
  { names: ['tsh'], label: 'Thyroid', emoji: '🦋', note: 'Puberty development' },
  { names: ['hemoglobin', 'hb'], label: 'Hemoglobin', emoji: '🔴', note: 'Blood health' },
];

const TEST_MAP: Record<string, TestDef[]> = {
  'ivf': IVF_TESTS,
  'menopause': MENOPAUSE_TESTS,
  'post-menopause': MENOPAUSE_TESTS,
  'contraception': CONTRACEPTION_TESTS,
  'pre-menstrual': PRE_MENSTRUAL_TESTS,
};

const MODE_LABELS: Record<string, string> = {
  'ivf': 'IVF treatment',
  'menopause': 'menopause',
  'post-menopause': 'post-menopause',
  'contraception': 'contraception',
  'pre-menstrual': 'your health',
};

const statusColor = (s: string | null) =>
  s === 'critical' ? 'text-red-600' : s === 'abnormal' ? 'text-amber-600' : 'text-green-600';

const statusBg = (s: string | null) =>
  s === 'critical' ? 'bg-red-50 dark:bg-red-900/10' : s === 'abnormal' ? 'bg-amber-50 dark:bg-amber-900/10' : '';

interface ModeLabInsightsProps {
  mode: string;
}

export default function ModeLabInsights({ mode }: ModeLabInsightsProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [labs, setLabs] = useState<LabItem[]>([]);
  const [loading, setLoading] = useState(true);

  const tests = TEST_MAP[mode];
  if (!tests) return null;

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('medical_extracted_data')
        .select('title, value, unit, status')
        .eq('user_id', user.id)
        .eq('data_type', 'lab_result');
      if (data) setLabs(data);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return null;

  const matched = tests.map(test => {
    const found = labs.find(l => test.names.some(n => l.title.toLowerCase().includes(n)));
    return { ...test, result: found || null };
  });

  const tested = matched.filter(m => m.result);
  const missing = matched.filter(m => !m.result);
  const flagged = tested.filter(m => m.result?.status === 'abnormal' || m.result?.status === 'critical');

  if (labs.length === 0) {
    return (
      <Card className="p-4 border-dashed">
        <div className="text-center space-y-2">
          <Upload className="h-6 w-6 text-primary mx-auto" />
          <p className="text-sm font-semibold">Upload blood tests</p>
          <p className="text-[10px] text-muted-foreground">See results relevant to {MODE_LABELS[mode] || 'your health'}</p>
          <Button size="sm" variant="outline" onClick={() => navigate('/dashboard/medical-history')}>
            Upload documents
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" aria-hidden="true" />
          Your Lab Results
        </h3>
        <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => navigate('/dashboard/medical-history')}>
          View all <ArrowRight className="h-3 w-3" />
        </Button>
      </div>

      {flagged.length > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
          <p className="text-[10px] text-amber-700 dark:text-amber-400">
            {flagged.length} result{flagged.length !== 1 ? 's' : ''} to discuss
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {tested.map(item => {
          const r = item.result!;
          return (
            <div key={item.label} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${statusBg(r.status)}`}>
              <span className="text-sm flex-shrink-0">{item.emoji}</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium">{item.label}</span>
                <p className="text-[9px] text-muted-foreground">{item.note}</p>
              </div>
              <span className={`text-xs font-mono font-bold ${statusColor(r.status)}`}>
                {r.value}{r.unit ? ` ${r.unit}` : ''}
              </span>
              {r.status === 'normal' || r.status === 'expected' ? (
                <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
              ) : (
                <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {missing.length > 0 && missing.length <= 6 && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Recommended tests:</p>
          <div className="flex flex-wrap gap-1">
            {missing.map(m => (
              <Badge key={m.label} variant="outline" className="text-[9px] px-1.5 py-0">
                {m.emoji} {m.label}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
