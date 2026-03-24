import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Link2 } from 'lucide-react';

interface LabResult {
  title: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  date_recorded: string | null;
  data_type: string;
}

interface CrossInsight {
  title: string;
  emoji: string;
  connectedTests: string[];
  explanation: string;
  recommendation: string;
  severity: 'positive' | 'neutral' | 'attention' | 'urgent';
}

interface PersonalizedInsightsProps {
  medicalData: LabResult[];
  lifeStage?: string | null;
}

function findTest(data: LabResult[], names: string[]): { value: number; status: string | null; raw: LabResult } | null {
  for (const name of names) {
    const match = data.find(
      d => d.data_type === 'lab_result' && d.title.toLowerCase().includes(name.toLowerCase()) && d.value && !isNaN(parseFloat(d.value))
    );
    if (match) return { value: parseFloat(match.value!), status: match.status, raw: match };
  }
  return null;
}

function hasCondition(data: LabResult[], names: string[]): boolean {
  return data.some(d =>
    d.data_type === 'condition' &&
    d.status === 'active' &&
    names.some(n => d.title.toLowerCase().includes(n.toLowerCase()))
  );
}

function generateCrossInsights(data: LabResult[], lifeStage?: string | null): CrossInsight[] {
  const insights: CrossInsight[] = [];

  const iron = findTest(data, ['Iron', 'Serum Iron']);
  const ferritin = findTest(data, ['Ferritin']);
  const hemoglobin = findTest(data, ['Hemoglobin', 'Hb', 'Hgb']);
  const vitD = findTest(data, ['Vitamin D', '25-OH Vitamin D', '25-Hydroxyvitamin D']);
  const vitB12 = findTest(data, ['Vitamin B12', 'B12', 'Cobalamin']);
  const folate = findTest(data, ['Folate', 'Folic Acid']);
  const tsh = findTest(data, ['TSH']);
  const glucose = findTest(data, ['Glucose', 'Fasting Glucose']);
  const hba1c = findTest(data, ['HbA1c', 'Hemoglobin A1c', 'Glycated Hemoglobin']);
  const cholesterol = findTest(data, ['Total Cholesterol', 'Cholesterol']);
  const ldl = findTest(data, ['LDL', 'LDL Cholesterol']);
  const hdl = findTest(data, ['HDL', 'HDL Cholesterol']);
  const crp = findTest(data, ['CRP', 'C-Reactive Protein', 'hs-CRP']);
  const testosterone = findTest(data, ['Testosterone', 'Free Testosterone']);
  const progesterone = findTest(data, ['Progesterone']);
  const estradiol = findTest(data, ['Estradiol', 'E2']);
  const calcium = findTest(data, ['Calcium']);
  const magnesium = findTest(data, ['Magnesium']);
  const platelets = findTest(data, ['Platelets']);
  const wbc = findTest(data, ['White Blood Cells', 'WBC']);

  // Iron + Hemoglobin + Period connection
  if (ferritin && ferritin.value < 30) {
    const relatedTests = ['Ferritin'];
    if (hemoglobin) relatedTests.push('Hemoglobin');
    if (iron) relatedTests.push('Iron');

    const isAnemic = hemoglobin && hemoglobin.value < 12;
    insights.push({
      title: isAnemic ? 'Low iron & anemia — may be linked to your periods' : 'Your iron stores are running low',
      emoji: '🩸',
      connectedTests: relatedTests,
      explanation: isAnemic
        ? 'Your ferritin (iron stores) and hemoglobin are both low. Heavy or prolonged periods are the most common cause of iron deficiency in women. This can cause fatigue, dizziness, and feeling cold.'
        : 'Your ferritin is below optimal. Even without full anemia, low ferritin can cause exhaustion, brain fog, and hair loss. Menstrual blood loss is a major contributor.',
      recommendation: isAnemic
        ? 'Talk to your doctor about iron supplementation. Track your period flow — if you soak through pads/tampons hourly or bleed more than 7 days, mention this.'
        : 'Consider iron-rich foods (red meat, spinach, lentils) or a supplement. Take with vitamin C to boost absorption. Avoid coffee/tea with iron-rich meals.',
      severity: isAnemic ? 'urgent' : 'attention',
    });
  }

  // Thyroid + Cycle irregularity
  if (tsh && (tsh.value > 4.5 || tsh.value < 0.4)) {
    const connectedTests = ['TSH'];
    if (progesterone) connectedTests.push('Progesterone');
    if (estradiol) connectedTests.push('Estradiol');

    insights.push({
      title: tsh.value > 4.5
        ? 'Underactive thyroid may be affecting your cycle'
        : 'Overactive thyroid may be affecting your cycle',
      emoji: '🦋',
      connectedTests,
      explanation: tsh.value > 4.5
        ? 'Your thyroid is underactive (high TSH). This slows your metabolism and can make periods heavier, longer, or irregular. It can also cause fatigue, weight gain, and difficulty conceiving.'
        : 'Your thyroid is overactive (low TSH). This speeds up metabolism and can make periods lighter, shorter, or absent. It can also cause anxiety, weight loss, and irregular ovulation.',
      recommendation: tsh.value > 4.5
        ? 'Thyroid medication (levothyroxine) can restore normal cycles. If you\'re trying to conceive, treating hypothyroidism is especially important.'
        : 'Hyperthyroidism treatment can normalize your cycle. If your periods are very light or absent, this may be the reason.',
      severity: 'attention',
    });
  }

  // Vitamin D + Mood + Cycle
  if (vitD && vitD.value < 30) {
    insights.push({
      title: 'Low vitamin D — can affect mood, energy, and fertility',
      emoji: '☀️',
      connectedTests: ['Vitamin D'],
      explanation: 'Your vitamin D is below the optimal range. Vitamin D plays a role in mood regulation, immune function, and reproductive health. Low levels are linked to worse PMS symptoms, irregular cycles, and reduced fertility.',
      recommendation: 'Consider a vitamin D3 supplement (most adults need 1000-4000 IU daily). Get tested again in 3 months. Spending 15 minutes in sunlight daily also helps.',
      severity: 'attention',
    });
  }

  // B12 + Folate + Fertility
  if (lifeStage === 'conception' || lifeStage === 'ivf') {
    if (folate && folate.value < 5) {
      insights.push({
        title: 'Low folate — important if you\'re trying to conceive',
        emoji: '🤰',
        connectedTests: ['Folate', ...(vitB12 ? ['Vitamin B12'] : [])],
        explanation: 'Folate is critical in the first weeks of pregnancy (often before you know you\'re pregnant). Low folate increases the risk of neural tube defects in the baby.',
        recommendation: 'Start a prenatal vitamin with at least 400mcg of folic acid immediately. Eat folate-rich foods: leafy greens, beans, citrus, and fortified cereals.',
        severity: 'urgent',
      });
    }
    if (vitB12 && vitB12.value < 200) {
      insights.push({
        title: 'Low B12 — may affect fertility and pregnancy',
        emoji: '💊',
        connectedTests: ['Vitamin B12'],
        explanation: 'Vitamin B12 is needed for healthy egg development and early pregnancy. Low B12 can cause fatigue, nerve problems, and may reduce fertility.',
        recommendation: 'Discuss B12 supplementation with your doctor. Good sources include meat, fish, eggs, and dairy. Vegans especially need B12 supplements.',
        severity: 'attention',
      });
    }
  }

  // Blood sugar + hormones (PCOS link)
  if (glucose && glucose.value > 100 && testosterone && testosterone.value > 50) {
    insights.push({
      title: 'Elevated glucose + testosterone — possible PCOS pattern',
      emoji: '🔗',
      connectedTests: ['Glucose', 'Testosterone'],
      explanation: 'The combination of high blood sugar and elevated testosterone is often seen in PCOS (Polycystic Ovary Syndrome). Insulin resistance drives up testosterone, which can cause irregular periods, acne, and excess hair growth.',
      recommendation: 'Ask your doctor about a PCOS evaluation. Lifestyle changes (regular exercise, reducing refined carbs) can significantly help. Medications like metformin may also be discussed.',
      severity: 'attention',
    });
  }

  // Cholesterol + Menopause
  if ((lifeStage === 'menopause' || lifeStage === 'post-menopause') && ldl && ldl.value > 130) {
    insights.push({
      title: 'Rising LDL cholesterol — common after menopause',
      emoji: '❤️',
      connectedTests: ['LDL Cholesterol', ...(hdl ? ['HDL Cholesterol'] : []), ...(cholesterol ? ['Total Cholesterol'] : [])],
      explanation: 'Estrogen naturally helps keep cholesterol in check. After menopause, declining estrogen often causes LDL ("bad" cholesterol) to rise. Heart disease risk increases for women post-menopause.',
      recommendation: 'Focus on heart-healthy foods, regular cardio exercise, and limiting saturated fats. Your doctor may discuss statins depending on your overall risk profile.',
      severity: 'attention',
    });
  }

  // Calcium + Vitamin D + Bone health (menopause)
  if ((lifeStage === 'menopause' || lifeStage === 'post-menopause') && vitD && vitD.value < 30 && calcium) {
    insights.push({
      title: 'Low vitamin D with menopause — bone health risk',
      emoji: '🦴',
      connectedTests: ['Vitamin D', 'Calcium'],
      explanation: 'After menopause, declining estrogen accelerates bone loss. Combined with low vitamin D, this increases your risk of osteoporosis and fractures.',
      recommendation: 'Ensure adequate calcium (1200mg/day) and vitamin D (1000-2000 IU/day). Weight-bearing exercise helps maintain bone density. Ask about a DEXA scan if you haven\'t had one.',
      severity: 'attention',
    });
  }

  // CRP + Overall inflammation
  if (crp && crp.value > 3) {
    const connected = ['CRP'];
    if (wbc && wbc.value > 11) connected.push('White Blood Cells');
    insights.push({
      title: 'Elevated inflammation markers',
      emoji: '🔥',
      connectedTests: connected,
      explanation: 'Your C-reactive protein is elevated, indicating inflammation in your body. Chronic inflammation can worsen PMS, affect fertility, and increase risk of various conditions. It can be caused by infection, autoimmune conditions, or lifestyle factors.',
      recommendation: 'Anti-inflammatory foods (omega-3 fatty acids, turmeric, berries) can help. Reduce processed foods, sugar, and alcohol. If persistently elevated, your doctor may investigate the underlying cause.',
      severity: 'attention',
    });
  }

  // Magnesium + PMS
  if (magnesium && magnesium.value < 1.7) {
    insights.push({
      title: 'Low magnesium — may worsen PMS and cramps',
      emoji: '💫',
      connectedTests: ['Magnesium'],
      explanation: 'Low magnesium is linked to worse period cramps, PMS mood swings, headaches, and sleep problems. Many women are deficient without knowing it.',
      recommendation: 'Magnesium-rich foods: dark chocolate, nuts, avocados, leafy greens. A magnesium glycinate supplement before bed can help with both PMS and sleep.',
      severity: 'attention',
    });
  }

  // Pregnancy: Iron + Vitamin D + Folate combo
  if (lifeStage === 'pregnancy') {
    const issues = [];
    if (ferritin && ferritin.value < 30) issues.push(`Ferritin ${ferritin.value} (need ≥30)`);
    if (vitD && vitD.value < 30) issues.push(`Vitamin D ${vitD.value} (need ≥30)`);
    if (folate && folate.value < 5) issues.push(`Folate ${folate.value} (need ≥5)`);
    if (vitB12 && vitB12.value < 200) issues.push(`B12 ${vitB12.value} (need ≥200)`);

    if (issues.length >= 2) {
      insights.push({
        title: `Multiple nutritional gaps during pregnancy`,
        emoji: '⚠️',
        connectedTests: ['Ferritin', 'Vitamin D', 'Folate', 'Vitamin B12'].filter(t =>
          data.some(d => d.title.toLowerCase().includes(t.toLowerCase()))
        ),
        explanation: `You have ${issues.length} nutrients below optimal pregnancy levels: ${issues.join('; ')}. During pregnancy, your body needs significantly more of these nutrients for baby's development and your own health.`,
        recommendation: 'Discuss a comprehensive prenatal supplement plan with your doctor. A good prenatal vitamin plus individual supplements (especially iron and vitamin D) may be needed. Prioritize iron-rich foods and safe sun exposure.',
        severity: 'urgent',
      });
    }
  }

  // Pregnancy: Thyroid + Pregnancy risk
  if (lifeStage === 'pregnancy' && tsh && (tsh.value > 2.5 || tsh.value < 0.1)) {
    const connected = ['TSH'];
    if (progesterone) connected.push('Progesterone');
    insights.push({
      title: tsh.value > 2.5 ? 'Thyroid needs monitoring during pregnancy' : 'Thyroid overactive — monitor in pregnancy',
      emoji: '🦋',
      connectedTests: connected,
      explanation: tsh.value > 2.5
        ? `Your TSH (${tsh.value}) is above the pregnancy-safe range of 0.1-2.5 for the first trimester. Untreated hypothyroidism in pregnancy increases risk of miscarriage, preeclampsia, and developmental issues.`
        : `Your TSH (${tsh.value}) is very low, suggesting overactive thyroid. This needs close monitoring during pregnancy as it can affect baby's growth.`,
      recommendation: 'Your doctor should monitor TSH every 4-6 weeks during pregnancy. Medication dosage may need adjustment as pregnancy progresses.',
      severity: 'urgent',
    });
  }

  // Pregnancy: Platelets + Liver enzymes (HELLP risk)
  if (lifeStage === 'pregnancy') {
    const alt = findTest(data, ['ALT']);
    const ast = findTest(data, ['AST']);
    const lowPlatelets = platelets && platelets.value < 150;
    const highLiver = (alt && alt.value > 35) || (ast && ast.value > 35);

    if (lowPlatelets && highLiver) {
      insights.push({
        title: 'Low platelets + elevated liver enzymes — needs immediate attention',
        emoji: '🚨',
        connectedTests: ['Platelets', ...(alt ? ['ALT'] : []), ...(ast ? ['AST'] : [])],
        explanation: 'The combination of low platelets and elevated liver enzymes during pregnancy can indicate HELLP syndrome, a serious pregnancy complication. This needs immediate medical evaluation.',
        recommendation: 'Contact your doctor today. Do NOT wait for your next scheduled appointment. Watch for symptoms: severe headache, vision changes, upper right abdominal pain, nausea.',
        severity: 'urgent',
      });
    }
  }

  // Vitamin D + Calcium absorption
  if (vitD && vitD.value < 20 && calcium && calcium.value < 8.5) {
    insights.push({
      title: 'Low vitamin D is impairing calcium absorption',
      emoji: '🦴',
      connectedTests: ['Vitamin D', 'Calcium'],
      explanation: 'Your vitamin D is very low, and your calcium is also below normal. Vitamin D is essential for absorbing calcium from food. Without enough D, your body can\'t use the calcium you consume, weakening bones.',
      recommendation: 'Start vitamin D supplementation (2000-4000 IU daily) — this should help your calcium levels improve too. Get calcium from dairy, fortified foods, or supplements.',
      severity: 'attention',
    });
  }

  // Iron + B12 + Folate — triple deficiency = fatigue combo
  if (ferritin && ferritin.value < 30 && vitB12 && vitB12.value < 300 && folate && folate.value < 10) {
    insights.push({
      title: 'Triple nutrient gap — likely causing significant fatigue',
      emoji: '😴',
      connectedTests: ['Ferritin', 'Vitamin B12', 'Folate'],
      explanation: 'Iron, B12, and folate all contribute to making healthy red blood cells. When all three are low, fatigue can be severe. You may also experience brain fog, hair loss, and poor concentration.',
      recommendation: 'Address all three: iron supplement (with vitamin C for absorption), B12 supplement or injections, and folate/folic acid. Your energy should improve within 4-8 weeks of supplementation.',
      severity: 'attention',
    });
  }

  // Inflammation + Thyroid connection
  if (crp && crp.value > 3 && tsh && tsh.value > 4) {
    insights.push({
      title: 'Inflammation may be linked to your thyroid',
      emoji: '🔗',
      connectedTests: ['CRP', 'TSH'],
      explanation: 'You have both elevated inflammation (CRP) and an underactive thyroid (TSH). Autoimmune thyroiditis (Hashimoto\'s) is the most common cause of hypothyroidism and causes chronic inflammation. The two conditions feed each other.',
      recommendation: 'Ask your doctor to check thyroid antibodies (anti-TPO) if not already tested. Treating the thyroid often helps reduce inflammation too.',
      severity: 'attention',
    });
  }

  // Cholesterol ratio insight
  if (ldl && hdl) {
    const ratio = ldl.value / hdl.value;
    if (ratio > 3.5) {
      insights.push({
        title: 'Your cholesterol ratio needs attention',
        emoji: '❤️',
        connectedTests: ['LDL Cholesterol', 'HDL Cholesterol'],
        explanation: `Your LDL/HDL ratio is ${ratio.toFixed(1)} (ideal is below 3.0). This means your "bad" cholesterol is high relative to your "good" cholesterol, increasing cardiovascular risk.`,
        recommendation: 'Increase HDL: regular exercise (especially cardio), omega-3 fatty acids (fish, walnuts), olive oil. Reduce LDL: less saturated fat, more fiber, consider oat bran or psyllium.',
        severity: 'attention',
      });
    }
  }

  // HbA1c + Glucose together
  if (hba1c && hba1c.value > 5.7 && glucose && glucose.value > 100) {
    insights.push({
      title: 'Both blood sugar markers are elevated',
      emoji: '🍬',
      connectedTests: ['HbA1c', 'Glucose'],
      explanation: `Your HbA1c (${hba1c.value}%) and fasting glucose (${glucose.value}) are both above normal. HbA1c above 5.7% suggests prediabetes. Together, these strongly indicate insulin resistance.${lifeStage === 'pregnancy' ? ' During pregnancy, this increases risk of gestational diabetes.' : ''}`,
      recommendation: lifeStage === 'pregnancy'
        ? 'You may need a glucose tolerance test (GTT). Gestational diabetes is manageable with diet, exercise, and sometimes medication.'
        : 'Lifestyle changes can reverse prediabetes: reduce refined carbs and sugar, exercise 30 min/day, maintain healthy weight. Ask about metformin if lifestyle changes aren\'t enough.',
      severity: 'attention',
    });
  }

  // Positive: everything looks good
  const allNormal = data.filter(d => d.data_type === 'lab_result').every(d => d.status === 'normal' || d.status === 'expected');
  if (allNormal && data.filter(d => d.data_type === 'lab_result').length >= 3 && insights.length === 0) {
    insights.push({
      title: 'Your results look well-balanced',
      emoji: '🌟',
      connectedTests: [],
      explanation: 'All your test results are within healthy ranges and we didn\'t find any concerning patterns across your results. Your body appears to be functioning well.',
      recommendation: 'Keep doing what you\'re doing! Regular checkups and maintaining healthy habits will help you stay on track.',
      severity: 'positive',
    });
  }

  return insights;
}

const severityStyles = {
  positive: { bg: 'bg-green-50 dark:bg-green-900/15', border: 'border-green-200 dark:border-green-800', badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  neutral: { bg: 'bg-blue-50 dark:bg-blue-900/15', border: 'border-blue-200 dark:border-blue-800', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  attention: { bg: 'bg-amber-50 dark:bg-amber-900/15', border: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  urgent: { bg: 'bg-red-50 dark:bg-red-900/15', border: 'border-red-200 dark:border-red-800', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export default function PersonalizedInsights({ medicalData, lifeStage }: PersonalizedInsightsProps) {
  const insights = useMemo(() => generateCrossInsights(medicalData, lifeStage), [medicalData, lifeStage]);

  if (insights.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        Personalized Health Insights
      </h3>
      <p className="text-xs text-muted-foreground -mt-2">
        We cross-referenced your test results to find patterns that matter for your health.
      </p>

      <div className="space-y-3">
        {insights.map((insight, idx) => {
          const styles = severityStyles[insight.severity];
          return (
            <Card key={idx} className={`overflow-hidden border ${styles.border}`}>
              <CardContent className={`p-4 ${styles.bg}`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">{insight.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold mb-1.5">{insight.title}</h4>

                    {insight.connectedTests.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                        <Link2 className="h-3 w-3 text-muted-foreground" />
                        {insight.connectedTests.map((test, i) => (
                          <Badge key={i} variant="outline" className={`text-[10px] px-1.5 py-0 ${styles.badge} border-0`}>
                            {test}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <p className="text-sm text-foreground/80 leading-relaxed mb-3">
                      {insight.explanation}
                    </p>

                    <div className="bg-white/60 dark:bg-white/5 rounded-lg px-3 py-2.5 border border-border/30">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">What you can do</p>
                      <p className="text-xs text-foreground/70 leading-relaxed">{insight.recommendation}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground italic px-1">
        These insights combine multiple results to spot patterns. They are educational, not diagnostic — always consult your healthcare provider for personalized medical advice.
      </p>
    </div>
  );
}
