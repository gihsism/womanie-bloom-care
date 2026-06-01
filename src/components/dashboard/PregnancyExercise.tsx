import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Info, AlertCircle } from 'lucide-react';

// Trimester-aware movement guidance for pregnancy mode.
// Conservative — defers to clinician on the always-cleared question.
// Mirrors PregnancyNutrition for symmetry.

interface Props {
  weeksPregnant: number;
}

interface PhaseTips {
  label: string;
  description: string;
  yes: string[];
  caution: string[];
  rationale: string;
}

const T1: PhaseTips = {
  label: 'First trimester',
  description: 'Weeks 0–13. Nausea and fatigue often dominate; consistency beats intensity.',
  yes: [
    'Walking — the most reliable habit if energy is low',
    'Continue what you did pre-pregnancy at slightly lower intensity',
    'Strength training — moderate weight, normal range of motion is fine',
    'Yoga (skip hot yoga and deep twists)',
    'Swimming — feels easier on the body, helps with nausea for some',
  ],
  caution: [
    'Skip if you have spotting, cramping, or your provider has flagged any concern',
    'No new sports or extreme intensity — pregnancy isn\'t the time for unfamiliar movement',
    'Hot tubs / saunas / hot yoga — heat exposure best avoided',
    'Contact sports / high fall risk (skiing, climbing, horseback) typically stopped here',
  ],
  rationale: 'No good evidence that moderate exercise harms early pregnancy in low-risk women; ACOG actively recommends 150 min/week of moderate activity unless contraindicated.',
};

const T2: PhaseTips = {
  label: 'Second trimester',
  description: 'Weeks 14–26. Often the energy sweet spot. Body changes start to affect mechanics.',
  yes: [
    'Walking, prenatal yoga, swimming, stationary bike — all reliable',
    'Strength training continues — modify exercises for the changing centre of gravity',
    'Pelvic floor work (Kegels) starting now pays off for labour + recovery',
    'Stretching for hip flexors + hamstrings (relaxin loosens joints — work range, not extremes)',
    'Stop supine (on-back) exercises after ~20 weeks — vena cava compression',
  ],
  caution: [
    'Avoid moves that require lying flat on your back for more than a minute or two',
    'Modify or skip deep abdominal work; diastasis recti starts to develop',
    'Joint laxity rises — be careful with lunges, deep squats, sudden directional changes',
    'Hydrate aggressively — blood volume is up ~50% and the body sweats sooner',
  ],
  rationale: 'Relaxin loosens ligaments to prepare the pelvis; the trade-off is increased risk of strain. Avoid lying flat from ~week 20 because the growing uterus compresses the vena cava.',
};

const T3: PhaseTips = {
  label: 'Third trimester',
  description: 'Weeks 27–40. Goal is comfortable preparation for labour, not performance.',
  yes: [
    'Walking — still the highest-leverage option',
    'Prenatal yoga + breathing practice (pays off in labour)',
    'Swimming — buoyancy is a huge relief for back / pelvis',
    'Cat-cow, hip openers, gentle squats (great labour prep)',
    'Continue pelvic floor work — both contraction AND relaxation matter',
    'Perineal massage from week 34 (with provider guidance) reduces tearing',
  ],
  caution: [
    'Heart rate isn\'t a great gauge anymore — use perceived effort (talk test)',
    'Avoid moves with high fall risk; balance is shifted',
    'Round ligament pain is normal but worsens with sudden movement / lifting',
    'Stop if you feel dizzy, short of breath, contractions, or any leaking fluid',
  ],
  rationale: 'Comfort and pelvis-preparation matter more than fitness gains. Walking, controlled hip work, and breathing practice are the most evidence-backed labour-prep activities.',
};

const ALWAYS_STOP_AND_CALL = [
  'Vaginal bleeding',
  'Regular painful contractions',
  'Fluid leaking from the vagina',
  'Severe shortness of breath before exertion',
  'Chest pain',
  'Calf swelling or pain (DVT risk)',
  'Decreased fetal movement (≥ 28 weeks)',
];

export default function PregnancyExercise({ weeksPregnant }: Props) {
  const tips = useMemo(() => {
    if (weeksPregnant < 14) return T1;
    if (weeksPregnant < 27) return T2;
    return T3;
  }, [weeksPregnant]);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Movement in pregnancy</h3>
        <Badge variant="outline" className="text-[10px] ml-auto">{tips.label}</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{tips.description}</p>

      <p className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1.5">Generally fine</p>
      <ul className="space-y-1 mb-3">
        {tips.yes.map((line, i) => (
          <li key={i} className="text-xs text-foreground/90 flex items-start gap-1.5">
            <span className="text-emerald-600 mt-0.5">·</span>
            <span className="leading-snug">{line}</span>
          </li>
        ))}
      </ul>

      <p className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1.5">Pause or modify</p>
      <ul className="space-y-1 mb-3">
        {tips.caution.map((line, i) => (
          <li key={i} className="text-xs text-foreground/90 flex items-start gap-1.5">
            <span className="text-amber-600 mt-0.5">·</span>
            <span className="leading-snug">{line}</span>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 leading-relaxed">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <span>
          <span className="font-medium text-foreground/80">Why this matters:</span> {tips.rationale}
        </span>
      </p>

      <details className="mt-3 border-t border-border/40 pt-3">
        <summary className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-red-600" />
          Stop and call your provider if…
        </summary>
        <ul className="mt-2 space-y-1">
          {ALWAYS_STOP_AND_CALL.map((line, i) => (
            <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <span className="text-red-600 mt-0.5">·</span>
              <span className="leading-snug">{line}</span>
            </li>
          ))}
        </ul>
      </details>

      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        Guidance is general. Pregnancies with placenta previa, preeclampsia, twins, IVF
        considerations, or any cervical issue may need a much more conservative plan —
        defer to your provider's specific instructions.
      </p>
    </Card>
  );
}
