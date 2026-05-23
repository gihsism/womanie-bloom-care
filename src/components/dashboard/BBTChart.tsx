import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/integrations/db/client';
import { onHealthDataChange } from '@/lib/data-events';
import { format, subDays, differenceInDays, parseISO } from 'date-fns';
import { Thermometer, TrendingUp, Info } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';

// Basal body temperature chart for conception mode. Users log BBT daily
// via DailyLogging, which currently stamps the value into
// daily_health_signals.notes as "BBT: 97.8°F" (DailyLogging.tsx:142).
// The chart parses those entries back out and plots the curve — the
// canonical fertility-tracking artifact, which until now we asked for
// but never showed back.
//
// Ovulation detection: BBT typically rises 0.2–0.5 °F (0.1–0.3 °C)
// after ovulation and stays elevated through the luteal phase. We
// flag the first day of a sustained 3-day rise above the prior
// 6-day average + 0.2 °F as the candidate ovulation day.

interface BBTChartProps {
  // The user's last period start lets us draw the cycle-start
  // reference line; falls through gracefully if absent.
  lastPeriodStart?: Date | null;
}

interface BBTPoint {
  date: string;       // YYYY-MM-DD
  dayNumber: number;  // days since chart start
  tempF: number;
  tempC: number;
}

const SCAN_DAYS = 90;
const MIN_DAYS_FOR_OVU = 10;

// Accept both "BBT: 97.8°F" / "BBT: 97.8 F" / "BBT: 36.5°C" / "BBT: 36.5".
function parseBbt(notes: string | null): { tempF: number; tempC: number } | null {
  if (!notes) return null;
  const m = notes.match(/BBT:\s*(\d+\.?\d*)\s*°?\s*([CF])?/i);
  if (!m) return null;
  const raw = parseFloat(m[1]);
  if (!Number.isFinite(raw)) return null;
  const unit = (m[2] || '').toUpperCase();
  // Heuristic when unit is missing: BBT measured in Fahrenheit is
  // typically 96–99; in Celsius it's 35.5–37.5. Use the value range
  // to guess.
  if (unit === 'C' || (!unit && raw < 50)) {
    const tempC = raw;
    const tempF = (tempC * 9) / 5 + 32;
    return { tempF, tempC };
  }
  const tempF = raw;
  const tempC = ((tempF - 32) * 5) / 9;
  return { tempF, tempC };
}

const BBTChart = ({ lastPeriodStart }: BBTChartProps) => {
  const { user } = useAuth();
  const [points, setPoints] = useState<BBTPoint[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unit, setUnit] = useState<'F' | 'C'>('F');

  const load = async () => {
    if (!user) return;
    setLoaded(false);
    try {
      const cutoff = format(subDays(new Date(), SCAN_DAYS), 'yyyy-MM-dd');
      const { data } = await db
        .from('daily_health_signals')
        .select('signal_date, notes')
        .eq('user_id', user.id)
        .gte('signal_date', cutoff)
        .order('signal_date', { ascending: true });
      const rows = (data as { signal_date: string; notes: string | null }[]) || [];
      const start = subDays(new Date(), SCAN_DAYS);
      const parsed: BBTPoint[] = [];
      for (const r of rows) {
        const t = parseBbt(r.notes);
        if (!t) continue;
        parsed.push({
          date: r.signal_date,
          dayNumber: differenceInDays(parseISO(r.signal_date), start),
          tempF: Math.round(t.tempF * 100) / 100,
          tempC: Math.round(t.tempC * 100) / 100,
        });
      }
      setPoints(parsed);
    } catch (e) {
      console.error('BBT chart load error:', e);
      setPoints([]);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    return onHealthDataChange(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Candidate ovulation day: first day of a sustained 3-day rise above
  // the 6-day rolling average + 0.2°F (≈ standard biphasic shift).
  const ovulationCandidate = useMemo(() => {
    if (points.length < MIN_DAYS_FOR_OVU) return null;
    for (let i = 6; i < points.length - 2; i++) {
      const baseline =
        points.slice(i - 6, i).reduce((s, p) => s + p.tempF, 0) / 6;
      const threshold = baseline + 0.2;
      if (
        points[i].tempF >= threshold &&
        points[i + 1].tempF >= threshold &&
        points[i + 2].tempF >= threshold
      ) {
        return points[i - 1]; // ovulation typically the day before the rise
      }
    }
    return null;
  }, [points]);

  // Coverlines: median pre- and post-ovulation temps, when we have
  // an ovulation candidate. Helps the user see the biphasic pattern.
  const coverlines = useMemo(() => {
    if (!ovulationCandidate) return null;
    const splitIdx = points.findIndex(p => p.date === ovulationCandidate.date);
    if (splitIdx < 0) return null;
    const pre = points.slice(0, splitIdx);
    const post = points.slice(splitIdx + 1);
    if (pre.length < 3 || post.length < 2) return null;
    const med = (arr: BBTPoint[]) => {
      const sorted = [...arr].map(p => p.tempF).sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };
    return { preMedian: med(pre), postMedian: med(post) };
  }, [ovulationCandidate, points]);

  const cycleStartLine = useMemo(() => {
    if (!lastPeriodStart) return null;
    const start = subDays(new Date(), SCAN_DAYS);
    const d = differenceInDays(lastPeriodStart, start);
    if (d < 0 || d > SCAN_DAYS) return null;
    return d;
  }, [lastPeriodStart]);

  const tempKey: 'tempF' | 'tempC' = unit === 'F' ? 'tempF' : 'tempC';
  const yDomain: [number, number] = unit === 'F' ? [96, 100] : [35.5, 37.8];
  const yTickFormatter = (v: number) => unit === 'F' ? `${v.toFixed(1)}°F` : `${v.toFixed(1)}°C`;
  const tooltipFormatter = (v: number) => unit === 'F' ? `${v.toFixed(2)}°F` : `${v.toFixed(2)}°C`;

  if (!loaded) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Thermometer className="h-4 w-4 text-primary" />
          <h4 className="font-semibold">Basal body temperature</h4>
        </div>
        <div className="h-48 animate-pulse bg-muted/40 rounded-lg" />
      </Card>
    );
  }

  if (points.length === 0) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Thermometer className="h-4 w-4 text-primary" />
          <h4 className="font-semibold">Basal body temperature</h4>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Log your BBT each morning from the daily-log form. Once you have a few entries
          we'll plot the curve and try to flag the day you ovulated.
        </p>
        <div className="text-xs text-muted-foreground flex items-start gap-1.5 bg-muted/30 rounded-lg p-2.5">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            BBT is most accurate first thing in the morning before getting out of bed.
            Same time each day, same thermometer. The post-ovulation rise is small (0.2–0.5 °F)
            but consistent.
          </span>
        </div>
      </Card>
    );
  }

  // Build a contiguous series so the line doesn't visually skip gaps —
  // gaps remain visible because recharts won't draw between non-adjacent
  // points without `connectNulls`.
  const chartData = points.map(p => ({
    day: p.dayNumber,
    date: p.date,
    [tempKey]: p[tempKey],
  }));

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold flex items-center gap-2">
          <Thermometer className="h-4 w-4 text-primary" />
          Basal body temperature
        </h4>
        <div className="flex items-center gap-1">
          <Button
            variant={unit === 'F' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={() => setUnit('F')}
          >
            °F
          </Button>
          <Button
            variant={unit === 'C' ? 'default' : 'ghost'}
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={() => setUnit('C')}
          >
            °C
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-xs">
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground">Entries</div>
          <div className="font-semibold">{points.length}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground">Latest</div>
          <div className="font-semibold">
            {points.length > 0
              ? unit === 'F'
                ? `${points[points.length - 1].tempF.toFixed(2)}°F`
                : `${points[points.length - 1].tempC.toFixed(2)}°C`
              : '—'}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground">Detected ovulation</div>
          <div className="font-semibold">
            {ovulationCandidate
              ? format(parseISO(ovulationCandidate.date), 'MMM d')
              : '—'}
          </div>
        </div>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="day"
              tickFormatter={(d) => format(subDays(new Date(), SCAN_DAYS - d), 'MMM d')}
              tick={{ fontSize: 10 }}
              tickCount={5}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={yTickFormatter}
              tick={{ fontSize: 10 }}
              width={50}
            />
            <Tooltip
              labelFormatter={(d) =>
                format(subDays(new Date(), SCAN_DAYS - Number(d)), 'MMM d, yyyy')
              }
              formatter={(v: number) => [tooltipFormatter(v), 'BBT']}
              contentStyle={{
                background: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            {cycleStartLine !== null && (
              <ReferenceLine
                x={cycleStartLine}
                stroke="hsl(var(--primary))"
                strokeDasharray="3 3"
                label={{ value: 'Cycle', position: 'top', fontSize: 10, fill: 'hsl(var(--primary))' }}
              />
            )}
            {ovulationCandidate && (
              <ReferenceLine
                x={ovulationCandidate.dayNumber}
                stroke="hsl(var(--secondary))"
                label={{ value: 'Ovulation', position: 'top', fontSize: 10, fill: 'hsl(var(--secondary))' }}
              />
            )}
            {coverlines && (
              <>
                <ReferenceArea
                  y1={unit === 'F' ? coverlines.preMedian : ((coverlines.preMedian - 32) * 5) / 9}
                  y2={unit === 'F' ? coverlines.postMedian : ((coverlines.postMedian - 32) * 5) / 9}
                  fill="hsl(var(--secondary))"
                  fillOpacity={0.07}
                />
              </>
            )}
            <Line
              type="monotone"
              dataKey={tempKey}
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {ovulationCandidate && coverlines && (
        <div className="text-xs text-muted-foreground flex items-start gap-1.5 bg-muted/30 rounded-lg p-2.5">
          <TrendingUp className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-secondary" />
          <span>
            Biphasic shift detected: median jumped from{' '}
            <span className="font-medium">
              {unit === 'F'
                ? `${coverlines.preMedian.toFixed(2)}°F`
                : `${(((coverlines.preMedian - 32) * 5) / 9).toFixed(2)}°C`}
            </span>{' '}
            to{' '}
            <span className="font-medium">
              {unit === 'F'
                ? `${coverlines.postMedian.toFixed(2)}°F`
                : `${(((coverlines.postMedian - 32) * 5) / 9).toFixed(2)}°C`}
            </span>{' '}
            around {format(parseISO(ovulationCandidate.date), 'MMM d')}. Ovulation typically
            the day before the rise.
          </span>
        </div>
      )}

      {!ovulationCandidate && points.length >= MIN_DAYS_FOR_OVU && (
        <Badge variant="outline" className="text-[10px]">
          No clear biphasic shift in the last {SCAN_DAYS} days.
        </Badge>
      )}
    </Card>
  );
};

export default BBTChart;
