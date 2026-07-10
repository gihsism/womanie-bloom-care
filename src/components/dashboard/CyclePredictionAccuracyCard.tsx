import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Target, Info } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { format } from 'date-fns';
import { scorePredictions, type ScoredPrediction } from '@/lib/prediction-accuracy';
import type { LifeStage } from './DashboardHeader';

// Builds trust in the cycle predictor by retrospectively scoring it.
//
// For each of the last few logged periods, take the cycles *before*
// that period as the only data the predictor would have had, compute
// the median cycle length from that history, project the next start
// date, and compare to what actually happened. A user who's seen
// the predictor land within a day or two on their last three cycles
// will read the forward-looking prediction very differently than
// one staring at a window that's never been tested.
//
// Hidden until there are at least 4 logged periods (= 3 cycle gaps =
// at least 2 scoreable predictions). Hidden in non-cycle modes.

interface PeriodRow {
  period_start_date: string;
}

const RELEVANT_MODES: LifeStage[] = [
  'menstrual-cycle', 'conception', 'pre-menstrual', 'contraception',
];

interface Props {
  mode: LifeStage;
}

export default function CyclePredictionAccuracyCard({ mode }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from('period_tracking')
      .select('period_start_date')
      .eq('user_id', user.id)
      .order('period_start_date', { ascending: true });
    setRows((data ?? []) as PeriodRow[]);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const scored = useMemo<ScoredPrediction[]>(
    () => scorePredictions(rows.map(r => r.period_start_date)),
    [rows]
  );

  if (!RELEVANT_MODES.includes(mode)) return null;
  if (!loaded) return null;
  if (scored.length < 2) return null;

  // Average absolute error gives the headline "average ±N days" stat.
  const meanAbsError = scored.reduce((s, p) => s + Math.abs(p.deltaDays), 0) / scored.length;

  // Within-window rate: how many landed within 2 days of prediction.
  const withinTwo = scored.filter(p => Math.abs(p.deltaDays) <= 2).length;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Target className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">How accurate has the predictor been?</p>
          <p className="text-[11px] text-muted-foreground">
            Replays your last {scored.length} predictions against what actually happened
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3 px-2">
        <div className="flex-1">
          <p className="text-2xl font-bold tabular-nums">±{meanAbsError.toFixed(1)}d</p>
          <p className="text-[10px] text-muted-foreground">average error</p>
        </div>
        <div className="flex-1">
          <p className="text-2xl font-bold tabular-nums">{withinTwo}/{scored.length}</p>
          <p className="text-[10px] text-muted-foreground">within ±2 days</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {scored.map((p, i) => {
          const sign = p.deltaDays > 0 ? '+' : p.deltaDays < 0 ? '−' : '±';
          const abs = Math.abs(p.deltaDays);
          const tone =
            abs <= 1 ? 'text-green-700 dark:text-green-300'
            : abs <= 3 ? 'text-amber-700 dark:text-amber-300'
            : 'text-red-700 dark:text-red-300';
          const lineNote =
            abs === 0 ? 'spot on'
            : p.deltaDays > 0 ? `${abs} ${abs === 1 ? 'day' : 'days'} later than predicted`
            : `${abs} ${abs === 1 ? 'day' : 'days'} earlier than predicted`;
          return (
            <div key={i} className="flex items-center gap-2 text-xs border-b border-border/40 pb-1.5 last:border-b-0 last:pb-0">
              <span className="text-muted-foreground tabular-nums w-20">
                {format(p.actual, 'MMM d')}
              </span>
              <span className="text-muted-foreground flex-1">
                predicted {format(p.predicted, 'MMM d')}
              </span>
              <span className={`tabular-nums font-medium ${tone}`}>
                {sign}{abs}d
              </span>
              <span className="text-[10px] text-muted-foreground hidden sm:inline">
                {lineNote}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3 flex items-start gap-1.5">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <span>
          {meanAbsError <= 1.5
            ? 'Predictor is dialled in — your cycle has been very predictable.'
            : meanAbsError <= 3.5
              ? 'Predictor is broadly accurate, with natural cycle-to-cycle variation. The current forecast window reflects this.'
              : 'Predictions have varied — review Cycle History for any outlier cycles or check whether labs (TSH, FSH, PCOS pattern) might be affecting timing.'}
        </span>
      </p>
    </Card>
  );
}
