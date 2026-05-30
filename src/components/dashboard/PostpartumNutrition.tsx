import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Apple, Info } from 'lucide-react';

// Postpartum nutrition reference card. Curated, evidence-based,
// non-prescriptive. The numbers are the standard recommendations
// you'd hear at a 6-week visit; we surface them in one place so
// the new mom doesn't have to dig through ten browser tabs.
//
// Adapts the headline guidance to weeks-postpartum:
//   weeks 0-6:   recovery + iron replenishment focus
//   weeks 6-26:  sustained recovery + breastfeeding (where applicable)
//   weeks 26+:   maintenance, attention to depletion (B12, D, calcium)

interface PostpartumNutritionProps {
  weeksPostpartum: number;
}

interface NutrientTip {
  key: string;
  label: string;
  amount: string;
  rationale: string;
  food: string;
}

const NUTRIENTS_EARLY: NutrientTip[] = [
  {
    key: 'iron',
    label: 'Iron',
    amount: '~18 mg/day (more if you bled heavily)',
    rationale: 'Delivery blood loss often drops ferritin into deficiency range — fatigue that mimics "just baby tired" can be iron, not sleep.',
    food: 'Red meat, lentils, spinach, fortified cereals; pair with vitamin C for absorption.',
  },
  {
    key: 'protein',
    label: 'Protein',
    amount: '~1.5 g/kg/day during recovery',
    rationale: 'Tissue repair, milk production, and steady energy — even non-breastfeeders need more than usual for the first few weeks.',
    food: 'Eggs, fish, legumes, yogurt, chicken; aim for a fist-sized portion at every meal.',
  },
  {
    key: 'hydration',
    label: 'Fluids',
    amount: '2.5–3 L/day (more if breastfeeding)',
    rationale: 'Easy to under-drink with hands full of baby; dehydration shows up as headache, low milk supply, constipation.',
    food: 'Water, herbal tea, broth; keep a bottle within arm\'s reach wherever you feed.',
  },
];

const NUTRIENTS_SUSTAINED: NutrientTip[] = [
  {
    key: 'vit-d',
    label: 'Vitamin D',
    amount: '1000–2000 IU/day',
    rationale: 'Postpartum vitamin D depletion is common, especially if breastfeeding (baby pulls from your stores). Supports mood, bone, immunity.',
    food: 'Fatty fish, fortified milk; supplement is the most reliable path.',
  },
  {
    key: 'omega-3',
    label: 'Omega-3 (DHA)',
    amount: '~300 mg DHA/day if breastfeeding',
    rationale: 'Linked to maternal mood + baby brain development. Often included in prenatal vitamins — keep taking yours.',
    food: 'Salmon, sardines, walnuts, flax; algae-based DHA supplement if vegetarian.',
  },
  {
    key: 'b12',
    label: 'Vitamin B12',
    amount: '~2.8 µg/day',
    rationale: 'Energy + nerve recovery. Slightly elevated need while breastfeeding. Vegan diet needs supplementation here.',
    food: 'Animal products, fortified nutritional yeast, fortified cereals.',
  },
  {
    key: 'calcium',
    label: 'Calcium',
    amount: '1000–1300 mg/day',
    rationale: 'Bone density can dip during breastfeeding — usually recovers, but adequate intake helps. Pair with vitamin D for absorption.',
    food: 'Dairy, leafy greens, fortified plant milks, sardines with bones, tofu set with calcium.',
  },
];

const NUTRIENTS_LATER: NutrientTip[] = [
  {
    key: 'iron-check',
    label: 'Iron (recheck)',
    amount: 'Ferritin recheck if still tired',
    rationale: 'Stores can stay low for 6–12 months if you bled heavily. Worth a lab if energy hasn\'t come back.',
    food: 'Same sources as early postpartum.',
  },
  {
    key: 'b-vitamins',
    label: 'B vitamins',
    amount: 'Continue prenatal or B-complex',
    rationale: 'Many practitioners recommend staying on a prenatal for a year after birth, especially while breastfeeding.',
    food: 'Whole grains, eggs, leafy greens, meat.',
  },
  {
    key: 'fiber',
    label: 'Fiber',
    amount: '25–30 g/day',
    rationale: 'Postpartum constipation is common (pelvic floor + dehydration + iron supplements). Worth optimising once recovery is past acute phase.',
    food: 'Whole grains, beans, fruit, vegetables; stay hydrated alongside.',
  },
];

export default function PostpartumNutrition({ weeksPostpartum }: PostpartumNutritionProps) {
  const { headline, tips } = useMemo(() => {
    if (weeksPostpartum <= 6) {
      return {
        headline: 'Early recovery focus — iron, protein, fluids.',
        tips: NUTRIENTS_EARLY,
      };
    }
    if (weeksPostpartum <= 26) {
      return {
        headline: 'Sustained recovery — vitamin D, omega-3, B12, calcium.',
        tips: NUTRIENTS_SUSTAINED,
      };
    }
    return {
      headline: 'Six months and beyond — recheck stores, fill any gaps.',
      tips: NUTRIENTS_LATER,
    };
  }, [weeksPostpartum]);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Apple className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold">Postpartum nutrition</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{headline}</p>

      <ul className="space-y-3">
        {tips.map(t => (
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
        General guidance, not medical advice. If you're vegan, vegetarian, recovering from
        heavy bleeding, or have a thyroid / autoimmune condition, talk to your provider about
        a tailored plan.
      </p>
    </Card>
  );
}
