import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Apple, Info } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import { differenceInDays, parseISO } from 'date-fns';
import type { LifeStage } from './DashboardHeader';

// Phase-aware nutrition focus for cycle-tracking modes. The nutritional
// "right" thing shifts somewhat across the cycle:
//   menstrual — iron + B vitamins to replace what's lost
//   follicular — protein + fermented foods + variety (estrogen rising)
//   ovulation — antioxidants + fiber (estrogen peak)
//   luteal — magnesium + complex carbs + steady protein (PMS support)
//
// This card picks the user's current phase from her cycle and shows
// the relevant focus. Self-hides if no period_tracking data exists
// (we can't classify phase without it).
//
// Cycle mode only.

type Phase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

interface PhaseGuidance {
  label: string;
  description: string;
  focus: string[];
  rationale: string;
  caution?: string;
}

const GUIDANCE: Record<Phase, PhaseGuidance> = {
  menstrual: {
    label: 'Menstrual phase',
    description: 'Days 1–5: replenishing what bleeding takes out.',
    focus: [
      'Iron-rich foods (red meat, lentils, spinach, fortified cereals) paired with vitamin C for absorption',
      'B vitamins (whole grains, eggs, leafy greens)',
      'Hydration — bleeding + fluid shifts mean easy to under-drink',
      'Magnesium-rich foods (dark chocolate, nuts, seeds) for cramp relief',
    ],
    rationale: 'Each cycle, an average period loses 15–25 mg of iron. Over a year that adds up — ferritin often drops if intake is low.',
    caution: 'Heavy flow (>3 days of heavy bleeding) is a clinical screening signal for menorrhagia — worth a doctor visit if it\'s the new normal.',
  },
  follicular: {
    label: 'Follicular phase',
    description: 'Post-period, rising estrogen — energy and recovery.',
    focus: [
      'Variety of vegetables (the fibre supports estrogen metabolism)',
      'Fermented foods (kefir, kimchi, yogurt) for gut health',
      'Lean protein for tissue repair',
      'Cruciferous vegetables (broccoli, kale, cauliflower) — DIM compound aids estrogen detox',
    ],
    rationale: 'Estrogen peaks across this phase. Eating to support its healthy metabolism reduces some PMS-window symptoms later.',
  },
  ovulation: {
    label: 'Ovulation',
    description: 'Estrogen at its peak. Antioxidants and fibre.',
    focus: [
      'Berries, citrus, leafy greens — antioxidant load',
      'Whole grains and legumes for fibre + sustained energy',
      'Omega-3 sources (salmon, walnuts, flax) — anti-inflammatory',
      'Light, frequent meals if you notice digestion shifts',
    ],
    rationale: 'Cervical mucus and uterine lining peak here. The body is at its most metabolically active — fuel it well, hydrate, but don\'t over-eat.',
  },
  luteal: {
    label: 'Luteal phase',
    description: 'Post-ovulation — PMS prevention through diet.',
    focus: [
      'Magnesium-rich foods (almonds, pumpkin seeds, dark chocolate, leafy greens) — strongest evidence for PMS symptom relief',
      'Complex carbs (oats, sweet potato, brown rice) for stable mood',
      'Steady protein with each meal — blood-sugar dips amplify PMS irritability',
      'Reduce caffeine + alcohol if you\'re sensitive — both can worsen breast tenderness, anxiety, sleep',
      'Calcium-rich foods — some evidence for PMS support',
    ],
    rationale: 'Progesterone rises then drops in the last 5–7 days. Stable blood sugar + magnesium + B6 are the most evidence-backed nutritional levers for PMS.',
  },
};

const RELEVANT_MODES: LifeStage[] = [
  'menstrual-cycle', 'conception', 'pre-menstrual', 'contraception',
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

function classifyCurrentPhase(periodRecords: PeriodRow[]): { phase: Phase; dayOfCycle: number } | null {
  if (periodRecords.length === 0) return null;
  const sorted = [...periodRecords].sort(
    (a, b) => Date.parse(b.period_start_date) - Date.parse(a.period_start_date)
  );
  const last = sorted[0];
  const lastStart = parseISO(last.period_start_date);
  const today = new Date();
  const day = differenceInDays(today, lastStart);
  // Use the typical cycle length stored, fallback to 28.
  const cycleLength = last.cycle_length ?? 28;
  if (day < 0 || day >= cycleLength + 14) return null;
  if (day < MENSTRUAL_LEN) return { phase: 'menstrual', dayOfCycle: day + 1 };
  const ovulationDay = cycleLength - LUTEAL_LEN;
  if (day >= ovulationDay - 1 && day <= ovulationDay + 1) return { phase: 'ovulation', dayOfCycle: day + 1 };
  if (day < ovulationDay - 1) return { phase: 'follicular', dayOfCycle: day + 1 };
  return { phase: 'luteal', dayOfCycle: day + 1 };
}

export default function CyclePhaseNutrition({ mode }: Props) {
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

  const current = useMemo(() => classifyCurrentPhase(periods), [periods]);

  if (!RELEVANT_MODES.includes(mode)) return null;
  if (!loaded) return null;
  if (!current) return null;

  const g = GUIDANCE[current.phase];

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Apple className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold">Nutrition for your phase</h3>
        <Badge variant="outline" className="text-[10px] ml-auto">
          Day {current.dayOfCycle}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        <span className="font-medium text-foreground/90">{g.label}.</span> {g.description}
      </p>

      <ul className="space-y-1.5 mb-3">
        {g.focus.map((line, i) => (
          <li key={i} className="text-xs text-foreground/90 flex items-start gap-1.5">
            <span className="text-emerald-600 mt-0.5">·</span>
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

      {g.caution && (
        <p className="text-[10px] text-muted-foreground/80 mt-2 leading-relaxed">
          <span className="font-medium">Note:</span> {g.caution}
        </p>
      )}
    </Card>
  );
}
