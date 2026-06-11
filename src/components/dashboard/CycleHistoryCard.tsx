import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/integrations/db/client';
import { onHealthDataChange } from '@/lib/data-events';
import { differenceInDays, format, parseISO, subMonths } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Activity, AlertCircle } from 'lucide-react';

// Cycle-length history chart for menstrual / conception / contraception
// modes. Pulls period_tracking rows from the last 12 months, computes
// cycle length from consecutive period starts (not the cycle_length
// column directly — that's the user's logged guess and may be stale),
// and plots them as a small bar chart.
//
// Variability is what most users actually care about: "am I regular,
// am I irregular, is anything trending". We report mean, range, and a
// standard-deviation-based regularity label.

interface CycleHistoryCardProps {
  // Hidden when the user has fewer than 2 logged periods (no cycle to
  // measure). The page should pass null until period data is loaded.
  enabled?: boolean;
}

interface PeriodRow {
  id?: string;
  period_start_date: string;
  cycle_length: number | null;
}

interface Cycle {
  index: number;        // 1 = oldest
  startDate: string;    // YYYY-MM-DD
  lengthDays: number;
}

const CycleHistoryCard = ({ enabled = true }: CycleHistoryCardProps) => {
  const { user } = useAuth();
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoaded(false);
    try {
      const cutoff = format(subMonths(new Date(), 12), 'yyyy-MM-dd');
      const { data } = await db
        .from('period_tracking')
        .select('id, period_start_date, cycle_length')
        .eq('user_id', user.id)
        .gte('period_start_date', cutoff)
        .order('period_start_date', { ascending: true });
      setRows(((data as PeriodRow[]) || []));
    } catch (e) {
      console.error('CycleHistoryCard load error:', e);
      setRows([]);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    return onHealthDataChange(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const cycles = useMemo<Cycle[]>(() => {
    if (rows.length < 2) return [];
    const out: Cycle[] = [];
    for (let i = 1; i < rows.length; i++) {
      const prev = parseISO(rows[i - 1].period_start_date);
      const curr = parseISO(rows[i].period_start_date);
      const len = differenceInDays(curr, prev);
      // Drop pathologically short or long entries — likely a misclick
      // (e.g. someone re-logged a single period). Clinical sense
      // bounds: 14-90 days.
      if (len < 14 || len > 90) continue;
      out.push({
        index: out.length + 1,
        startDate: rows[i - 1].period_start_date,
        lengthDays: len,
      });
    }
    return out;
  }, [rows]);

  const stats = useMemo(() => {
    if (cycles.length === 0) {
      return { mean: 0, min: 0, max: 0, stdDev: 0, regularity: null as null | string, regularityTone: '' };
    }
    const mean = cycles.reduce((s, c) => s + c.lengthDays, 0) / cycles.length;
    const min = Math.min(...cycles.map(c => c.lengthDays));
    const max = Math.max(...cycles.map(c => c.lengthDays));
    const variance = cycles.reduce((s, c) => s + (c.lengthDays - mean) ** 2, 0) / cycles.length;
    const stdDev = Math.sqrt(variance);
    // ACOG considers cycles "regular" within ±2 days variation; "fairly
    // regular" within ±5; beyond that, irregular.
    let regularity: string;
    let regularityTone: string;
    if (cycles.length < 3) {
      regularity = 'Not enough data';
      regularityTone = 'text-muted-foreground';
    } else if (stdDev <= 2) {
      regularity = 'Very regular';
      regularityTone = 'text-green-600 dark:text-green-400';
    } else if (stdDev <= 5) {
      regularity = 'Mostly regular';
      regularityTone = 'text-emerald-600 dark:text-emerald-400';
    } else if (stdDev <= 8) {
      regularity = 'Somewhat irregular';
      regularityTone = 'text-amber-600 dark:text-amber-400';
    } else {
      regularity = 'Irregular';
      regularityTone = 'text-destructive';
    }
    return { mean, min, max, stdDev, regularity, regularityTone };
  }, [cycles]);

  // Color each bar by how far it is from the user's mean — outliers
  // pop visually so the user can see which cycles were unusual.
  const barColor = (lengthDays: number): string => {
    if (cycles.length === 0) return 'hsl(var(--primary))';
    const diff = Math.abs(lengthDays - stats.mean);
    if (diff <= 2) return 'hsl(var(--primary))';
    if (diff <= 5) return 'hsl(var(--secondary))';
    return 'hsl(var(--destructive))';
  };

  if (!enabled || !loaded) return null;
  if (cycles.length === 0) {
    // Hide entirely when there's nothing to plot rather than show an
    // empty card — the CycleCalendar above already handles the
    // "log your first period" empty state.
    return null;
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Cycle history
        </h4>
        {stats.regularity && (
          <Badge variant="outline" className={`text-[10px] ${stats.regularityTone}`}>
            {stats.regularity}
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {cycles.length} cycle{cycles.length === 1 ? '' : 's'} logged in the last 12 months.
      </p>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-muted/50 rounded-lg p-2.5">
          <div className="text-[10px] text-muted-foreground">Average</div>
          <div className="text-sm font-semibold">{stats.mean.toFixed(1)} days</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2.5">
          <div className="text-[10px] text-muted-foreground">Range</div>
          <div className="text-sm font-semibold">{stats.min}–{stats.max} days</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2.5">
          <div className="text-[10px] text-muted-foreground">Variability (σ)</div>
          <div className="text-sm font-semibold">±{stats.stdDev.toFixed(1)} days</div>
        </div>
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={cycles} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="index"
              tick={{ fontSize: 10 }}
              label={{ value: 'Cycle', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              width={40}
              domain={['dataMin - 2', 'dataMax + 2']}
              label={{ value: 'Days', angle: -90, position: 'insideLeft', offset: 16, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number) => [`${value} days`, 'Length']}
              labelFormatter={(idx) => {
                const c = cycles[Number(idx) - 1];
                return c ? `Cycle ${idx} — started ${format(parseISO(c.startDate), 'MMM d, yyyy')}` : `Cycle ${idx}`;
              }}
            />
            <ReferenceLine
              y={stats.mean}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
              label={{ value: 'avg', position: 'right', fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            />
            <Bar dataKey="lengthDays" radius={[4, 4, 0, 0]}>
              {cycles.map((c, i) => (
                <Cell key={`cell-${i}`} fill={barColor(c.lengthDays)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground gap-2 pt-1 border-t">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ background: 'hsl(var(--primary))' }} />
          within 2 days of avg
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ background: 'hsl(var(--secondary))' }} />
          within 5 days
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ background: 'hsl(var(--destructive))' }} />
          outlier
        </span>
      </div>

      {stats.regularity === 'Irregular' && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Cycles vary by more than ±8 days. Conditions like PCOS, thyroid issues, or stress
            can drive irregularity — worth flagging at your next visit.
          </p>
        </div>
      )}
    </Card>
  );
};

export default CycleHistoryCard;
