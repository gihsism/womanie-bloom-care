import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/integrations/db/client';
import { onHealthDataChange } from '@/lib/data-events';
import { format, subDays, parseISO, differenceInDays, addDays } from 'date-fns';
import { Zap, CheckCircle2, XCircle, Circle } from 'lucide-react';

// LH surge tracker for conception mode. The DailyLogging form has
// asked users for their daily LH test result for a while
// ("LH test: positive" / "negative" / "not-tested" written into
// daily_health_signals.notes — DailyLogging.tsx:136) but nothing
// ever displayed it back. The LH surge is what predicts ovulation
// 24-36 hours ahead, which is the single most actionable signal in
// fertility tracking.
//
// Detection: the first positive in a run (after at least one negative
// in the prior week) is the surge. Ovulation is expected ~24-36 hours
// after that.

type LHValue = 'positive' | 'negative' | 'not-tested';

interface LHReading {
  date: string;     // YYYY-MM-DD
  value: LHValue;
}

const SCAN_DAYS = 30;

function parseLH(notes: string | null): LHValue | null {
  if (!notes) return null;
  const m = notes.match(/LH test:\s*(positive|negative|not-tested)/i);
  if (!m) return null;
  return m[1].toLowerCase() as LHValue;
}

const LHSurgeCard = () => {
  const { user } = useAuth();
  const [readings, setReadings] = useState<LHReading[]>([]);
  const [loaded, setLoaded] = useState(false);

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
      const parsed: LHReading[] = [];
      for (const r of rows) {
        const v = parseLH(r.notes);
        if (v && v !== 'not-tested') {
          parsed.push({ date: r.signal_date, value: v });
        }
      }
      setReadings(parsed);
    } catch (e) {
      console.error('LH chart load error:', e);
      setReadings([]);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
    return onHealthDataChange(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Detect the most recent surge: the first 'positive' in a stretch
  // preceded by at least one 'negative' within the prior 7 days.
  const surge = useMemo(() => {
    if (readings.length === 0) return null;
    for (let i = readings.length - 1; i >= 0; i--) {
      if (readings[i].value !== 'positive') continue;
      // Look back up to 7 days for a negative; if found, this is a
      // valid surge candidate.
      const surgeDate = parseISO(readings[i].date);
      for (let j = i - 1; j >= 0; j--) {
        const daysBetween = differenceInDays(surgeDate, parseISO(readings[j].date));
        if (daysBetween > 7) break;
        if (readings[j].value === 'negative') {
          return readings[i];
        }
      }
      // Even without a prior negative, a positive is meaningful — but
      // it's harder to call "the surge" vs a still-positive trail.
      return readings[i];
    }
    return null;
  }, [readings]);

  const today = new Date();
  const daysSinceSurge = surge ? differenceInDays(today, parseISO(surge.date)) : null;
  const expectedOvulation = surge ? addDays(parseISO(surge.date), 1) : null;
  // Surge is "fresh" if it happened in the last 4 days.
  const surgeIsFresh = daysSinceSurge !== null && daysSinceSurge <= 4;

  // Build the last 30 days as squares: positive / negative / no-test
  const todayStr = format(today, 'yyyy-MM-dd');
  const days30: { date: string; value: LHValue | null; isToday: boolean }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = format(subDays(today, i), 'yyyy-MM-dd');
    const row = readings.find(r => r.date === d);
    days30.push({ date: d, value: row?.value ?? null, isToday: d === todayStr });
  }
  const positiveCount = readings.filter(r => r.value === 'positive').length;
  const negativeCount = readings.filter(r => r.value === 'negative').length;

  if (!loaded) return null;

  // Hide the card entirely when the user has never logged an LH test —
  // most conception-mode users without OPKs shouldn't see an empty
  // tile for a method they don't use.
  if (readings.length === 0) return null;

  const dotFor = (value: LHValue | null): string => {
    if (value === 'positive') return 'bg-amber-500';
    if (value === 'negative') return 'bg-muted-foreground/40';
    return 'bg-muted/40';
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-600" />
          LH surge tracker
        </h4>
        <Badge variant="outline" className="text-[10px]">
          Surge predicts ovulation 24-36h ahead
        </Badge>
      </div>

      {surge && (
        <div
          className={`rounded-lg p-3 border ${
            surgeIsFresh
              ? 'border-amber-300/60 bg-amber-50/60 dark:bg-amber-900/20 dark:border-amber-700/40'
              : 'border-border bg-muted/30'
          }`}
        >
          <div className="flex items-start gap-2">
            <CheckCircle2
              className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                surgeIsFresh ? 'text-amber-600' : 'text-muted-foreground'
              }`}
            />
            <div className="flex-1">
              <p className="text-sm font-medium">
                {surgeIsFresh ? 'LH surge detected' : 'Last surge logged'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(parseISO(surge.date), 'MMM d')}
                {daysSinceSurge !== null && daysSinceSurge >= 0 && (
                  <>
                    {' · '}
                    {daysSinceSurge === 0
                      ? 'today'
                      : daysSinceSurge === 1
                      ? 'yesterday'
                      : `${daysSinceSurge} days ago`}
                  </>
                )}
                {expectedOvulation && surgeIsFresh && (
                  <>
                    {' · ovulation expected '}
                    {format(expectedOvulation, 'MMM d')}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 30-day strip */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">Last 30 days</span>
          <span className="text-muted-foreground">
            <span className="text-amber-600 font-medium">{positiveCount}</span> positive ·{' '}
            <span className="font-medium">{negativeCount}</span> negative
          </span>
        </div>
        <div className="grid grid-cols-10 sm:grid-cols-15 gap-1">
          {days30.map((d) => (
            <div
              key={d.date}
              className={`aspect-square rounded-sm ${dotFor(d.value)} ${
                d.isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''
              }`}
              title={`${d.date}${d.value ? ` · ${d.value}` : ' · not tested'}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-amber-500" /> positive
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-muted-foreground/40" /> negative
          </span>
          <span className="inline-flex items-center gap-1">
            <Circle className="h-2 w-2" /> not tested
          </span>
        </div>
      </div>

      {!surge && readings.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30">
          <XCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            No surge detected in your recent tests. The LH surge typically lasts 12-24 hours —
            testing twice a day (morning + afternoon) catches it more reliably.
          </p>
        </div>
      )}
    </Card>
  );
};

export default LHSurgeCard;
