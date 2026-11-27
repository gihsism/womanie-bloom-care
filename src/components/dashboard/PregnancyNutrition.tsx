import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Apple, Info, AlertCircle } from 'lucide-react';

// Trimester-aware nutrition focus for pregnancy mode. Adapts to the
// week count PregnancyTracker computes from pregnancy_due_date.
//
//   T1 (weeks 0-13):  folate, iodine, B6 for nausea, hydration
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
    amount: '400 µg/day as a tablet',
    rationale: 'The neural tube (the baby\'s brain and spine) closes in the first weeks of pregnancy, often before you know you are pregnant. Swiss advice (BLV): 400 µg folic acid a day on top of a balanced diet, ideally from before pregnancy, until at least the end of week 12. Most prenatal vitamins include it.',
    food: 'Leafy greens, cabbage, legumes, wholegrains, oranges, plus your tablet.',
  },
  {
    key: 'iodine',
    label: 'Iodine',
    amount: 'Iodised salt at home',
    rationale: 'Pregnancy raises iodine needs (for thyroid hormones), and most foods contain little. Swiss advice (BLV): always use iodised salt and choose bread made with it; ask your gynaecologist whether you also need an iodine tablet.',
    food: 'Iodised salt, sea fish, dairy, eggs.',
  },
  {
    key: 'b6',
    label: 'Vitamin B6',
    amount: 'Ask your doctor or pharmacist about the dose',
    rationale: 'Can ease mild morning sickness, alone or combined with an anti-sickness medicine (RCOG 2024 guideline). Ask before you take it.',
    food: 'Bananas, chicken, fortified cereals, baked potato; talk to your provider before supplementing high-dose.',
  },
  {
    key: 'fluids',
    label: 'Fluids',
    amount: '1.5–2 L of drinks a day (Swiss BLV), more if you are being sick',
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
    amount: 'Iron-rich food every day',
    rationale: 'Blood volume rises by about 40–50%, so needs go up (US advice: 27 mg a day; the European Food Safety Authority: 16 mg). In Switzerland (BLV) iron tablets are not advised for everyone, only when your doctor prescribes them.',
    food: 'Red meat, lentils, spinach, fortified cereals + vitamin C for absorption.',
  },
  {
    key: 'calcium',
    label: 'Calcium',
    amount: 'About 950 mg/day, no extra in pregnancy',
    rationale: 'Baby\'s skeleton is mineralising. Your body absorbs calcium better in pregnancy, so the Swiss reference amount (BLV) stays at about 950 mg a day, mainly from food.',
    food: 'Dairy, fortified plant milks, leafy greens, sardines, tofu set with calcium.',
  },
  {
    key: 'dha',
    label: 'Omega-3 DHA',
    amount: 'Oily fish regularly',
    rationale: 'DHA helps the baby\'s brain and eyes develop; the European Food Safety Authority advises about 100–200 mg extra DHA a day in pregnancy. Swiss advice (BLV): eat oily fish regularly; capsules from fish oil or algae only after talking to your doctor.',
    food: 'Salmon, sardines, anchovies (see the fish limits below), walnuts, rapeseed oil.',
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
    amount: 'Iron-rich food every day',
    rationale: 'Needs stay high. Your doctor checks your blood count; take iron tablets only if they are prescribed.',
    food: 'Red meat, lentils, fortified cereals; pair with vitamin C.',
  },
  {
    key: 'vit-d',
    label: 'Vitamin D',
    amount: '600 IU/day as drops (Swiss BLV)',
    rationale: 'Important for the baby\'s bones. Swiss advice (BLV): take vitamin D drops every day throughout pregnancy and agree the dose with your midwife or doctor. More than 4,000 IU a day only on medical advice.',
    food: 'Fatty fish, fortified milk; supplement is the most reliable source.',
  },
  {
    key: 'fibre',
    label: 'Fibre + fluids',
    amount: 'At least 25 g fibre, 1.5–2 L of drinks',
    rationale: 'Constipation peaks in T3 (progesterone slows gut transit, baby compresses bowel). Fibre + water + walking + iron supplement timing all matter.',
    food: 'Whole grains, beans, fruit (prunes especially), vegetables.',
  },
  {
    key: 'complex-carbs',
    label: 'Complex carbs + protein at every meal',
    amount: 'About 500 extra kcal/day from month 7',
    rationale: 'Swiss advice (BLV, for women of normal weight): about 250 extra kcal a day from month 4 and about 500 from month 7, "not twice as much, but twice as well"; the UK NICE guideline says about 200 extra in the last 3 months. Blood sugar volatility worsens (insulin resistance is normal in pregnancy but extreme spikes feel awful). Steady protein + complex carbs steady the curve.',
    food: 'Oats, sweet potato, quinoa, brown rice + lean protein each meal.',
  },
];

const AVOID = [
  'Raw fish / sushi (listeria + parasite risk)',
  'Fish high in mercury: no shark, swordfish or marlin; fresh or tinned tuna at most once a week (Swiss BLV)',
  'Unpasteurised dairy + soft cheeses unless labelled pasteurised',
  'Deli meats unless heated to steaming (listeria)',
  'Raw or undercooked eggs and meat',
  'Alcohol: none in pregnancy; no safe amount is known (BLV, NHS)',
  'Caffeine in moderation: for example 1 to 2 cups of coffee or up to 4 cups of black or green tea a day (Swiss BLV); the EU food safety authority and the NHS set the limit at 200 mg a day. Avoid energy drinks',
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
        <Apple className="h-4 w-4 text-primary" />
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
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          Foods + drinks to avoid
        </summary>
        <ul className="mt-2 space-y-1">
          {AVOID.map((line, i) => (
            <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <span className="text-destructive/70 mt-0.5">·</span>
              <span className="leading-snug">{line}</span>
            </li>
          ))}
        </ul>
      </details>

      <p className="text-[10px] text-muted-foreground mt-3 flex items-start gap-1.5 leading-relaxed">
        <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
        General references — your provider may tailor doses for your specific situation
        (vegan, twins, gestational diabetes, anaemia, etc.). Always keep them in the loop.
        Swiss amounts and limits: BLV brochure &quot;Ernährung rund um Schwangerschaft und Stillzeit&quot; (August 2025).
      </p>
    </Card>
  );
}
