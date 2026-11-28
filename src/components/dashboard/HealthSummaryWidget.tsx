import { useCallback, useEffect, useState } from 'react';
import { withinWindow } from '@/lib/labWindow';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { summarizeResults, summaryHeadline, summaryChanges } from '@/lib/resultsSummary';
import { HeartPulse, ArrowRight } from 'lucide-react';

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
      db.from('current_extracted_data').select('title, value, unit, status, data_type, date_recorded').eq('user_id', user.id),
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

  // Facts only, no score (resultsSummary): how many latest results the lab
  // marked outside its range, and how many crossed it since the test
  // before. The list itself is "Talk to your doctor about" on this page,
  // so the card links there instead of repeating it.
  const labRows = data.filter(d => d.data_type === 'lab_result');
  const summary = summarizeResults(labRows);
  const changes = summaryChanges(summary);
  const conditions = data.filter(d => d.data_type === 'condition' && d.status === 'active');
  const goTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else navigate(`/dashboard/medical-history#${id}`);
  };

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
        {/* Plain summary, linking to the list */}
        {summary.total > 0 && (
          <button
            type="button"
            onClick={() => goTo(summary.outside > 0 ? 'attention' : 'results')}
            className="w-full text-left text-sm hover:underline underline-offset-2"
            data-testid="results-summary"
          >
            <span className={summary.outside > 0 ? 'text-destructive' : 'text-muted-foreground'}>{summaryHeadline(summary)}</span>
            {changes && <span className="text-muted-foreground"> · {changes}</span>}
          </button>
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
          Based on {docCount} document{docCount !== 1 ? 's' : ''} • {summary.total} test result{summary.total !== 1 ? 's' : ''}
        </p>
      </div>
    </Card>
  );
}
