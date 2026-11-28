import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import UserMenu from '@/components/UserMenu';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/integrations/db/client';
import { onHealthDataChange } from '@/lib/data-events';
import { useAccountDataVersion } from '@/lib/account-data';
import { healthTone } from '@/lib/medical-utils';
import {
  buildHealthOverview,
  sparkGeometry,
  type LabRow,
  type OverviewMetric,
  type RangeState,
} from '@/lib/healthOverview';

// Me -> Health overview: her key numbers over time, for any life stage.
// Reads only what the app already stores (logic in src/lib/healthOverview.ts):
// period_tracking and current_extracted_data from the account, the weight
// and blood-pressure logs from their local copies (synced with the account
// by src/lib/account-data.ts).

const W = 120;
const H = 32;

const readJson = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDate = (d: string) => `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;

const STATE_LABEL: Record<RangeState, string | null> = {
  in: 'In range',
  low: 'Below range',
  high: 'Above range',
  out: 'Out of range',
  none: null,
};

function Sparkline({ metric }: { metric: OverviewMetric }) {
  const series = metric.secondary ? [metric.points, metric.secondary] : [metric.points];
  const g = sparkGeometry(series, metric.range, W, H);
  if (!g) return null;
  const outside = metric.state === 'low' || metric.state === 'high' || metric.state === 'out';
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0 overflow-visible">
      {g.band && <rect x={0} y={g.band.y1} width={W} height={Math.max(1, g.band.y2 - g.band.y1)} className="fill-muted" />}
      {g.paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={i === 0 ? 'stroke-primary' : 'stroke-primary/50'}
        />
      ))}
      <circle cx={g.end.x} cy={g.end.y} r={2.5} className={outside ? 'fill-destructive' : 'fill-primary'} />
    </svg>
  );
}

function MetricRow({ metric, onOpen }: { metric: OverviewMetric; onOpen: () => void }) {
  const label = STATE_LABEL[metric.state];
  const outside = metric.state === 'low' || metric.state === 'high' || metric.state === 'out';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-muted/40 focus-visible:bg-muted/40 outline-none"
      data-testid={`overview-${metric.id}`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{metric.label}</p>
        <p className="text-base font-semibold tabular-nums">
          {metric.last.display}
          {metric.unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{metric.unit}</span>}
          {metric.last.check && (
            <span className="ml-2 text-[10px] font-medium text-muted-foreground" title="This number could be read two ways (for example 1,250). Check it on the report.">
              check value
            </span>
          )}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {niceDate(metric.last.date)}
          {metric.rangeText && <> · range {metric.rangeText}</>}
          {metric.points.length > 1 && <> · {metric.points.length} readings</>}
        </p>
        {label && (
          <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${outside ? healthTone.watch.badge : healthTone.ok.badge}`}>
            {label}
          </span>
        )}
      </div>
      <Sparkline metric={metric} />
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

export default function HealthOverview() {
  usePageTitle('Health overview');
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [labs, setLabs] = useState<LabRow[]>([]);
  const [periodStarts, setPeriodStarts] = useState<unknown[]>([]);
  const [loaded, setLoaded] = useState(false);

  const uid = user?.id;
  const keys = uid ? [`womanie_preg_weight_log_${uid}`, `womanie_maternal_weight_${uid}`, `womanie_bp_log_${uid}`] : [];
  const localVersion = useAccountDataVersion(keys);

  const load = useCallback(async () => {
    if (!uid) return;
    const [labRes, periodRes] = await Promise.all([
      db.from('current_extracted_data')
        .select('title, value, unit, reference_range, status, date_recorded, document_id, raw_data')
        .eq('user_id', uid),
      db.from('period_tracking')
        .select('period_start_date')
        .eq('user_id', uid)
        .order('period_start_date', { ascending: true }),
    ]);
    setLabs(((labRes.data ?? []) as LabRow[]));
    setPeriodStarts(((periodRes.data ?? []) as Array<{ period_start_date: unknown }>).map(r => r.period_start_date));
    setLoaded(true);
  }, [uid]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => onHealthDataChange(() => { void load(); }), [load]);

  const metrics = useMemo(() => {
    if (!uid) return [];
    void localVersion; // re-read the local logs after an account sync
    return buildHealthOverview({
      labs,
      periodStarts,
      pregWeightLog: readJson(`womanie_preg_weight_log_${uid}`),
      maternalWeight: readJson(`womanie_maternal_weight_${uid}`),
      bpLog: readJson(`womanie_bp_log_${uid}`),
    });
  }, [uid, labs, periodStarts, localVersion]);

  const outside = metrics.filter(m => m.state === 'low' || m.state === 'high' || m.state === 'out').length;
  const ranged = metrics.filter(m => m.state !== 'none').length;

  return (
    <main className="min-h-screen bg-background">
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center gap-3 max-w-2xl mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/dashboard/settings')} aria-label="Back to Me">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h1 className="text-base font-bold">Health overview</h1>
          </div>
          <UserMenu />
        </div>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
        {authLoading || (uid && !loaded) ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : !uid ? (
          <Card className="p-4 text-sm text-muted-foreground">Log in to see your health overview.</Card>
        ) : metrics.length === 0 ? (
          <Card className="p-5 space-y-2" data-testid="overview-empty">
            <p className="text-sm font-semibold">Nothing to chart yet</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your numbers appear here as you add them: log two periods to see your cycle length, log weight or blood
              pressure, or upload a lab report (ferritin, TSH, vitamin D and other key tests are picked up automatically).
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard/medical-history')}>Upload a report</Button>
          </Card>
        ) : (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Your key numbers over time, each with the last reading and the range it is judged against (the lab's own
              reference range for lab tests).{' '}
              {outside > 0 ? `${outside} ${outside === 1 ? 'is' : 'are'} outside the range at the last reading.` : ranged > 0 ? 'Every last reading with a range is inside it.' : ''}
              {' '}Tap a row to open the record.
            </p>
            <Card className="divide-y divide-border overflow-hidden p-0" data-testid="overview-list">
              {metrics.map(m => (
                <MetricRow key={m.id} metric={m} onOpen={() => navigate(m.link)} />
              ))}
            </Card>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Ranges are a guide, not a diagnosis. A value just outside the range is common and can be normal for you;
              talk to your doctor about what your numbers mean.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
