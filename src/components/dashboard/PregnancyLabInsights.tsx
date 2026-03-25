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
  reference_range: string | null;
  status: string | null;
}

// Key tests to highlight during pregnancy
const PREGNANCY_TESTS = [
  { names: ['ferritin'], label: 'Iron Stores', emoji: '🩸', criticalBelow: 30, idealLabel: '≥30 ng/mL' },
  { names: ['hemoglobin', 'hb', 'hgb'], label: 'Hemoglobin', emoji: '🔴', criticalBelow: 11, idealLabel: '≥11 g/dL' },
  { names: ['tsh'], label: 'Thyroid', emoji: '🦋', idealLabel: '0.1-2.5 mIU/L' },
  { names: ['vitamin d', '25-oh'], label: 'Vitamin D', emoji: '☀️', criticalBelow: 30, idealLabel: '≥30 ng/mL' },
  { names: ['glucose', 'fasting glucose'], label: 'Blood Sugar', emoji: '🍬', idealLabel: '<95 mg/dL' },
  { names: ['hcg', 'beta-hcg', 'beta hcg'], label: 'HCG', emoji: '🤰', idealLabel: 'Rising' },
  { names: ['folate', 'folic acid'], label: 'Folate', emoji: '🥬', criticalBelow: 5, idealLabel: '≥5 ng/mL' },
  { names: ['vitamin b12', 'b12'], label: 'Vitamin B12', emoji: '💊', criticalBelow: 200, idealLabel: '≥200 pg/mL' },
  { names: ['platelets'], label: 'Platelets', emoji: '🩹', criticalBelow: 150, idealLabel: '≥150 k/µL' },
  { names: ['calcium'], label: 'Calcium', emoji: '🦴', idealLabel: '8.5-10.5 mg/dL' },
];

const statusColor = (status: string | null) => {
  switch (status) {
    case 'normal': case 'expected': return 'text-green-600';
    case 'abnormal': return 'text-amber-600';
    case 'critical': return 'text-red-600';
    default: return 'text-muted-foreground';
  }
};

const statusBg = (status: string | null) => {
  switch (status) {
    case 'abnormal': return 'bg-amber-50 dark:bg-amber-900/10';
    case 'critical': return 'bg-red-50 dark:bg-red-900/10';
    default: return '';
  }
};

export default function PregnancyLabInsights() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [labs, setLabs] = useState<LabItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('medical_extracted_data')
        .select('title, value, unit, reference_range, status')
        .eq('user_id', user.id)
        .eq('data_type', 'lab_result');
      if (data) setLabs(data);
      setLoading(false);
    };
    load();
  }, [user]);

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
  const flagged = tested.filter(m => m.result?.status === 'abnormal' || m.result?.status === 'critical');

  if (labs.length === 0) {
    return (
      <Card className="p-4 border-dashed">
        <div className="text-center space-y-2">
          <Upload className="h-6 w-6 text-primary mx-auto" />
          <p className="text-sm font-semibold">Upload your blood tests</p>
          <p className="text-[10px] text-muted-foreground">Get personalized pregnancy health insights from your lab results</p>
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

      {/* Flagged items alert */}
      {flagged.length > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
          <p className="text-[10px] text-amber-700 dark:text-amber-400">
            {flagged.length} result{flagged.length !== 1 ? 's' : ''} need{flagged.length === 1 ? 's' : ''} attention for pregnancy
          </p>
        </div>
      )}

      {/* Tested results */}
      <div className="space-y-1.5">
        {tested.map(item => {
          const r = item.result!;
          return (
            <div key={item.label} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${statusBg(r.status)}`}>
              <span className="text-sm flex-shrink-0">{item.emoji}</span>
              <span className="text-xs font-medium flex-1 min-w-0 truncate">{item.label}</span>
              <span className={`text-xs font-mono font-bold ${statusColor(r.status)}`}>
                {r.value}{r.unit ? ` ${r.unit}` : ''}
              </span>
              {r.status === 'normal' || r.status === 'expected' ? (
                <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
              ) : r.status === 'abnormal' || r.status === 'critical' ? (
                <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Missing important tests */}
      {missing.length > 0 && missing.length <= 5 && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Not yet tested:</p>
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
