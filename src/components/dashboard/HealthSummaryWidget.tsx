import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  HeartPulse,
  ArrowRight,
  FileText,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';

interface ExtractedItem {
  title: string;
  value: string | null;
  unit: string | null;
  status: string | null;
  data_type: string;
  date_recorded: string | null;
}

export default function HealthSummaryWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<ExtractedItem[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [medRes, docRes] = await Promise.all([
        supabase.from('medical_extracted_data').select('title, value, unit, status, data_type, date_recorded').eq('user_id', user.id),
        supabase.from('health_documents').select('id').eq('user_id', user.id),
      ]);
      if (medRes.data) setData(medRes.data);
      if (docRes.data) setDocCount(docRes.data.length);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading) return null;

  // No documents uploaded yet
  if (docCount === 0) {
    return (
      <Card className="p-4 mb-6 border-dashed">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Upload health documents</p>
            <p className="text-xs text-muted-foreground">Get AI-powered analysis of your lab results, prescriptions, and medical records</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate('/dashboard/medical-history')}>
            Get started
          </Button>
        </div>
      </Card>
    );
  }

  const labs = data.filter(d => d.data_type === 'lab_result');
  const normalCount = labs.filter(d => d.status === 'normal' || d.status === 'expected').length;
  const abnormalCount = labs.filter(d => d.status === 'abnormal').length;
  const criticalCount = labs.filter(d => d.status === 'critical').length;
  const healthScore = labs.length > 0 ? Math.round((normalCount / labs.length) * 100) : null;
  const conditions = data.filter(d => d.data_type === 'condition' && d.status === 'active');

  // Top 3 flagged items
  const flagged = labs.filter(d => d.status === 'abnormal' || d.status === 'critical').slice(0, 3);

  return (
    <Card className="p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-bold">Health Overview</h3>
        </div>
        <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => navigate('/dashboard/medical-history')}>
          View all <ArrowRight className="h-3 w-3" />
        </Button>
      </div>

      <div className="space-y-3">
        {/* Score + stats row */}
        <div className="flex items-center gap-4">
          {healthScore !== null && (
            <div className="flex-shrink-0 text-center">
              <p className={`text-2xl font-bold ${
                healthScore >= 80 ? 'text-green-600' : healthScore >= 50 ? 'text-amber-600' : 'text-red-600'
              }`}>{healthScore}%</p>
              <p className="text-[9px] text-muted-foreground">wellness</p>
            </div>
          )}
          <div className="flex-1 space-y-1.5">
            {healthScore !== null && <Progress value={healthScore} className="h-1.5" />}
            <div className="flex gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-3 w-3" /> {normalCount} healthy
              </span>
              {abnormalCount > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3 w-3" /> {abnormalCount} to discuss
                </span>
              )}
              {criticalCount > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertTriangle className="h-3 w-3" /> {criticalCount} urgent
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Flagged items preview */}
        {flagged.length > 0 && (
          <div className="space-y-1.5">
            {flagged.map((item, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg ${
                item.status === 'critical'
                  ? 'bg-red-50 dark:bg-red-900/15 text-red-700 dark:text-red-400'
                  : 'bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-400'
              }`}>
                <span>{item.status === 'critical' ? '🔴' : '⚠️'}</span>
                <span className="font-medium">{item.title}</span>
                {item.value && (
                  <span className="font-mono ml-auto">{item.value}{item.unit ? ` ${item.unit}` : ''}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Conditions */}
        {conditions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {conditions.slice(0, 3).map((c, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {c.title}
              </span>
            ))}
          </div>
        )}

        {/* Documents count */}
        <p className="text-[10px] text-muted-foreground">
          Based on {docCount} document{docCount !== 1 ? 's' : ''} • {labs.length} test result{labs.length !== 1 ? 's' : ''}
        </p>
      </div>
    </Card>
  );
}
