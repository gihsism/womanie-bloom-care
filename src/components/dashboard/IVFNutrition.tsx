import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Apple, Info } from 'lucide-react';

// IVF nutrition focus — phase-aware. Stimulation, retrieval, transfer,
// and TWW each have slightly different priorities.

type Phase = 'prep' | 'stimulation' | 'trigger' | 'retrieval' | 'fertilization' | 'transfer' | 'tww' | 'beta' | null;

interface Props {
  phase: Phase;
}

const ALWAYS_TIPS = [
  {
    key: 'mediterranean',
    label: 'Mediterranean pattern',
    amount: 'Daily baseline',
    rationale: 'The largest observational + RCT evidence base for IVF success — olive oil, fish, whole grains, legumes, vegetables, modest dairy, minimal processed meat / sugar / refined grains.',
    food: 'Olive oil instead of butter; fish 2-3×/week; veggies + legumes at lunch + dinner; whole-grain bread / pasta / rice.',
  },
  {
    key: 'folate',
    label: 'Folate / folic acid',
    amount: '600–800 µg/day starting 3 months before transfer',
    rationale: 'Neural tube development starts immediately on implantation. Pre-loading stores matters.',
    food: 'Leafy greens, lentils, fortified cereals, citrus + prenatal vitamin.',
  },
  {
    key: 'protein',
    label: 'Protein',
    amount: '~1.2 g/kg/day',
    rationale: 'Egg quality + ovarian response are linked to adequate protein in trials. Aim for steady intake across the day.',
    food: 'Eggs, fish, poultry, legumes, dairy; distribute across meals.',
  },
];

const PHASE_TIPS: Record<NonNullable<Phase>, { headline: string; bullets: string[] }> = {
  prep: {
    headline: 'Preparation: 3+ months out from transfer.',
    bullets: [
      'Begin or continue your prenatal vitamin with folate now',
      'Start tapering caffeine to ≤200 mg/day (one 12oz coffee)',
      'No alcohol from this point — the evidence on even moderate intake during IVF is consistently negative',
      'Optimise vitamin D (test if you haven\'t): aim 30+ ng/mL',
      'Strength + cardio 4-5×/week unless your clinician says otherwise',
    ],
  },
  stimulation: {
    headline: 'Stimulation: focus on hydration and steady protein.',
    bullets: [
      '2.5–3 L water/day to help with bloating + reduce OHSS-related thirst',
      'Electrolytes (broth, coconut water, sports drinks) if bloating intensifies',
      'Higher protein (~1.5 g/kg) — some clinicians recommend during stim for ovarian support',
      'Avoid strenuous core exercise (twisted ovaries risk); walking + gentle yoga are fine',
    ],
  },
  trigger: {
    headline: 'Trigger to retrieval: rest the digestive system.',
    bullets: [
      'Light meals the day before retrieval — bloating is worst here',
      'Hydrate well but stop fluids 6+ hours before anaesthesia per your clinic\'s instructions',
      'Electrolyte focus, lower-residue foods (white rice, plain bread, broth)',
    ],
  },
  retrieval: {
    headline: 'Retrieval recovery: gentle, anti-inflammatory.',
    bullets: [
      'Anti-inflammatory foods: berries, leafy greens, fatty fish, olive oil, ginger',
      'Continue electrolytes for 1-2 days post — fluid shifts can leave you dehydrated',
      'Easy-to-digest meals; avoid huge salads while the ovaries are still tender',
    ],
  },
  fertilization: {
    headline: 'Embryo culture window: continue Mediterranean + folate.',
    bullets: [
      'Nothing changes diet-wise; keep your steady baseline',
      'Avoid raw fish, deli meats, unpasteurised dairy now — preparing for transfer',
    ],
  },
  transfer: {
    headline: 'Transfer day: warm, easy, hydrated.',
    bullets: [
      'Eat a normal balanced breakfast/lunch — no fasting needed',
      'Warm foods + drinks for the day of transfer (Traditional Chinese Medicine convention, modest evidence, common practice)',
      'No raw / undercooked / high-mercury fish from here on',
      'Keep caffeine at ≤200 mg, no alcohol',
    ],
  },
  tww: {
    headline: 'Two-week wait: stay the course.',
    bullets: [
      'Same baseline as pregnancy: prenatal, no alcohol, ≤200 mg caffeine, no raw fish',
      'Adequate calories — restriction here is counterproductive',
      'Comfort foods are fine if they help with the wait stress',
    ],
  },
  beta: {
    headline: 'Beta test window: pregnancy-grade nutrition.',
    bullets: [
      'Full pregnancy guidelines apply',
      'If beta positive: continue prenatal, hydrate, start the pregnancy nutrition guidance',
      'If beta negative: prioritise iron + B12 + protein for recovery',
    ],
  },
};

export default function IVFNutrition({ phase }: Props) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Apple className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold">IVF nutrition</h3>
        {phase && (
          <Badge variant="outline" className="text-[10px] ml-auto capitalize">
            {phase === 'tww' ? 'Two-week wait' : phase.replace(/_/g, ' ')}
          </Badge>
        )}
      </div>

      {phase && PHASE_TIPS[phase] && (
        <div className="mb-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
          <p className="text-xs font-medium text-foreground/90 mb-2">
            {PHASE_TIPS[phase].headline}
          </p>
          <ul className="space-y-1">
            {PHASE_TIPS[phase].bullets.map((b, i) => (
              <li key={i} className="text-[11px] text-foreground/80 flex items-start gap-1.5">
                <span className="text-primary mt-0.5">·</span>
                <span className="leading-snug">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mb-2 font-medium">Baseline through every phase</p>
      <ul className="space-y-3">
        {ALWAYS_TIPS.map(t => (
          <li key={t.key} className="text-xs">
            <div className="flex flex-wrap items-baseline gap-x-2 mb-0.5">
              <span className="font-medium text-foreground/90">{t.label}</span>
              <span className="text-muted-foreground">— {t.amount}</span>
            </div>
            <p className="text-muted-foreground leading-snug">{t.rationale}</p>
            <p className="text-[11px] text-muted-foreground/80 leading-snug mt-0.5">
              <span className="font-medium">Food:</span> {t.food}
            </p>
          </li>
        ))}
      </ul>

      <p className="text-[10px] text-muted-foreground mt-3 flex items-start gap-1.5 leading-relaxed">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        General guidance. Your clinic's protocol takes precedence — follow their specific
        instructions on supplements, fasting before retrieval, and any restrictions.
      </p>
    </Card>
  );
}
