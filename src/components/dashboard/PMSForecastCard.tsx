import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CloudRain, Info } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { addDays, differenceInDays, format, parseISO, subDays } from 'date-fns';
import type { LifeStage } from './DashboardHeader';

// Forward-looking PMS-window forecast for cycle modes.
//
// The predictor already knows when the next period starts. The
// 5-7 days before are the PMS window where symptoms typically
// surface. This card flips the script from "your period is in X
// days" to "here's what to expect AND how to prep" — actionable
// rather than just informational.
//
// Self-hides when:
//   - mode isn't cycle-relevant
//   - no period_tracking data
//   - the user IS currently menstruating (no PMS to forecast)
//   - the next-period prediction is unreliable

type Phase = 'menstrual' | 'pre-pms' | 'pms' | 'other';

interface Props {
  mode: LifeStage;
}

interface PeriodRow {
  period_start_date: string;
  cycle_length: number | null;
}

interface SignalRow {
  signal_date: string;
  symptoms: string[] | null;
}

const RELEVANT_MODES: LifeStage[] = [
  'menstrual-cycle', 'conception', 'contraception',
];

const PMS_WINDOW_LEN = 5;
const MIN_VALID_CYCLE = 18;
const MAX_VALID_CYCLE = 60;

const SYMPTOM_LABEL: Record<string, string> = {
  cramps: 'cramps',
  headache: 'headache',
  bloating: 'bloating',
  tender_breasts: 'tender breasts',
  back_pain: 'back pain',
  nausea: 'nausea',
  fatigue: 'fatigue',
  acne: 'acne',
  insomnia: 'insomnia',
  anxiety: 'anxiety',
  cravings: 'cravings',
};

const PREP_TIPS = [
  'Magnesium (almonds, dark chocolate, leafy greens) — strongest single-nutrient evidence',
  'Steady protein + complex carbs to flatten blood-sugar dips',
  'Reduce caffeine + alcohol if you notice they sharpen symptoms',
  'Prioritise sleep — even one extra hour helps mood + cramp tolerance',
  'Plan a lower-intensity training week if you train',
  'Bring forward any social commitments you can — late-luteal days are not your peak energy',
];

function classifyDay(daysToPeriod: number): Phase {
  if (daysToPeriod < 0) return 'menstrual';
  if (daysToPeriod === 0) return 'pms';
  if (daysToPeriod <= PMS_WINDOW_LEN) return 'pms';
  if (daysToPeriod <= PMS_WINDOW_LEN + 3) return 'pre-pms';
  return 'other';
}

export default function PMSForecastCard({ mode }: Props) {
  const { user } = useAuth();
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const cutoff = format(subDays(new Date(), 180), 'yyyy-MM-dd');
    const [{ data: pData }, { data: sData }] = await Promise.all([
      db.from('period_tracking')
        .select('period_start_date, cycle_length')
        .eq('user_id', user.id)
        .order('period_start_date', { ascending: false })
        .limit(7),
      db.from('daily_health_signals')
        .select('signal_date, symptoms')
        .eq('user_id', user.id)
        .gte('signal_date', cutoff),
    ]);
    setPeriods((pData ?? []) as PeriodRow[]);
    setSignals((sData ?? []) as SignalRow[]);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const forecast = useMemo(() => {
    if (periods.length === 0) return null;
    const sorted = [...periods].sort(
      (a, b) => Date.parse(b.period_start_date) - Date.parse(a.period_start_date)
    );
    const lastStart = parseISO(sorted[0].period_start_date);
    const cycleLength = sorted[0].cycle_length ?? 28;
    if (cycleLength < MIN_VALID_CYCLE || cycleLength > MAX_VALID_CYCLE) return null;

    const today = new Date();
    let nextStart = addDays(lastStart, cycleLength);
    // Roll forward if today >= predicted next start.
    while (nextStart <= today) nextStart = addDays(nextStart, cycleLength);

    const daysToNext = differenceInDays(nextStart, today);
    const pmsStart = addDays(nextStart, -PMS_WINDOW_LEN);
    const phase = classifyDay(daysToNext);

    return {
      lastStart,
      nextStart,
      cycleLength,
      daysToNext,
      pmsStart,
      phase,
    };
  }, [periods]);

  // Build the user's late-luteal symptom profile from the last 4 cycles.
  // Each signal day classified by days-before-next-period (using cycle
  // length per cycle), and we keep tallies for days that fell in the
  // PMS window.
  const symptomProfile = useMemo(() => {
    if (periods.length < 2 || signals.length === 0) return null;
    const sorted = [...periods].sort(
      (a, b) => Date.parse(a.period_start_date) - Date.parse(b.period_start_date)
    );

    const counts: Record<string, number> = {};
    let pmsDaysLogged = 0;

    for (let i = 0; i < sorted.length - 1; i++) {
      const start = parseISO(sorted[i].period_start_date);
      const nextStart = parseISO(sorted[i + 1].period_start_date);
      const pmsRangeStart = addDays(nextStart, -PMS_WINDOW_LEN);

      for (const s of signals) {
        const d = parseISO(s.signal_date);
        if (d >= pmsRangeStart && d < nextStart && s.symptoms && s.symptoms.length > 0) {
          pmsDaysLogged++;
          for (const sym of s.symptoms) {
            counts[sym] = (counts[sym] ?? 0) + 1;
          }
        }
      }
    }

    const ranked = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, n]) => ({ key: k, label: SYMPTOM_LABEL[k] ?? k.replace(/_/g, ' '), count: n }));

    return { pmsDaysLogged, ranked };
  }, [periods, signals]);

  if (!RELEVANT_MODES.includes(mode)) return null;
  if (!loaded || !forecast) return null;
  if (forecast.phase === 'menstrual' || forecast.phase === 'other') return null;

  const inPmsNow = forecast.phase === 'pms';

  return (
    <Card className="p-4 border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-amber-900/10">
      <div className="flex items-center gap-2 mb-2">
        <CloudRain className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        <h3 className="text-sm font-semibold">
          {inPmsNow ? 'You are in the PMS window' : 'PMS window approaching'}
        </h3>
        <Badge variant="outline" className="text-[10px] ml-auto">
          {inPmsNow
            ? `period in ~${forecast.daysToNext}d`
            : `starts ${format(forecast.pmsStart, 'MMM d')} (~${forecast.daysToNext - PMS_WINDOW_LEN}d)`}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        {inPmsNow
          ? `Period predicted ${format(forecast.nextStart, 'MMM d')}. Common late-luteal symptoms include cramps, bloating, mood shifts, and sleep disruption.`
          : `Period predicted ${format(forecast.nextStart, 'MMM d')}. The 5 days before tend to be when symptoms peak — a few days of prep can help.`}
      </p>

      {symptomProfile && symptomProfile.ranked.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
            Your typical PMS-window symptoms ({symptomProfile.pmsDaysLogged} days logged)
          </p>
          <div className="flex flex-wrap gap-1">
            {symptomProfile.ranked.map(s => (
              <Badge key={s.key} variant="outline" className="text-[10px] font-normal">
                {s.label} · {s.count}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
        What helps in the next few days
      </p>
      <ul className="space-y-1">
        {PREP_TIPS.map((t, i) => (
          <li key={i} className="text-xs text-foreground/90 flex items-start gap-1.5">
            <span className="text-amber-600 mt-0.5">·</span>
            <span className="leading-snug">{t}</span>
          </li>
        ))}
      </ul>

      <p className="text-[10px] text-muted-foreground mt-3 flex items-start gap-1.5 leading-relaxed">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        Severe PMS that interferes with daily life — especially mood symptoms — can be
        PMDD (premenstrual dysphoric disorder) and is treatable. Worth a clinician
        conversation if symptoms feel out of proportion.
      </p>
    </Card>
  );
}
