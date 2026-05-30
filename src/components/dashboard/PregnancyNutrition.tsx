import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Apple, Info, AlertCircle } from 'lucide-react';

// Trimester-aware nutrition focus for pregnancy mode. Adapts to the
// week count PregnancyTracker computes from pregnancy_due_date.
//
//   T1 (weeks 0-13):  folate, B6 for nausea, hydration
//   T2 (weeks 14-26): iron, calcium, omega-3 DHA, choline
//   T3 (weeks 27-40): iron, vit D, fibre, steady carbs
//
// Plus a persistent "foods to avoid" reminder — listeria-risk foods,
// high-mercury fish, raw items, and alcohol. The basics, but easy
// to forget around month 6.

interface Props {
  weeksPregnant: number;
}

interface NutrientTip {
  key: string;
  label: string;
  amount: string;
  rationale: string;
  food: string;
}

const T1_TIPS: NutrientTip[] = [
  {
    key: 'folate',
    label: 'Folate / folic acid',
    amount: '400–600 µg/day',
    rationale: 'Critical for neural tube formation in the first 4-6 weeks; most prenatal vitamins include this. The other tube closes by week 7 — by the time many people know they\'re pregnant, the window is partly past.',
    food: 'Leafy greens, fortified cereals, citrus, legumes, plus your prenatal.',
  },
  {
    key: 'b6',
    label: 'Vitamin B6',
    amount: '~25 mg/day if nauseous',
    rationale: 'Evidence-backed for morning sickness relief at typical-pregnancy doses. Often combined with doxylamine (Unisom) under provider guidance.',
    food: 'Bananas, chicken, fortified cereals, baked potato; talk to your provider before supplementing high-dose.',
  },
  {
    key: 'fluids',
    label: 'Fluids',
    amount: '2.3 L/day + extra if nauseous',
    rationale: 'Dehydration worsens nausea and headaches. Small sips often beats large gulps if drinks are hard to keep down.',
    food: 'Water, herbal tea, broth, electrolyte drinks; cold or fizzy options help if nauseous.',
  },
  {
    key: 'small-meals',
    label: 'Frequent small meals',
    amount: '5–6 small meals/day',
    rationale: 'Empty stomach amplifies nausea. Keeping something light (crackers, toast) every 2–3 hours often manages first-trimester appetite better than three big meals.',
    food: 'Anything bland that appeals; nausea preferences are highly individual.',
  },
];

const T2_TIPS: NutrientTip[] = [
  {
    key: 'iron',
    label: 'Iron',
    amount: '27 mg/day',
    rationale: 'Blood volume expands ~50% in T2. Demand spikes; deficiency is the leading nutritional issue of pregnancy.',
    food: 'Red meat, lentils, spinach, fortified cereals + vitamin C for absorption.',
  },
  {
    key: 'calcium',
    label: 'Calcium',
    amount: '1000 mg/day',
    rationale: 'Baby\'s skeleton is mineralising. If intake is low, baby draws from your bones — adequate calcium spares yours.',
    food: 'Dairy, fortified plant milks, leafy greens, sardines, tofu set with calcium.',
  },
  {
    key: 'dha',
    label: 'Omega-3 DHA',
    amount: '~300 mg/day',
    rationale: 'T2-T3 is the peak window for brain development. DHA crosses the placenta; maternal stores predict outcomes.',
    food: 'Low-mercury fish 2-3×/week (salmon, sardines, anchovies), walnuts, flax, algae-based DHA supplement.',
  },
  {
    key: 'choline',
    label: 'Choline',
    amount: '450 mg/day',
    rationale: 'Critical for neural development. Most prenatals under-deliver — worth a food focus.',
    food: 'Egg yolks (one of the best sources), beef, salmon, peanuts, soy.',
  },
];

const T3_TIPS: NutrientTip[] = [
  {
    key: 'iron-t3',
    label: 'Iron (continued)',
    amount: '27 mg/day',
    rationale: 'Demand stays high; you\'re also building stores that will get tested during delivery + the first weeks postpartum.',
    food: 'Red meat, lentils, fortified cereals; pair with vitamin C.',
  },
  {
    key: 'vit-d',
    label: 'Vitamin D',
    amount: '600–2000 IU/day',
    rationale: 'Supports baby\'s bones + your immune system. Many practitioners now recommend 1000-2000 IU for pregnancy — discuss with your provider.',
    food: 'Fatty fish, fortified milk; supplement is the most reliable source.',
  },
  {
    key: 'fibre',
    label: 'Fibre + fluids',
    amount: '25–30 g fibre, 2.3+ L water',
    rationale: 'Constipation peaks in T3 (progesterone slows gut transit, baby compresses bowel). Fibre + water + walking + iron supplement timing all matter.',
    food: 'Whole grains, beans, fruit (prunes especially), vegetables.',
  },
  {
    key: 'complex-carbs',
    label: 'Complex carbs + protein at every meal',
    amount: '300–500 extra kcal/day in T3',
    rationale: 'Energy needs rise; blood sugar volatility worsens (insulin resistance is normal in pregnancy but extreme spikes feel awful). Steady protein + complex carbs steady the curve.',
    food: 'Oats, sweet potato, quinoa, brown rice + lean protein each meal.',
  },
];

const AVOID = [
  'Raw fish / sushi (listeria + parasite risk)',
  'High-mercury fish (shark, swordfish, king mackerel, bigeye tuna)',
  'Unpasteurised dairy + soft cheeses unless labelled pasteurised',
  'Deli meats unless heated to steaming (listeria)',
  'Raw or undercooked eggs and meat',
  'Alcohol — no safe known threshold',
  'Limit caffeine to ~200 mg/day (1 large coffee)',
];

export default function PregnancyNutrition({ weeksPregnant }: Props) {
  const trimester = useMemo(() => {
    if (weeksPregnant < 14) return 1;
    if (weeksPregnant < 27) return 2;
    return 3;
  }, [weeksPregnant]);

  const tips = trimester === 1 ? T1_TIPS : trimester === 2 ? T2_TIPS : T3_TIPS;
  const trimesterLabel = trimester === 1 ? 'First trimester' : trimester === 2 ? 'Second trimester' : 'Third trimester';

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Apple className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold">Pregnancy nutrition</h3>
        <Badge variant="outline" className="text-[10px] ml-auto">{trimesterLabel}</Badge>
      </div>

      <ul className="space-y-3 mb-4">
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

      {/* Foods to avoid — same across trimesters, easy to forget */}
      <details className="border-t border-border/40 pt-3">
        <summary className="text-xs font-medium flex items-center gap-1.5 cursor-pointer">
          <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
          Foods + drinks to avoid
        </summary>
        <ul className="mt-2 space-y-1">
          {AVOID.map((line, i) => (
            <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <span className="text-amber-600 mt-0.5">·</span>
              <span className="leading-snug">{line}</span>
            </li>
          ))}
        </ul>
      </details>

      <p className="text-[10px] text-muted-foreground mt-3 flex items-start gap-1.5 leading-relaxed">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        General references — your provider may tailor doses for your specific situation
        (vegan, twins, gestational diabetes, anaemia, etc.). Always keep them in the loop.
      </p>
    </Card>
  );
}
