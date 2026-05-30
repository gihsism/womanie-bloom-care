import { Card } from '@/components/ui/card';
import { Apple, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Menopause / post-menopause nutrition focus card.
//
// The Mediterranean / DASH pattern has the strongest evidence base
// for symptom relief + cardiovascular protection in this window —
// we anchor on that and add the specific micronutrient targets
// that shift as estrogen drops.

interface Props {
  postmenopausal: boolean;
}

const TIPS = [
  {
    key: 'calcium',
    label: 'Calcium',
    amount: '1200 mg/day (post-menopause)',
    rationale: 'Estrogen falls → bone density drops faster. Adequate calcium + vitamin D is the most evidence-backed nutritional lever for osteoporosis prevention.',
    food: 'Dairy (yogurt, kefir, hard cheese), fortified plant milks, sardines, tofu set with calcium, leafy greens.',
  },
  {
    key: 'vit-d',
    label: 'Vitamin D',
    amount: '800–2000 IU/day',
    rationale: 'Needed for calcium absorption + mood + immunity. Deficiency is common; many clinicians recommend testing once a year.',
    food: 'Fatty fish, fortified milk, egg yolks; supplement is the most reliable path.',
  },
  {
    key: 'protein',
    label: 'Protein',
    amount: '~1.0–1.2 g/kg/day',
    rationale: 'Sarcopenia (muscle loss) accelerates after menopause. Strength training plus higher protein intake protects against falls and metabolic decline.',
    food: 'Distribute across meals: eggs, fish, poultry, legumes, dairy, tofu.',
  },
  {
    key: 'phytoestrogens',
    label: 'Phytoestrogens (modest)',
    amount: 'Whole-food sources',
    rationale: 'Soy / flax may help with hot flashes for some women; evidence is mixed but population data from Japan and Mediterranean diets is suggestive. Whole foods, not concentrated supplements.',
    food: 'Edamame, tempeh, tofu, ground flaxseed (1-2 tbsp/day), chickpeas.',
  },
  {
    key: 'fibre',
    label: 'Fibre + heart-healthy fats',
    amount: '25–30 g fibre, omega-3 2-3×/week',
    rationale: 'Cardiovascular risk rises sharply after menopause; LDL tends up, HDL tends down. Mediterranean-style diet has the strongest evidence base.',
    food: 'Whole grains, beans, vegetables, fatty fish, olive oil, nuts.',
  },
];

const SYMPTOM_FOCUS = [
  {
    symptom: 'Hot flashes',
    suggestion: 'Reduce alcohol + caffeine + spicy foods if you notice they trigger. Some studies show modest benefit from soy isoflavones, vitamin E.',
  },
  {
    symptom: 'Sleep',
    suggestion: 'Magnesium-rich foods evening (almonds, dark chocolate, leafy greens). Avoid heavy meals + alcohol close to bedtime.',
  },
  {
    symptom: 'Weight + body comp',
    suggestion: 'Estrogen drop shifts fat distribution and slows metabolism slightly. Strength + protein matter more than calorie cuts.',
  },
  {
    symptom: 'Mood',
    suggestion: 'Steady blood sugar (complex carbs + protein) + omega-3 + adequate B12 + vitamin D have the most consistent evidence.',
  },
];

export default function MenopauseNutrition({ postmenopausal }: Props) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Apple className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold">Nutrition through menopause</h3>
        <Badge variant="outline" className="text-[10px] ml-auto">
          {postmenopausal ? 'Post-menopause' : 'Transition'}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Mediterranean / DASH eating pattern has the strongest evidence for cardiovascular protection + symptom relief in this window.
      </p>

      <ul className="space-y-3 mb-4">
        {TIPS.map(t => (
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

      <details className="border-t border-border/40 pt-3">
        <summary className="text-xs font-medium cursor-pointer">For specific symptoms</summary>
        <ul className="mt-2 space-y-2">
          {SYMPTOM_FOCUS.map(s => (
            <li key={s.symptom} className="text-[11px]">
              <span className="font-medium text-foreground/80">{s.symptom}:</span>{' '}
              <span className="text-muted-foreground">{s.suggestion}</span>
            </li>
          ))}
        </ul>
      </details>

      <p className="text-[10px] text-muted-foreground mt-3 flex items-start gap-1.5 leading-relaxed">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        General guidance. If you have osteoporosis, cardiovascular disease, thyroid issues, or
        are on HRT, talk to your provider about a tailored plan.
      </p>
    </Card>
  );
}
