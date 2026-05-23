import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/integrations/db/client';
import { onHealthDataChange } from '@/lib/data-events';
import { Droplet, AlertCircle } from 'lucide-react';
import { format, parseISO, subMonths, differenceInDays } from 'date-fns';

// Period flow visualization for menstrual / conception modes. The
// DailyLogging form has had a flow selector forever (spotting / light
// / medium / heavy) that gets stamped into
// daily_health_signals.notes as "Flow: heavy" etc. Nothing read those
// back, so users couldn't see "is this period heavier than my usual"
// or "how long was my last flow at heavy".
//
// We render the last 3 cycles (anchored on period_tracking entries)
// with a per-day flow row underneath each.

interface PeriodFlowCardProps {
  // Hides the card entirely when there's no period to anchor against;
  // the CycleCalendar covers the empty case.
  lastPeriodStart: Date | null;
}

type FlowLevel = 'spotting' | 'light' | 'medium' | 'heavy';

const FLOW_TONE: Record<FlowLevel, { dot: string; label: string }> = {
  spotting: { dot: 'bg-pink-200 dark:bg-pink-900/60', label: 'Spotting' },
  light:    { dot: 'bg-pink-300 dark:bg-pink-800/80', label: 'Light' },
  medium:   { dot: 'bg-pink-500',                    label: 'Medium' },
  heavy:    { dot: 'bg-pink-700 dark:bg-pink-500',   label: 'Heavy' },
};

const SCAN_DAYS = 95; // ~3 cycles plus padding

function parseFlow(notes: string | null): FlowLevel | null {
  if (!notes) return null;
  const m = notes.match(/Flow:\s*(spotting|light|medium|heavy)/i);
  if (!m) return null;
  return m[1].toLowerCase() as FlowLevel;
}

interface PeriodRow {
  period_start_date: string;
  period_end_date: string | null;
}

interface FlowDay {
  date: string;
  level: FlowLevel | null;
  dayIndex: number; // 0-indexed day of period
}

interface FlowCycle {
  start: Date;
  end: Date | null;
  days: FlowDay[];
}

const PeriodFlowCard = ({ lastPeriodStart }: PeriodFlowCardProps) => {
  const { user } = useAuth();
  const [signals, setSignals] = useState<{ date: string; flow: FlowLevel }[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoaded(false);
    try {
      const cutoff = format(subMonths(new Date(), 4), 'yyyy-MM-dd');
      const [signalsRes, periodsRes] = await Promise.all([
        db
          .from('daily_health_signals')
          .select('signal_date, notes')
          .eq('user_id', user.id)
          .gte('signal_date', cutoff)
          .order('signal_date', { ascending: true }),
        db
          .from('period_tracking')
          .select('period_start_date, period_end_date')
          .eq('user_id', user.id)
          .gte('period_start_date', cutoff)
          .order('period_start_date', { ascending: true }),
      ]);
      const sigRows = (signalsRes.data as { signal_date: string; notes: string | null }[]) || [];
      const parsed: { date: string; flow: FlowLevel }[] = [];
      for (const r of sigRows) {
        const f = parseFlow(r.notes);
        if (f) parsed.push({ date: r.signal_date, flow: f });
      }
      setSignals(parsed);
      setPeriods(((periodsRes.data as PeriodRow[]) || []));
    } catch (e) {
      console.error('PeriodFlowCard load error:', e);
      setSignals([]);
      setPeriods([]);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    return onHealthDataChange(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Build the last 3 cycles with their flow days. For each period row,
  // walk forward day-by-day until we hit the recorded end_date (if set)
  // or 10 days (whichever comes first — a reasonable upper bound on
  // period length), and attach any flow log on each day.
  const cycles = useMemo<FlowCycle[]>(() => {
    if (periods.length === 0) return [];
    const flowMap = new Map<string, FlowLevel>();
    for (const s of signals) flowMap.set(s.date, s.flow);

    const out: FlowCycle[] = [];
    for (const p of periods) {
      const start = parseISO(p.period_start_date);
      const end = p.period_end_date ? parseISO(p.period_end_date) : null;
      const lastDay = end ?? new Date(start.getTime() + 9 * 86_400_000); // 10 days cap
      const days: FlowDay[] = [];
      for (let d = new Date(start); d <= lastDay; d = new Date(d.getTime() + 86_400_000)) {
        const key = format(d, 'yyyy-MM-dd');
        days.push({
          date: key,
          level: flowMap.get(key) ?? null,
          dayIndex: differenceInDays(d, start),
        });
      }
      // Drop trailing days with no flow logged when the period has no
      // explicit end date — keeps the row from showing nine empties.
      if (!end) {
        while (days.length > 0 && days[days.length - 1].level === null) days.pop();
      }
      if (days.length > 0) out.push({ start, end, days });
    }
    return out.reverse().slice(0, 3); // most-recent first, top 3
  }, [periods, signals]);

  // Headline stats from the most recent cycle that has any flow log.
  const latestStats = useMemo(() => {
    const withFlow = cycles.find(c => c.days.some(d => d.level !== null));
    if (!withFlow) return null;
    const heavyDays = withFlow.days.filter(d => d.level === 'heavy').length;
    const totalDays = withFlow.days.filter(d => d.level !== null).length;
    return { heavyDays, totalDays, period: withFlow };
  }, [cycles]);

  if (!loaded || !lastPeriodStart) return null;

  // Self-hide when no flow ever logged — different users track
  // different things; an empty tile for an unused feature is noise.
  const anyFlowLogged = signals.length > 0;
  if (!anyFlowLogged) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <Droplet className="h-4 w-4 text-pink-500" />
          Period flow
        </h4>
        {latestStats && (
          <Badge variant="outline" className="text-[10px]">
            {latestStats.totalDays} {latestStats.totalDays === 1 ? 'day' : 'days'} logged
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Flow per day across your last {cycles.length} {cycles.length === 1 ? 'cycle' : 'cycles'}.
        Heavy flow lasting more than 2–3 days, or any cycle with sudden flow changes, is worth
        flagging with your provider.
      </p>

      {cycles.map((cycle, ci) => (
        <div key={ci} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              {format(cycle.start, 'MMM d')}
              {cycle.end ? ` – ${format(cycle.end, 'MMM d')}` : ' (active)'}
            </span>
            <span className="text-muted-foreground">
              {cycle.days.length} {cycle.days.length === 1 ? 'day' : 'days'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {cycle.days.map(d => (
              <div
                key={d.date}
                className={`flex-1 h-6 rounded-sm border ${
                  d.level
                    ? `${FLOW_TONE[d.level].dot} border-transparent`
                    : 'bg-muted/30 border-border'
                }`}
                title={`Day ${d.dayIndex + 1} (${d.date}) — ${d.level ? FLOW_TONE[d.level].label : 'no flow logged'}`}
              />
            ))}
          </div>
          {/* Day numbers under the row to ground the visualization */}
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            {cycle.days.map(d => (
              <div key={d.date} className="flex-1 text-center">
                {d.dayIndex + 1}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground pt-1 border-t">
        {(['spotting', 'light', 'medium', 'heavy'] as FlowLevel[]).map(l => (
          <div key={l} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded-sm ${FLOW_TONE[l].dot}`} />
            {FLOW_TONE[l].label}
          </div>
        ))}
      </div>

      {latestStats && latestStats.heavyDays > 3 && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {latestStats.heavyDays} heavy-flow days this period. Persistent heavy bleeding
            (menorrhagia) can lead to iron deficiency — worth raising at your next visit if
            this is unusual for you.
          </p>
        </div>
      )}
    </Card>
  );
};

export default PeriodFlowCard;
