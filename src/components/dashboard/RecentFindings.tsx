import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, AlertCircle, ArrowRight, Activity, MessageCircle } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { formatDistanceToNow } from 'date-fns';

// Surfaces critical and abnormal lab/finding values from the user's most
// recent document analyses, so the important stuff is on the dashboard
// instead of buried inside Health Records. Hidden when there's nothing
// to show. Re-fetches on every health-data event.

interface Finding {
  id: string;
  document_id: string | null;
  title: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  data_type: string;
  date_recorded: string | null;
  notes: string | null;
}

const MAX_VISIBLE = 5;

const statusRank = (s: string | null): number => {
  switch (s) {
    case 'critical': return 0;
    case 'abnormal': return 1;
    default: return 2;
  }
};

const statusBadge = (s: string | null) => {
  if (s === 'critical') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200 text-[10px] font-semibold uppercase tracking-wide">
        <AlertTriangle className="h-3 w-3" /> Critical
      </span>
    );
  }
  if (s === 'abnormal') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 text-[10px] font-semibold uppercase tracking-wide">
        <AlertCircle className="h-3 w-3" /> Attention
      </span>
    );
  }
  return null;
};

export default function RecentFindings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    // Pull the user's current-analysis findings and keep only the ones
    // that actually deserve attention.
    const { data } = await db
      .from('current_extracted_data')
      .select('id, document_id, title, value, unit, reference_range, status, data_type, date_recorded, notes')
      .eq('user_id', user.id);
    const rows = (data ?? []) as Finding[];
    const flagged = rows.filter(r => r.status === 'critical' || r.status === 'abnormal');
    flagged.sort((a, b) => {
      const r = statusRank(a.status) - statusRank(b.status);
      if (r !== 0) return r;
      const aDate = a.date_recorded ? Date.parse(a.date_recorded) : 0;
      const bDate = b.date_recorded ? Date.parse(b.date_recorded) : 0;
      return bDate - aDate;
    });
    setFindings(flagged);
    setLoaded(true);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => onHealthDataChange(load), [load]);

  const visible = useMemo(() => findings.slice(0, MAX_VISIBLE), [findings]);
  const hiddenCount = findings.length - visible.length;

  if (!loaded || findings.length === 0) return null;

  const criticalCount = findings.filter(f => f.status === 'critical').length;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Results that need attention</p>
            <p className="text-[11px] text-muted-foreground">
              {findings.length} flagged across your documents
              {criticalCount > 0 ? ` · ${criticalCount} critical` : ''}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs gap-1 h-7"
          onClick={() => navigate('/dashboard/medical-history')}
        >
          View all <ArrowRight className="h-3 w-3" />
        </Button>
      </div>

      <ul className="space-y-2">
        {visible.map(f => {
          const agoLabel = f.date_recorded
            ? formatDistanceToNow(new Date(f.date_recorded), { addSuffix: true })
            : null;
          return (
            <li
              key={f.id}
              className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 group"
            >
              <button
                type="button"
                className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                onClick={() => navigate(f.document_id ? `/dashboard/medical-history?doc=${f.document_id}` : '/dashboard/medical-history')}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{f.title}</span>
                  {statusBadge(f.status)}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {f.value != null && (
                    <span className="font-medium text-foreground/80">
                      {f.value}
                      {f.unit ? ` ${f.unit}` : ''}
                    </span>
                  )}
                  {f.reference_range && (
                    <span className="ml-1">· ref {f.reference_range}</span>
                  )}
                  {agoLabel && <span className="ml-1">· {agoLabel}</span>}
                </p>
                {f.notes && (
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{f.notes}</p>
                )}
              </button>
              <button
                type="button"
                className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] text-primary hover:underline opacity-70 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  const valueBit = f.value ? `${f.value}${f.unit ? ' ' + f.unit : ''}` : '';
                  const q = valueBit
                    ? `What does my ${f.title} of ${valueBit} mean for me?`
                    : `What does my ${f.title} result mean for me?`;
                  navigate(`/dashboard/ai-doctor?q=${encodeURIComponent(q)}`);
                }}
                aria-label={`Ask AI about ${f.title}`}
              >
                <MessageCircle className="h-3 w-3" />
                Ask
              </button>
            </li>
          );
        })}
      </ul>

      {hiddenCount > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2 text-center">
          + {hiddenCount} more in Health Records
        </p>
      )}
    </Card>
  );
}
