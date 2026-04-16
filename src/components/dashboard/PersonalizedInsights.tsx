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

  // ═══ PCOS PATTERN (expanded) ═══
  const lh = findTest(data, ['LH', 'Luteinizing Hormone']);
  const fsh = findTest(data, ['FSH', 'Follicle Stimulating Hormone', 'Follicle-Stimulating Hormone']);
  const amh = findTest(data, ['AMH', 'Anti-Mullerian Hormone', 'Anti-Müllerian Hormone']);
  const dheas = findTest(data, ['DHEA-S', 'DHEAS', 'Dehydroepiandrosterone Sulfate']);
  const shbg = findTest(data, ['SHBG', 'Sex Hormone Binding Globulin']);
  const insulin = findTest(data, ['Insulin', 'Fasting Insulin']);
  const androstenedione = findTest(data, ['Androstenedione']);

  if (lh && fsh && fsh.value > 0 && lh.value / fsh.value > 2) {
    const connected = ['LH', 'FSH'];
    if (testosterone) connected.push('Testosterone');
    if (amh) connected.push('AMH');
    const hasHighT = testosterone && testosterone.value > 86;
    const hasHighAMH = amh && amh.value > 3.5;
    insights.push({
      title: 'LH/FSH ratio suggests possible PCOS pattern',
      emoji: '🔬',
      connectedTests: connected,
      explanation: `Your LH/FSH ratio is ${(lh.value / fsh.value).toFixed(1)} (normal is ~1:1, PCOS-suggestive is >2:1).${hasHighT ? ' Combined with elevated testosterone, this strengthens a PCOS pattern.' : ''}${hasHighAMH ? ` Your AMH of ${amh.value} ng/mL is also elevated, which is common in PCOS.` : ''} PCOS affects 1 in 10 women and can cause irregular periods, acne, excess hair growth, and fertility challenges.`,
      recommendation: 'Ask your doctor about a full PCOS evaluation (2023 International Guideline uses hyperandrogenism + ovulatory dysfunction + ovarian morphology/AMH). Lifestyle changes — regular exercise and reducing refined carbs — can significantly help manage symptoms.',
      severity: 'attention',
    });
  }

  // Insulin resistance pattern
  if (insulin && glucose && insulin.value > 0 && glucose.value > 0) {
    const homaIR = (insulin.value * glucose.value) / 405;
    if (homaIR >= 2.0) {
      insights.push({
        title: `Insulin resistance detected (HOMA-IR ${homaIR.toFixed(1)})`,
        emoji: '📊',
        connectedTests: ['Fasting Insulin', 'Glucose'],
        explanation: `Your HOMA-IR is ${homaIR.toFixed(1)} (normal <2.0, PCOS-specific cutoff >=2.0). This means your body needs more insulin than normal to control blood sugar. Insulin resistance is the root driver of metabolic PCOS and increases risk of type 2 diabetes.`,
        recommendation: 'Focus on reducing refined carbohydrates, regular exercise (both cardio and strength training), and maintaining a healthy weight. Your doctor may discuss metformin or inositol supplements.',
        severity: 'attention',
      });
    }
  }

  // Low SHBG amplifying androgens
  if (shbg && shbg.value < 18) {
    insights.push({
      title: 'Low SHBG — may amplify androgen effects',
      emoji: '🧬',
      connectedTests: ['SHBG', ...(testosterone ? ['Testosterone'] : [])],
      explanation: `Your SHBG (Sex Hormone Binding Globulin) is ${shbg.value} nmol/L, which is below normal (<18). Low SHBG means more free testosterone is active in your body, even if total testosterone appears normal. This can cause acne, hirsutism, and hair loss.`,
      recommendation: 'Low SHBG is often linked to insulin resistance. Addressing insulin resistance (exercise, dietary changes) can help raise SHBG naturally. Your doctor may calculate your Free Androgen Index for a clearer picture.',
      severity: 'attention',
    });
  }

  // ═══ ENDOMETRIOSIS MARKERS ═══
  const ca125 = findTest(data, ['CA-125', 'CA125', 'Cancer Antigen 125']);
  const nlr = findTest(data, ['NLR', 'Neutrophil-to-Lymphocyte Ratio']);
  if (ca125 && ca125.value > 35) {
    const connected = ['CA-125'];
    if (crp) connected.push('CRP');
    if (nlr) connected.push('NLR');
    insights.push({
      title: 'Elevated CA-125 — may indicate endometriosis',
      emoji: '🔍',
      connectedTests: connected,
      explanation: `Your CA-125 is ${ca125.value} U/mL (normal <35). Elevated CA-125 is found in endometriosis (median ~68 in endo patients vs ~12 in controls), especially stages III-IV. However, CA-125 can also be elevated by menstruation, ovarian cysts, or PID.${crp && crp.value > 3 ? ' Your elevated CRP supports an inflammatory process.' : ''}`,
      recommendation: 'If you experience painful periods, chronic pelvic pain, or pain during intercourse, discuss endometriosis evaluation with your doctor. CA-125 supports clinical suspicion but is not diagnostic on its own.',
      severity: 'attention',
    });
  }

  // ═══ FERTILITY / OVARIAN RESERVE ═══
  if (amh && amh.value < 1.1 && lifeStage !== 'menopause') {
    const connected = ['AMH'];
    if (fsh) connected.push('FSH');
    insights.push({
      title: 'Low AMH — your ovarian reserve may be declining',
      emoji: '🥚',
      connectedTests: connected,
      explanation: `Your AMH is ${amh.value} ng/mL, which is below the low threshold of 1.1 ng/mL.${fsh && fsh.value > 10 ? ` Combined with your elevated FSH (${fsh.value}), this suggests diminished ovarian reserve.` : ''} AMH reflects the number of remaining eggs and declines before FSH rises, making it an early indicator.`,
      recommendation: lifeStage === 'conception' || lifeStage === 'ivf'
        ? 'Discuss your fertility timeline with a reproductive endocrinologist. Low AMH doesn\'t mean you can\'t conceive, but earlier intervention may be beneficial. IVF protocols can be adjusted for lower reserve.'
        : 'If you\'re considering having children in the future, this is worth discussing with your doctor sooner rather than later. Egg freezing may be an option to preserve fertility.',
      severity: lifeStage === 'conception' || lifeStage === 'ivf' ? 'urgent' : 'attention',
    });
  }

  // Day 3 FSH elevated (fertility concern)
  if (fsh && fsh.value > 10 && lifeStage !== 'menopause' && lifeStage !== 'perimenopause') {
    if (!amh || amh.value >= 1.1) { // Don't duplicate if already covered by AMH insight
      insights.push({
        title: fsh.value > 15 ? 'Elevated FSH — may indicate reduced ovarian reserve' : 'FSH is borderline — worth monitoring',
        emoji: '📈',
        connectedTests: ['FSH', ...(estradiol ? ['Estradiol'] : [])],
        explanation: `Your FSH is ${fsh.value} IU/L.${fsh.value > 15 ? ' Values above 15 suggest poor ovarian reserve prognosis.' : ' Values of 10-15 are in the concerning range.'}${estradiol && estradiol.value > 80 ? ` Note: your estradiol is ${estradiol.value} pg/mL which may be masking an even higher FSH — these must be interpreted together.` : ''}`,
        recommendation: 'If you\'re planning pregnancy, discuss these results with a fertility specialist. AMH and antral follicle count provide a more complete picture of ovarian reserve.',
        severity: fsh.value > 15 ? 'attention' : 'neutral',
      });
    }
  }

  // ═══ PERIMENOPAUSE / MENOPAUSE TRANSITION ═══
  if (fsh && fsh.value > 25 && estradiol && estradiol.value < 50 && lifeStage !== 'menopause') {
    insights.push({
      title: 'Your hormone levels suggest perimenopause or menopause transition',
      emoji: '🌙',
      connectedTests: ['FSH', 'Estradiol'],
      explanation: `Your FSH (${fsh.value} IU/L) is elevated and estradiol (${estradiol.value} pg/mL) is declining. This pattern indicates your ovaries are producing less estrogen.${fsh.value > 30 && estradiol.value < 30 ? ' If you\'ve also had 12+ months without a period, this confirms menopause.' : ' With erratic cycles, this is consistent with perimenopause.'}`,
      recommendation: 'Discuss symptom management options with your doctor. Consider bone density screening, cardiovascular risk assessment, and whether hormone therapy might be appropriate for you.',
      severity: 'attention',
    });
  }

  // ═══ BONE HEALTH (menopause + general) ═══
  const pth = findTest(data, ['PTH', 'Parathyroid Hormone', 'Intact PTH']);
  const ctx = findTest(data, ['CTX', 'C-Telopeptide', 'Beta-CrossLaps']);
  const p1np = findTest(data, ['P1NP', 'Procollagen Type I']);

  if (vitD && vitD.value < 20 && pth && pth.value > 65) {
    insights.push({
      title: 'Low vitamin D is driving elevated PTH — bone loss risk',
      emoji: '🦴',
      connectedTests: ['Vitamin D', 'PTH', ...(calcium ? ['Calcium'] : [])],
      explanation: `Your vitamin D is very low (${vitD.value} ng/mL) and your PTH is elevated (${pth.value} pg/mL). When vitamin D drops below ~31, PTH rises to maintain calcium levels — but it does this by pulling calcium from your bones (secondary hyperparathyroidism).`,
      recommendation: 'Start vitamin D supplementation (2000-4000 IU daily) to bring your levels above 30 ng/mL. This should bring PTH back down and stop the calcium drain from your bones. Recheck in 3 months.',
      severity: 'attention',
    });
  }

  if (ctx && p1np) {
    if (ctx.value > 0.5 && p1np.value < 30) {
      insights.push({
        title: 'Bone resorption exceeds formation — net bone loss',
        emoji: '🦴',
        connectedTests: ['CTX', 'P1NP'],
        explanation: `Your CTX (bone breakdown marker) is ${ctx.value} ng/mL while P1NP (bone building marker) is only ${p1np.value} μg/L. This uncoupled remodeling means you're losing bone faster than you're rebuilding it.`,
        recommendation: 'Discuss osteoporosis prevention with your doctor. This may include calcium + vitamin D supplementation, weight-bearing exercise, and possibly medication. A DEXA scan can assess your current bone density.',
        severity: 'urgent',
      });
    }
  }

  // ═══ AUTOIMMUNE PATTERNS ═══
  const ana = findTest(data, ['ANA', 'Antinuclear Antibody']);
  const antiTPO = findTest(data, ['Anti-TPO', 'Thyroid Peroxidase Antibody', 'TPO Antibody']);
  const antiTG = findTest(data, ['Anti-Thyroglobulin', 'Thyroglobulin Antibody', 'TgAb']);
  const rf = findTest(data, ['RF', 'Rheumatoid Factor']);
  const antiCCP = findTest(data, ['Anti-CCP', 'Cyclic Citrullinated Peptide']);

  if (antiTPO && antiTPO.value > 35) {
    const connected = ['Anti-TPO'];
    if (tsh) connected.push('TSH');
    insights.push({
      title: 'Positive thyroid antibodies — Hashimoto\'s thyroiditis',
      emoji: '🦋',
      connectedTests: connected,
      explanation: `Your anti-TPO is ${antiTPO.value} IU/mL (positive >35). This indicates your immune system is attacking your thyroid gland (Hashimoto's). Hashimoto's is 4-10x more common in women.${tsh && tsh.value > 4 ? ` Your elevated TSH (${tsh.value}) confirms the thyroid is already underperforming.` : ' Your thyroid function may still be normal now, but monitoring is important.'}`,
      recommendation: tsh && tsh.value > 4
        ? 'Thyroid medication (levothyroxine) is likely needed. Monitor TSH every 6-8 weeks until stable. If trying to conceive, keep TSH below 2.5.'
        : 'Monitor TSH every 6-12 months. Many people with positive antibodies eventually develop hypothyroidism. If you notice fatigue, weight gain, or irregular periods, recheck sooner.',
      severity: tsh && tsh.value > 4 ? 'attention' : 'neutral',
    });
  }

  if (rf && rf.value > 14 && antiCCP && antiCCP.value > 5) {
    insights.push({
      title: 'Both RA markers positive — high specificity for rheumatoid arthritis',
      emoji: '🤲',
      connectedTests: ['Rheumatoid Factor', 'Anti-CCP'],
      explanation: `Both your RF (${rf.value}) and anti-CCP (${antiCCP.value}) are elevated. Anti-CCP is highly specific for rheumatoid arthritis. When both are positive, the specificity is very high. RA is 2-3x more common in women.`,
      recommendation: 'See a rheumatologist for evaluation. Early treatment with disease-modifying therapy (DMARDs) can prevent joint damage. Don\'t wait for symptoms to worsen.',
      severity: 'attention',
    });
  }

  // ═══ APS (ANTIPHOSPHOLIPID SYNDROME) ═══
  const acl = findTest(data, ['Anticardiolipin', 'aCL', 'Cardiolipin Antibody']);
  const ab2gp = findTest(data, ['Anti-Beta-2 Glycoprotein', 'Anti-B2GP1', 'Beta-2 Glycoprotein']);
  const lupusAnticoag = data.find(d => d.title.toLowerCase().includes('lupus anticoagulant') && d.value?.toLowerCase() === 'positive');

  if ((acl && acl.value > 40) || (ab2gp && ab2gp.value >= 20) || lupusAnticoag) {
    const connected: string[] = [];
    if (acl) connected.push('Anticardiolipin');
    if (ab2gp) connected.push('Anti-Beta-2 Glycoprotein');
    if (lupusAnticoag) connected.push('Lupus Anticoagulant');
    const isPregnant = lifeStage === 'pregnancy';
    insights.push({
      title: isPregnant ? 'Positive APS antibodies during pregnancy — needs monitoring' : 'Antiphospholipid antibodies detected',
      emoji: isPregnant ? '🚨' : '⚠️',
      connectedTests: connected,
      explanation: `Antiphospholipid antibodies are associated with increased risk of blood clots${isPregnant ? ', miscarriage, and pregnancy complications' : ' and pregnancy complications'}. ${connected.length >= 3 ? 'Triple-positive APS (all three markers) carries the highest risk.' : 'These need to be confirmed with a repeat test 12 weeks later (2023 ACR/EULAR criteria).'}`,
      recommendation: isPregnant
        ? 'Contact your doctor immediately. Treatment with low-dose aspirin and heparin during pregnancy significantly reduces complications.'
        : 'Get confirmatory testing in 12 weeks. If confirmed, your doctor may recommend blood thinners, especially during pregnancy or surgery.',
      severity: isPregnant ? 'urgent' : 'attention',
    });
  }

  // ═══ CARDIOVASCULAR (WOMEN-SPECIFIC) ═══
  const lpa = findTest(data, ['Lp(a)', 'Lipoprotein(a)', 'Lipoprotein a']);
  const apoB = findTest(data, ['ApoB', 'Apolipoprotein B']);
  const homocysteine = findTest(data, ['Homocysteine']);

  if (lpa && lpa.value >= 125) {
    insights.push({
      title: 'High Lp(a) — an inherited cardiovascular risk factor',
      emoji: '❤️',
      connectedTests: ['Lp(a)', ...(crp && crp.value >= 2 ? ['hs-CRP'] : [])],
      explanation: `Your Lp(a) is ${lpa.value} nmol/L (high risk >=125). Lp(a) is largely genetic and doesn't respond well to diet or exercise. It's 17% higher in postmenopausal women.${crp && crp.value >= 2 ? ' Combined with your elevated hs-CRP, this compounds your cardiovascular risk.' : ''}`,
      recommendation: 'Discuss with your doctor. While Lp(a) itself is hard to lower, aggressively managing other risk factors (LDL, blood pressure, smoking) becomes even more important. New targeted therapies are in development.',
      severity: 'attention',
    });
  }

  if (apoB && apoB.value > 100) {
    if (!ldl || !hdl || ldl.value / hdl.value <= 3.5) { // Don't duplicate if cholesterol ratio already flagged
      insights.push({
        title: 'Elevated ApoB — a more precise cardiovascular marker',
        emoji: '❤️',
        connectedTests: ['ApoB', ...(ldl ? ['LDL Cholesterol'] : [])],
        explanation: `Your ApoB is ${apoB.value} mg/dL (optimal <80, elevated >100). Per 2026 ACC/AHA guidelines, ApoB is a better predictor of cardiovascular risk than LDL alone, especially when LDL appears normal.`,
        recommendation: 'Discuss statin or other lipid-lowering therapy with your doctor. Lifestyle measures (Mediterranean diet, exercise, weight management) also help lower ApoB.',
        severity: 'attention',
      });
    }
  }

  if (homocysteine && homocysteine.value > 15) {
    insights.push({
      title: 'Elevated homocysteine — cardiovascular and neural tube risk',
      emoji: '🧪',
      connectedTests: ['Homocysteine', ...(vitB12 ? ['Vitamin B12'] : []), ...(folate ? ['Folate'] : [])],
      explanation: `Your homocysteine is ${homocysteine.value} μmol/L (normal <10, elevated >15). High homocysteine increases risk of blood clots, heart disease, and stroke.${vitB12 && vitB12.value < 300 ? ' Your low B12 is likely contributing.' : ''}${folate && folate.value < 10 ? ' Low folate is also a factor.' : ''}${lifeStage === 'conception' || lifeStage === 'pregnancy' ? ' In pregnancy, elevated homocysteine also increases neural tube defect risk.' : ''}`,
      recommendation: 'B12 and folate supplementation usually lowers homocysteine effectively. Recheck in 3 months after starting supplements.',
      severity: lifeStage === 'pregnancy' || lifeStage === 'conception' ? 'urgent' : 'attention',
    });
  }

  // ═══ PROLACTIN + HAIR/FERTILITY ═══
  const prolactin = findTest(data, ['Prolactin']);
  if (prolactin && prolactin.value > 29) {
    insights.push({
      title: 'Elevated prolactin — may affect periods and hair',
      emoji: '💇',
      connectedTests: ['Prolactin'],
      explanation: `Your prolactin is ${prolactin.value} ng/mL (normal 2-29). High prolactin can suppress ovulation, cause irregular or absent periods, and increase DHEA-S production leading to hair loss or hirsutism. Common causes include stress, medications, and rarely, a pituitary adenoma.`,
      recommendation: 'Discuss with your doctor. If significantly elevated, they may order a pituitary MRI. Medications (cabergoline or bromocriptine) are very effective at normalizing prolactin.',
      severity: prolactin.value > 100 ? 'urgent' : 'attention',
    });
  }

  // ═══ LIVER ENZYMES + CONTRACEPTION ═══
  const alt = findTest(data, ['ALT', 'Alanine Aminotransferase', 'SGPT']);
  const ast = findTest(data, ['AST', 'Aspartate Aminotransferase', 'SGOT']);
  if ((alt && alt.value > 70) || (ast && ast.value > 70)) {
    const hasContraceptionContext = data.some(d => d.data_type === 'medication' && d.title.toLowerCase().includes('contracepti'));
    if (hasContraceptionContext) {
      insights.push({
        title: 'Significantly elevated liver enzymes while on contraception',
        emoji: '⚠️',
        connectedTests: [...(alt ? ['ALT'] : []), ...(ast ? ['AST'] : [])],
        explanation: `Your liver enzymes are elevated beyond 2x the upper limit of normal. Combined oral contraceptives can affect liver function. This needs evaluation.`,
        recommendation: 'Contact your prescribing doctor. They may need to switch you to a progestin-only or non-hormonal method. Do not stop contraception abruptly without medical guidance.',
        severity: 'urgent',
      });
    }
  }

  // ═══ BILE ACIDS IN PREGNANCY (CHOLESTASIS) ═══
  const bileAcids = findTest(data, ['Bile Acids', 'Total Bile Acids', 'Serum Bile Acids']);
  if (bileAcids && bileAcids.value >= 10 && lifeStage === 'pregnancy') {
    insights.push({
      title: bileAcids.value >= 40 ? 'Severe cholestasis of pregnancy — needs immediate attention' : 'Elevated bile acids — possible intrahepatic cholestasis',
      emoji: bileAcids.value >= 40 ? '🚨' : '⚠️',
      connectedTests: ['Bile Acids', ...(alt ? ['ALT'] : []), ...(ast ? ['AST'] : [])],
      explanation: `Your bile acids are ${bileAcids.value} μmol/L. Values >=10 are diagnostic for intrahepatic cholestasis of pregnancy (ICP).${bileAcids.value >= 40 ? ' Values >=40 carry increased risk of adverse outcomes.' : ''}${bileAcids.value >= 100 ? ' Values >=100 are severe — delivery is typically recommended at 36 weeks.' : ''} ICP causes intense itching and can affect the baby.`,
      recommendation: bileAcids.value >= 40
        ? 'Contact your doctor TODAY. You may need ursodeoxycholic acid (UDCA) treatment and increased fetal monitoring. Delivery timing will be discussed.'
        : 'Discuss with your doctor at your next appointment. UDCA medication can help. Bile acids should be monitored weekly from 32 weeks.',
      severity: bileAcids.value >= 40 ? 'urgent' : 'attention',
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

  // ═══ THALASSEMIA SCREENING ═══
  const mcv = findTest(data, ['MCV', 'Mean Corpuscular Volume']);
  const mch = findTest(data, ['MCH', 'Mean Corpuscular Hemoglobin']);
  const hba2 = findTest(data, ['HbA2', 'Hemoglobin A2']);
  if (mcv && mcv.value < 80 && mch && mch.value < 27) {
    if (ferritin && ferritin.value >= 30) {
      insights.push({
        title: 'Small red blood cells with normal iron — possible thalassemia trait',
        emoji: '🩸',
        connectedTests: ['MCV', 'MCH', 'Ferritin', ...(hba2 ? ['HbA2'] : [])],
        explanation: `Your MCV (${mcv.value} fL) and MCH (${mch.value} pg) are low, but your iron stores are normal. This pattern is characteristic of thalassemia trait rather than iron deficiency.${hba2 && hba2.value > 3.5 ? ` Your HbA2 of ${hba2.value}% confirms beta-thalassemia trait.` : ' An HbA2 test can confirm this.'} Thalassemia trait is common and usually harmless, but important for family planning.`,
        recommendation: 'If you\'re planning a pregnancy, your partner should also be tested for thalassemia. If both partners carry the trait, there\'s a 25% chance each pregnancy could result in thalassemia major.',
        severity: 'neutral',
      });
    }
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
