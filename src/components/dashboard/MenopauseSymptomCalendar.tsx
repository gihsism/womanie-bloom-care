import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { addDays, format, parseISO, startOfDay, subDays } from 'date-fns';
import { CalendarHeart, Flame, Activity } from 'lucide-react';

// 60-day rolling symptom calendar for menopause / post-menopause modes.
//
// CycleCalendar early-returns for these modes (no periods to chart), so
// menopausal users had no calendar surface at all. This card fills the
// gap with a heat-grid that visualizes what's actually happening for
// them day to day: hot flashes per day (the dominant complaint), plus
// dot markers for any logged symptom / mood / discharge / notes.
//
// Reads daily_health_signals. Hot flash count is parsed out of the
// notes field per the existing schema-less convention (DailyLogging
// writes "Hot flashes: N" into notes; see audit.md HANDOFF for the
// real column).
//
// The grid is 60 days × ~8 cells wide so it fits on every viewport
// without horizontal scroll on phones.

type Mode = 'menopause' | 'post-menopause' | string;

interface MenopauseSymptomCalendarProps {
  mode: Mode;
}

interface DayCell {
  date: string;
  hotFlashes: number;
  loggedAnything: boolean;
  symptomCount: number;
  moodCount: number;
  hasNotes: boolean;
}

const WINDOW_DAYS = 60;

function parseHotFlashCount(notes: string | null): number {
  if (!notes) return 0;
  const m = notes.match(/Hot flashes:\s*(\d+)/i);
  return m ? Math.min(parseInt(m[1], 10), 99) : 0;
}

// Color the cell by hot-flash count. Bucketed because a continuous
// gradient is hard to read at this size.
function bgForHotFlashes(n: number): string {
  if (n === 0) return 'bg-muted/40';
  if (n <= 2) return 'bg-amber-200/70 dark:bg-amber-900/30';
  if (n <= 5) return 'bg-orange-300 dark:bg-orange-800/60';
  if (n <= 9) return 'bg-orange-400 dark:bg-orange-700/70';
  return 'bg-red-500 dark:bg-red-700';
}

function textForHotFlashes(n: number): string {
  if (n === 0) return 'text-muted-foreground';
  if (n <= 5) return 'text-foreground';
  return 'text-white';
}

export default function MenopauseSymptomCalendar({ mode }: MenopauseSymptomCalendarProps) {
  const { user } = useAuth();
  const [cells, setCells] = useState<DayCell[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const cutoff = format(subDays(new Date(), WINDOW_DAYS - 1), 'yyyy-MM-dd');
    const { data } = await db
      .from('daily_health_signals')
      .select('signal_date, symptoms, mood, discharge, notes')
      .eq('user_id', user.id)
      .gte('signal_date', cutoff);
    const byDate = new Map<string, {
      symptoms: string[] | null;
      mood: string[] | null;
      discharge: string | null;
      notes: string | null;
    }>();
    for (const row of (data ?? []) as Array<{
      signal_date: string;
      symptoms: string[] | null;
      mood: string[] | null;
      discharge: string | null;
      notes: string | null;
    }>) {
      byDate.set(row.signal_date, row);
    }
    const today = startOfDay(new Date());
    const out: DayCell[] = [];
    for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
      const d = format(subDays(today, i), 'yyyy-MM-dd');
      const row = byDate.get(d);
      const hotFlashes = parseHotFlashCount(row?.notes ?? null);
      const symptomCount = row?.symptoms?.length ?? 0;
      const moodCount = row?.mood?.length ?? 0;
      const hasNotes = Boolean(row?.notes && row.notes.trim().length > 0);
      const loggedAnything = symptomCount > 0 || moodCount > 0 || hasNotes || (row?.discharge && row.discharge !== 'none');
      out.push({
        date: d,
        hotFlashes,
        loggedAnything: Boolean(loggedAnything),
        symptomCount,
        moodCount,
        hasNotes,
      });
    }
    setCells(out);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const summary = useMemo(() => {
    if (cells.length === 0) return null;
    const daysLogged = cells.filter(c => c.loggedAnything || c.hotFlashes > 0).length;
    const totalHotFlashes = cells.reduce((sum, c) => sum + c.hotFlashes, 0);
    const peakHotFlashes = Math.max(0, ...cells.map(c => c.hotFlashes));
    // Trend: compare last 30 days vs the prior 30.
    const recent = cells.slice(-30);
    const prior = cells.slice(0, 30);
    const recentAvg = recent.length > 0
      ? recent.reduce((s, c) => s + c.hotFlashes, 0) / recent.length
      : 0;
    const priorAvg = prior.length > 0
      ? prior.reduce((s, c) => s + c.hotFlashes, 0) / prior.length
      : 0;
    let trendLabel: 'rising' | 'falling' | 'steady' = 'steady';
    if (recent.length && prior.length) {
      const diff = recentAvg - priorAvg;
      if (diff > 0.3) trendLabel = 'rising';
      else if (diff < -0.3) trendLabel = 'falling';
    }
    return { daysLogged, totalHotFlashes, peakHotFlashes, recentAvg, priorAvg, trendLabel };
  }, [cells]);

  if (mode !== 'menopause' && mode !== 'post-menopause') return null;
  if (!loaded) return null;
  if (cells.length === 0) return null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <CalendarHeart className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Last {WINDOW_DAYS} days</p>
          <p className="text-[11px] text-muted-foreground">
            Hot flashes per day · dot if any other signal was logged
          </p>
        </div>
        {summary && summary.daysLogged > 0 && (
          <div className="text-right">
            <p className="text-xs font-medium">{summary.daysLogged}/{WINDOW_DAYS} logged</p>
            {summary.totalHotFlashes > 0 && (
              <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1 justify-end">
                <Flame className="h-3 w-3 text-orange-500" />
                {summary.totalHotFlashes} total · trend {summary.trendLabel}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Heat grid: 60 cells in a wrapping flex so it fits any width. */}
      <div className="flex flex-wrap gap-1 mb-3" role="img" aria-label={`Symptom calendar, last ${WINDOW_DAYS} days`}>
        {cells.map(c => (
          <div
            key={c.date}
            className={`relative h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-semibold ${bgForHotFlashes(c.hotFlashes)} ${textForHotFlashes(c.hotFlashes)}`}
            title={`${format(parseISO(c.date), 'MMM d')}${c.hotFlashes > 0 ? ` — ${c.hotFlashes} hot flash${c.hotFlashes === 1 ? '' : 'es'}` : ''}${c.symptomCount > 0 ? ` · ${c.symptomCount} symptom${c.symptomCount === 1 ? '' : 's'}` : ''}${c.moodCount > 0 ? ` · mood logged` : ''}${c.hasNotes ? ` · note` : ''}`}
          >
            {c.hotFlashes > 0 ? c.hotFlashes : ''}
            {c.hotFlashes === 0 && c.loggedAnything && (
              <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-secondary" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-muted/40" /> none
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-200/70 dark:bg-amber-900/30" /> 1–2
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-orange-300 dark:bg-orange-800/60" /> 3–5
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-orange-400 dark:bg-orange-700/70" /> 6–9
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-500 dark:bg-red-700" /> 10+
        </span>
        <span className="inline-flex items-center gap-1 ml-auto">
          <Activity className="h-3 w-3" /> dot = other signal logged
        </span>
      </div>

      {summary && summary.totalHotFlashes === 0 && summary.daysLogged === 0 && (
        <p className="text-[11px] text-muted-foreground mt-3 text-center">
          Log a daily entry to start seeing patterns here.
        </p>
      )}
    </Card>
  );
}
