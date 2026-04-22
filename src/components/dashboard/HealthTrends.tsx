import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Minus, ArrowRight, Sparkles } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
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

interface ExtractedItem {
  title: string;
  value: string | null;
  unit: string | null;
  status: string | null;
  data_type: string;
  date_recorded: string | null;
}

interface TrendRow {
  title: string;
  unit: string | null;
  latestValue: number;
  latestRawValue: string;
  latestStatus: string | null;
  latestDate: string;
  prevValue: number;
  prevRawValue: string;
  prevStatus: string | null;
  prevDate: string;
  count: number;
  direction: 'up' | 'down' | 'flat';
  pctChange: number;
  statusShift: 'improved' | 'worsened' | 'same';
}

const MAX_VISIBLE = 6;
const FLAT_THRESHOLD_PCT = 2; // under ±2% we treat as flat

const SEVERITY: Record<string, number> = {
  critical: 3,
  abnormal: 2,
  normal: 1,
  expected: 1,
  informational: 0,
};

function parseNumeric(raw: string | null): number | null {
  if (raw == null) return null;
  const match = String(raw).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = parseFloat(match[0]);
  return Number.isFinite(n) ? n : null;
}

function statusShift(prev: string | null, next: string | null): TrendRow['statusShift'] {
  const p = SEVERITY[prev ?? 'informational'] ?? 0;
  const n = SEVERITY[next ?? 'informational'] ?? 0;
  if (n < p) return 'improved';
  if (n > p) return 'worsened';
  return 'same';
}

function computeTrends(rows: ExtractedItem[]): TrendRow[] {
  const labs = rows.filter(r =>
    r.data_type === 'lab_result' && r.title && r.value && r.date_recorded
  );

  const byTitle = new Map<string, ExtractedItem[]>();
  for (const r of labs) {
    const list = byTitle.get(r.title) ?? [];
    list.push(r);
    byTitle.set(r.title, list);
  }

  const trends: TrendRow[] = [];
  for (const [title, list] of byTitle) {
    // Drop anything we can't parse; sort newest-first.
    const parsed = list
      .map(r => ({
        item: r,
        n: parseNumeric(r.value),
        t: r.date_recorded ? Date.parse(r.date_recorded) : NaN,
      }))
      .filter(x => x.n != null && Number.isFinite(x.t))
      .sort((a, b) => b.t - a.t);
    if (parsed.length < 2) continue;

    const latest = parsed[0];
    const prev = parsed[1];
    const latestValue = latest.n as number;
    const prevValue = prev.n as number;
    const pctChange = prevValue === 0
      ? 0
      : ((latestValue - prevValue) / Math.abs(prevValue)) * 100;

    let direction: TrendRow['direction'];
    if (Math.abs(pctChange) < FLAT_THRESHOLD_PCT) direction = 'flat';
    else direction = latestValue > prevValue ? 'up' : 'down';

    trends.push({
      title,
      unit: latest.item.unit,
      latestValue,
      latestRawValue: String(latest.item.value),
      latestStatus: latest.item.status,
      latestDate: latest.item.date_recorded as string,
      prevValue,
      prevRawValue: String(prev.item.value),
      prevStatus: prev.item.status,
      prevDate: prev.item.date_recorded as string,
      count: parsed.length,
      direction,
      pctChange,
      statusShift: statusShift(prev.item.status, latest.item.status),
    });
  }

  // Rank: status shifts first (improved/worsened both interesting),
  // then larger absolute % changes, then recency of the latest reading.
  trends.sort((a, b) => {
    const aShift = a.statusShift === 'same' ? 1 : 0;
    const bShift = b.statusShift === 'same' ? 1 : 0;
    if (aShift !== bShift) return aShift - bShift;
    const absDelta = Math.abs(b.pctChange) - Math.abs(a.pctChange);
    if (Math.abs(absDelta) > 1) return absDelta;
    return Date.parse(b.latestDate) - Date.parse(a.latestDate);
  });

  return trends;
}

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
      .select('title, value, unit, status, data_type, date_recorded')
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
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 cursor-pointer"
              onClick={() => navigate('/dashboard/medical-history')}
            >
              <DirectionIcon direction={t.direction} shift={t.statusShift} />
              <div className="flex-1 min-w-0">
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
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
