import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Minus, ArrowRight, Sparkles, MessageCircle } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { computeTrends, type ExtractedItem, type TrendRow } from '@/lib/health-trends';
import { format } from 'date-fns';

// Cross-document trend view.
//
// `current_extracted_data` is the user's latest analysis per document.
// For any test that appears in two or more documents with parseable
// numeric values and dates, we show the most recent reading next to the
// previous one plus a direction arrow and (when the status flipped) an
// improved/worsening hint. Hidden entirely when we don't have enough
// data to say anything interesting. This gives Alena visibility into
// *change over time* right on the dashboard — something the per-doc
// view in Health Records doesn't do.

const MAX_VISIBLE = 6;

function DirectionIcon({ direction, shift }: { direction: TrendRow['direction']; shift: TrendRow['statusShift'] }) {
  const color =
    shift === 'improved' ? 'text-green-600' :
    shift === 'worsened' ? 'text-red-600' :
    'text-muted-foreground';
  if (direction === 'up') return <TrendingUp className={`h-4 w-4 ${color}`} />;
  if (direction === 'down') return <TrendingDown className={`h-4 w-4 ${color}`} />;
  return <Minus className={`h-4 w-4 ${color}`} />;
}

function ShiftBadge({ shift }: { shift: TrendRow['statusShift'] }) {
  if (shift === 'improved') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200 text-[10px] font-semibold uppercase tracking-wide">
        Improved
      </span>
    );
  }
  if (shift === 'worsened') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 text-[10px] font-semibold uppercase tracking-wide">
        Worsening
      </span>
    );
  }
  return null;
}

export default function HealthTrends() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from('current_extracted_data')
      .select('title, value, unit, status, data_type, date_recorded, document_id')
      .eq('user_id', user.id);
    const rows = (data ?? []) as ExtractedItem[];
    setTrends(computeTrends(rows));
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const visible = useMemo(() => trends.slice(0, MAX_VISIBLE), [trends]);

  if (!loaded || trends.length === 0) return null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-secondary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Your trends</p>
            <p className="text-[11px] text-muted-foreground">
              How your results have changed across {trends.length === 1 ? 'this test' : `${trends.length} tests`}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs gap-1 h-7"
          onClick={() => navigate('/dashboard/medical-history')}
        >
          Full history <ArrowRight className="h-3 w-3" />
        </Button>
      </div>

      <ul className="space-y-2">
        {visible.map(t => {
          const unit = t.unit ? ` ${t.unit}` : '';
          const pct = Math.round(t.pctChange);
          return (
            <li
              key={t.title}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 group"
            >
              <DirectionIcon direction={t.direction} shift={t.statusShift} />
              <button
                type="button"
                className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                onClick={() => navigate(
                  t.latestDocumentId
                    ? `/dashboard/medical-history?doc=${t.latestDocumentId}`
                    : '/dashboard/medical-history'
                )}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{t.title}</span>
                  <ShiftBadge shift={t.statusShift} />
                  {t.count > 2 && (
                    <span className="text-[10px] text-muted-foreground">
                      · {t.count} readings
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">
                    {t.latestRawValue}{unit}
                  </span>
                  <span className="mx-1">↑ from {t.prevRawValue}{unit}</span>
                  {t.direction !== 'flat' && (
                    <span className="ml-1">
                      ({pct > 0 ? '+' : ''}{pct}%)
                    </span>
                  )}
                  <span className="ml-1">
                    · {format(new Date(t.prevDate), 'MMM d')} → {format(new Date(t.latestDate), 'MMM d')}
                  </span>
                </p>
              </button>
              <button
                type="button"
                className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] text-primary hover:underline opacity-70 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1 py-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  const direction =
                    t.statusShift === 'improved' ? 'improved' :
                    t.statusShift === 'worsened' ? 'got worse' :
                    t.direction === 'up' ? 'went up' :
                    t.direction === 'down' ? 'went down' : 'changed';
                  const q = `My ${t.title} ${direction} from ${t.prevRawValue}${unit} to ${t.latestRawValue}${unit}. What does this mean for me?`;
                  navigate(`/dashboard/ai-doctor?q=${encodeURIComponent(q)}`);
                }}
                aria-label={`Ask AI about ${t.title} trend`}
              >
                <MessageCircle className="h-3 w-3" />
                Ask
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
