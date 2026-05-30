import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { differenceInDays, differenceInMonths, format, parseISO } from 'date-fns';
import { CalendarRange, Activity, Thermometer } from 'lucide-react';

// Condensed tracking-summary card for the doctor's PatientDetails
// Overview tab. Same aggregation the patient sees on her own
// dashboard / print view, surfaced here so the doctor doesn't have
// to scroll the raw daily-signal list to get a sense of what's
// going on. Self-hides each sub-block when the underlying data
// isn't there.
//
// Inputs are already loaded by PatientDetails — no extra fetch.

interface PeriodRecord {
  period_start_date: string;
  cycle_length: number;
}

interface SignalRow {
  signal_date: string;
  symptoms: string[] | null;
  notes: string | null;
}

interface Props {
  periodRecords: PeriodRecord[];
  signals: SignalRow[];
  lifeStage: string | null;
}

const SYMPTOM_LABEL: Record<string, string> = {
  cramps: 'Cramps',
  headache: 'Headache',
  bloating: 'Bloating',
  tender_breasts: 'Tender breasts',
  back_pain: 'Back pain',
  nausea: 'Nausea',
  fatigue: 'Fatigue',
  acne: 'Acne',
  hot_flashes: 'Hot flashes',
  night_sweats: 'Night sweats',
  insomnia: 'Insomnia',
};

const MIN_VALID_CYCLE = 18;
const MAX_VALID_CYCLE = 90;

export default function DoctorPatientTrackingSummary({
  periodRecords,
  signals,
  lifeStage,
}: Props) {
  const cycleStats = useMemo(() => {
    if (periodRecords.length === 0) return null;
    const sorted = [...periodRecords].sort(
      (a, b) => Date.parse(b.period_start_date) - Date.parse(a.period_start_date)
    );
    const lastStart = parseISO(sorted[0].period_start_date);
    const daysSince = differenceInDays(new Date(), lastStart);
    const monthsSince = differenceInMonths(new Date(), lastStart);

    // Cycle gaps from consecutive starts. More robust than the
    // stored cycle_length which can be stale.
    const recent = sorted.slice(0, 7);
    const gaps: number[] = [];
    for (let i = 0; i < recent.length - 1; i++) {
      const g = differenceInDays(parseISO(recent[i].period_start_date), parseISO(recent[i + 1].period_start_date));
      if (g >= MIN_VALID_CYCLE && g <= MAX_VALID_CYCLE) gaps.push(g);
    }
    if (gaps.length === 0) {
      return { lastStart, daysSince, monthsSince, mean: null, sd: null, gaps: 0 };
    }
    const mean = gaps.reduce((s, v) => s + v, 0) / gaps.length;
    const sd = Math.sqrt(gaps.map(v => (v - mean) ** 2).reduce((s, v) => s + v, 0) / gaps.length);
    return { lastStart, daysSince, monthsSince, mean, sd, gaps: gaps.length };
  }, [periodRecords]);

  const topSymptoms = useMemo(() => {
    const counts: Record<string, number> = {};
    let daysLogged = 0;
    for (const s of signals) {
      const hasSym = s.symptoms && s.symptoms.length > 0;
      if (hasSym) {
        daysLogged++;
        for (const sym of s.symptoms!) counts[sym] = (counts[sym] ?? 0) + 1;
      }
    }
    const ranked = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, n]) => ({ key: k, label: SYMPTOM_LABEL[k] ?? k.replace(/_/g, ' '), count: n }));
    return { daysLogged, ranked };
  }, [signals]);

  const hotFlash = useMemo(() => {
    let total = 0;
    let daysWith = 0;
    for (const s of signals) {
      const m = (s.notes ?? '').match(/Hot flashes:\s*(\d+)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > 0) {
          total += n;
          daysWith++;
        }
      }
    }
    return { total, daysWith };
  }, [signals]);

  const hasAnything =
    cycleStats !== null ||
    topSymptoms.daysLogged > 0 ||
    (lifeStage && (lifeStage === 'menopause' || lifeStage === 'post-menopause') && hotFlash.daysWith > 0);

  if (!hasAnything) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Patient tracking summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {cycleStats && (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5" />
              Last period
            </span>
            <span className="font-medium">
              {format(cycleStats.lastStart, 'MMM d, yyyy')}{' '}
              <span className="text-muted-foreground">
                ({cycleStats.daysSince === 0
                  ? 'today'
                  : cycleStats.daysSince === 1
                    ? '1 day ago'
                    : cycleStats.monthsSince >= 2
                      ? `${cycleStats.monthsSince} months ago`
                      : `${cycleStats.daysSince} days ago`})
              </span>
            </span>
            {cycleStats.mean !== null && cycleStats.sd !== null && (
              <>
                <span className="text-muted-foreground ml-2">Cycle</span>
                <span className="font-mono">
                  {cycleStats.mean.toFixed(1)}d ± {cycleStats.sd.toFixed(1)}d
                </span>
                <span className="text-muted-foreground text-[11px]">
                  ({cycleStats.gaps} {cycleStats.gaps === 1 ? 'cycle' : 'cycles'})
                </span>
              </>
            )}
          </div>
        )}

        {topSymptoms.daysLogged > 0 && topSymptoms.ranked.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
              <Activity className="h-3.5 w-3.5" />
              Top symptoms (last 30 days, {topSymptoms.daysLogged} {topSymptoms.daysLogged === 1 ? 'day' : 'days'} logged)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {topSymptoms.ranked.map(s => (
                <Badge key={s.key} variant="outline" className="text-xs font-normal">
                  {s.label} · {s.count}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {(lifeStage === 'menopause' || lifeStage === 'post-menopause') && hotFlash.daysWith > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Thermometer className="h-3.5 w-3.5" />
              Hot flashes (last 30 days)
            </span>
            <span className="font-medium">
              {hotFlash.total} total · {hotFlash.daysWith} {hotFlash.daysWith === 1 ? 'day' : 'days'} with flashes
              <span className="text-muted-foreground"> ({(hotFlash.total / hotFlash.daysWith).toFixed(1)} per logged day)</span>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
