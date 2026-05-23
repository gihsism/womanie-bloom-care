import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/integrations/db/client';
import { onHealthDataChange } from '@/lib/data-events';
import { Moon, AlertCircle } from 'lucide-react';
import { format, subDays } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';

// Sleep tracking card. DailyLogging now writes "Sleep: 7.5h" and
// "Sleep quality: 4/5" into daily_health_signals.notes for any mode;
// this card reads it back. Surfaces on cycle / pregnancy / menopause /
// post-menopause modes (the ones where sleep matters most clinically).
//
// Hides itself when no sleep entries exist, same self-hide pattern
// as the other invisible-data readers.

interface SleepEntry {
  date: string;       // YYYY-MM-DD
  dayNumber: number;  // 0..SCAN_DAYS-1 since chart start
  hours: number | null;
  quality: number | null;
}

const SCAN_DAYS = 30;
const RECOMMENDED_LOW = 7;
const RECOMMENDED_HIGH = 9;

function parseSleep(notes: string | null): { hours: number | null; quality: number | null } {
  if (!notes) return { hours: null, quality: null };
  const h = notes.match(/Sleep:\s*(\d+(?:\.\d+)?)\s*h/i);
  const q = notes.match(/Sleep quality:\s*([1-5])\/5/i);
  return {
    hours: h ? parseFloat(h[1]) : null,
    quality: q ? parseInt(q[1], 10) : null,
  };
}

const SleepTrendCard = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<SleepEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoaded(false);
    try {
      const cutoff = format(subDays(new Date(), SCAN_DAYS - 1), 'yyyy-MM-dd');
      const { data } = await db
        .from('daily_health_signals')
        .select('signal_date, notes')
        .eq('user_id', user.id)
        .gte('signal_date', cutoff)
        .order('signal_date', { ascending: true });
      const rows = (data as { signal_date: string; notes: string | null }[]) || [];
      const start = subDays(new Date(), SCAN_DAYS - 1);
      const parsed: SleepEntry[] = [];
      for (const r of rows) {
        const s = parseSleep(r.notes);
        if (s.hours === null && s.quality === null) continue;
        const dayNumber = Math.max(
          0,
          Math.floor((new Date(r.signal_date).getTime() - start.getTime()) / 86_400_000)
        );
        parsed.push({
          date: r.signal_date,
          dayNumber,
          hours: s.hours,
          quality: s.quality,
        });
      }
      setEntries(parsed);
    } catch (e) {
      console.error('SleepTrendCard load error:', e);
      setEntries([]);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    return onHealthDataChange(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const stats = useMemo(() => {
    const withHours = entries.filter(e => e.hours !== null);
    const withQuality = entries.filter(e => e.quality !== null);
    if (withHours.length === 0 && withQuality.length === 0) {
      return { avgHours: null, avgQuality: null, undersleeping: 0, last7Avg: null };
    }
    const avgHours = withHours.length > 0
      ? withHours.reduce((s, e) => s + (e.hours ?? 0), 0) / withHours.length
      : null;
    const avgQuality = withQuality.length > 0
      ? withQuality.reduce((s, e) => s + (e.quality ?? 0), 0) / withQuality.length
      : null;
    const undersleeping = withHours.filter(e => (e.hours ?? 0) < RECOMMENDED_LOW).length;
    // Last 7 calendar days (not last 7 logs) for the most-recent-window
    // average so a stretch of unlogged days doesn't inflate it.
    const last7Cutoff = SCAN_DAYS - 7;
    const last7 = withHours.filter(e => e.dayNumber >= last7Cutoff);
    const last7Avg = last7.length > 0
      ? last7.reduce((s, e) => s + (e.hours ?? 0), 0) / last7.length
      : null;
    return { avgHours, avgQuality, undersleeping, last7Avg };
  }, [entries]);

  if (!loaded) return null;
  // Self-hide when no sleep data ever logged.
  if (entries.length === 0) return null;

  const chartData = entries.map(e => ({
    day: e.dayNumber,
    date: e.date,
    hours: e.hours,
  }));

  // Surface a callout when last-7 average is below the recommended
  // range — chronic insufficient sleep is a real clinical signal
  // (linked to cardiovascular risk, mood, fertility).
  const chronicShort = stats.last7Avg !== null && stats.last7Avg < RECOMMENDED_LOW;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <Moon className="h-4 w-4 text-indigo-500" />
          Sleep trend
        </h4>
        <Badge variant="outline" className="text-[10px]">
          7–9h recommended for adults
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground">30-day avg</div>
          <div className="font-semibold">
            {stats.avgHours !== null ? `${stats.avgHours.toFixed(1)}h` : '—'}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground">Last 7 days</div>
          <div className={`font-semibold ${chronicShort ? 'text-amber-600' : ''}`}>
            {stats.last7Avg !== null ? `${stats.last7Avg.toFixed(1)}h` : '—'}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground">Avg quality</div>
          <div className="font-semibold">
            {stats.avgQuality !== null ? `${stats.avgQuality.toFixed(1)}/5` : '—'}
          </div>
        </div>
      </div>

      {/* Chart only when we have hours data — quality-only entries
          don't have a meaningful line. */}
      {entries.some(e => e.hours !== null) && (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="day"
                tickFormatter={(d) => format(subDays(new Date(), SCAN_DAYS - 1 - d), 'MMM d')}
                tick={{ fontSize: 10 }}
                tickCount={5}
              />
              <YAxis
                domain={[0, 12]}
                tickFormatter={(v) => `${v}h`}
                tick={{ fontSize: 10 }}
                width={36}
              />
              <Tooltip
                labelFormatter={(d) =>
                  format(subDays(new Date(), SCAN_DAYS - 1 - Number(d)), 'MMM d, yyyy')
                }
                formatter={(v: number) => [`${v.toFixed(1)}h`, 'Sleep']}
                contentStyle={{
                  background: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              {/* Recommended-range band */}
              <ReferenceArea
                y1={RECOMMENDED_LOW}
                y2={RECOMMENDED_HIGH}
                fill="hsl(var(--primary))"
                fillOpacity={0.06}
              />
              <Line
                type="monotone"
                dataKey="hours"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {chronicShort && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Averaging under {RECOMMENDED_LOW}h in the last week. Chronic short sleep is linked
            to mood, cycle, and cardiovascular changes — worth flagging at your next visit if
            this is the new normal.
          </p>
        </div>
      )}

      {stats.undersleeping > 0 && !chronicShort && (
        <p className="text-[11px] text-muted-foreground">
          {stats.undersleeping} {stats.undersleeping === 1 ? 'night' : 'nights'} under{' '}
          {RECOMMENDED_LOW}h in the last 30 days.
        </p>
      )}
    </Card>
  );
};

export default SleepTrendCard;
