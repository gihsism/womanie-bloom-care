import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Info } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { differenceInDays, parseISO } from 'date-fns';
import type { LifeStage } from './DashboardHeader';

// Phase-aware movement / exercise focus for cycle modes. The
// research on cycle-syncing workouts has nuance — claims of huge
// performance shifts often overpromise — but there ARE real
// physiological reasons to vary intensity and recovery. We frame
// this conservatively as "what tends to feel best" rather than
// prescriptive performance optimisation.
//
// Hides unless we can classify the current cycle phase.

type Phase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

interface PhaseGuidance {
  label: string;
  description: string;
  focus: string[];
  tone: string;
  rationale: string;
}

const GUIDANCE: Record<Phase, PhaseGuidance> = {
  menstrual: {
    label: 'Menstrual phase',
    description: 'Days 1–5: lower hormones, often lower energy. Listen to what you can.',
    focus: [
      'Gentle walks, yoga, stretching — most accessible options',
      'Lighter strength if you feel up to it; reduce volume by 20–30%',
      'Avoid high-intensity HIIT if cramping is significant',
      'Heat (warm compress, sauna) can reduce cramping more than ice',
    ],
    tone: 'bg-primary/10 text-primary',
    rationale: 'Estrogen + progesterone are both low. Energy varies — there\'s no medal for pushing through real cramps; light movement often helps more than rest or intensity.',
  },
  follicular: {
    label: 'Follicular phase',
    description: 'Post-period, rising estrogen. Strength + skill acquisition window.',
    focus: [
      'Heavy lifting / progressive overload — strength gains track best here',
      'Try new movement patterns / sports — coordination is at its sharpest',
      'HIIT and intensity-focused conditioning',
      'Recovery is faster — you can tolerate more frequency',
    ],
    tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
    rationale: 'Estrogen rises through this phase. Multiple studies show greater training response, faster recovery, and higher pain tolerance compared to the late luteal phase.',
  },
  ovulation: {
    label: 'Ovulation',
    description: 'Estrogen peak. Most explosive output of the cycle.',
    focus: [
      'Peak day for PRs — sprint, lift heavy, jump',
      'Anti-inflammatory recovery: ice baths, contrast, omega-3',
      'Note: collagen turnover changes near ovulation — be mindful of ACL/ankle on lateral sports if you have injury history',
      'Hydrate well — high estrogen + warm weather can hit harder',
    ],
    tone: 'bg-secondary/20 text-secondary-foreground',
    rationale: 'Estrogen peak shortly before ovulation correlates with maximum strength + explosive output in trained women. Tendon/ligament laxity also peaks — caution if you have ACL/ankle history.',
  },
  luteal: {
    label: 'Luteal phase',
    description: 'Progesterone climbs then drops. Energy and recovery shift.',
    focus: [
      'Steady-state cardio (zone 2) feels easier than the same work at sprint pace',
      'Strength is still useful — work submaximal, focus on form',
      'Last 5-7 days (PMS window): reduce intensity, prioritise sleep + magnesium',
      'Hot environment + intensity is harder — body temperature is already elevated by ~0.5°F',
      'Stretching + mobility work pays off here; tissues are slightly stiffer',
    ],
    tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
    rationale: 'Progesterone elevates core body temperature and resting heart rate; perceived effort at the same intensity is higher. Strength stays mostly intact but high-end conditioning often suffers in the last week.',
  },
};

const RELEVANT_MODES: LifeStage[] = [
  'menstrual-cycle', 'conception', 'contraception',
];

interface Props {
  mode: LifeStage;
}

interface PeriodRow {
  period_start_date: string;
  cycle_length: number | null;
}

const LUTEAL_LEN = 14;
const MENSTRUAL_LEN = 5;

function classifyPhase(periods: PeriodRow[]): { phase: Phase; day: number } | null {
  if (periods.length === 0) return null;
  const sorted = [...periods].sort(
    (a, b) => Date.parse(b.period_start_date) - Date.parse(a.period_start_date)
  );
  const last = sorted[0];
  const lastStart = parseISO(last.period_start_date);
  const day = differenceInDays(new Date(), lastStart);
  const cycleLength = last.cycle_length ?? 28;
  if (day < 0 || day >= cycleLength + 14) return null;
  if (day < MENSTRUAL_LEN) return { phase: 'menstrual', day: day + 1 };
  const ovulationDay = cycleLength - LUTEAL_LEN;
  if (day >= ovulationDay - 1 && day <= ovulationDay + 1) return { phase: 'ovulation', day: day + 1 };
  if (day < ovulationDay - 1) return { phase: 'follicular', day: day + 1 };
  return { phase: 'luteal', day: day + 1 };
}

export default function CyclePhaseExercise({ mode }: Props) {
  const { user } = useAuth();
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from('period_tracking')
      .select('period_start_date, cycle_length')
      .eq('user_id', user.id)
      .order('period_start_date', { ascending: false })
      .limit(3);
    setPeriods((data ?? []) as PeriodRow[]);
    setLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  const current = useMemo(() => classifyPhase(periods), [periods]);

  if (!RELEVANT_MODES.includes(mode)) return null;
  if (!loaded) return null;
  if (!current) return null;

  const g = GUIDANCE[current.phase];

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Movement for your phase</h3>
        <Badge variant="outline" className={`text-[10px] ml-auto ${g.tone}`}>
          {g.label}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{g.description}</p>

      <ul className="space-y-1.5 mb-3">
        {g.focus.map((line, i) => (
          <li key={i} className="text-xs text-foreground/90 flex items-start gap-1.5">
            <span className="text-primary mt-0.5">·</span>
            <span className="leading-snug">{line}</span>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 leading-relaxed">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <span>
          <span className="font-medium text-foreground/80">Why this works:</span> {g.rationale}
        </span>
      </p>

      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
        Individual response varies — these are tendencies, not rules. If you feel great on a
        day this card calls a recovery day, train. Listen to your body first.
      </p>
    </Card>
  );
}
