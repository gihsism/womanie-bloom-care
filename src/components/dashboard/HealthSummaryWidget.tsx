import { useCallback, useEffect, useState } from 'react';
import { withinWindow } from '@/lib/labWindow';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import {
  HeartPulse,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

interface ExtractedItem {
  title: string;
  value: string | null;
  unit: string | null;
  status: string | null;
  data_type: string;
  date_recorded: string | null;
}

/** `showViewAll` hides the link to Health Records when the card is already on that page. */
export default function HealthSummaryWidget({ since = null, showViewAll = true }: { since?: Date | null; showViewAll?: boolean } = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<ExtractedItem[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const [medRes, docRes] = await Promise.all([
      db.from('medical_extracted_data').select('title, value, unit, status, data_type, date_recorded').eq('user_id', user.id),
      db.from('health_documents').select('id').eq('user_id', user.id),
    ]);
    if (medRes.data) setData(withinWindow(medRes.data as ExtractedItem[], since));
    if (docRes.data) setDocCount(docRes.data.length);
    setLoading(false);
  }, [user, since]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => onHealthDataChange(load), [load]);

  if (loading) return null;

  // No documents yet: stay hidden. The Getting-started checklist and the
  // upload card further down already ask for the first document.
  if (docCount === 0) return null;

  const labs = data.filter(d => d.data_type === 'lab_result');
  const normalCount = labs.filter(d => d.status === 'normal' || d.status === 'expected').length;
  const abnormalCount = labs.filter(d => d.status === 'abnormal').length;
  const criticalCount = labs.filter(d => d.status === 'critical').length;
  const healthScore = labs.length > 0 ? Math.round((normalCount / labs.length) * 100) : null;
  const conditions = data.filter(d => d.data_type === 'condition' && d.status === 'active');


  return (
    <Card className="p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HeartPulse className="h-4 w-4 text-primary" aria-hidden="true" />
          <h3 className="text-base font-medium">Health Overview</h3>
        </div>
        {showViewAll && (
          <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => navigate('/dashboard/medical-history')}>
            View all <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {/* Score + stats row */}
        <div className="flex items-center gap-4">
          {healthScore !== null && (
            <div className="flex-shrink-0 text-center">
              <p className={`font-display text-2xl font-medium ${
                healthScore >= 80 ? 'text-muted-foreground' : healthScore >= 50 ? 'text-destructive' : 'text-destructive'
              }`}>{healthScore}%</p>
              <p className="text-[9px] text-muted-foreground">wellness</p>
            </div>
          )}
          <div className="flex-1 space-y-1.5">
            {healthScore !== null && <Progress value={healthScore} aria-label="Wellness score" className="h-1.5 bg-muted" indicatorClassName={healthScore >= 80 ? "bg-foreground/35" : healthScore >= 50 ? "bg-destructive/70" : "bg-destructive"} />}
            <div className="flex gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <CheckCircle2 className="h-3 w-3" /> {normalCount} healthy
              </span>
              {abnormalCount > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-3 w-3" /> {abnormalCount} to discuss
                </span>
              )}
              {criticalCount > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-3 w-3" /> {criticalCount} urgent
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Flagged results are listed once on Records ("Talk to your doctor
            about"); this card keeps only the overall picture. */}
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
