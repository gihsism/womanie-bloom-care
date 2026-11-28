// What a result above or below the lab's range CAN mean, per test: the
// fallback note on a result card in Records when the analysis gave none.
// One map for every screen (it used to live twice, in MedicalHistory.tsx
// and medical-utils.ts, with different wording).
//
// Wording rules (checked 2026-11-28 against MedlinePlus lab-test pages,
// Lab Tests Online / testing.com and NHS / NICE CKS patient information):
// - "can mean" / "can come from", never a diagnosis ("indicates", "confirms").
// - No doses, no supplements or medicines to take, no app-set thresholds:
//   whether a value is high or low is the lab's call (its printed range and
//   status, the shared rule in api/_lib/lab-flags.ts), not ours.
// - No verdicts ("this is good", "healthy", "treatable") and no reassurance
//   the sources don't give.
// - The doctor interprets: every outside-the-range note ends by sending her
//   to her doctor (the card adds that sentence, not each entry).
//
// Corrections made from the sources:
// - Blood calcium does not show bone density (MedlinePlus: "A calcium blood
//   test does not tell you how much calcium is in your bones").
// - Magnesium: no PMS / sleep / glycinate claims; causes per MedlinePlus.
// - HbA1c: no 5.7 / 6.5 % cut-offs (ADA and NICE differ; the lab's range
//   rules); a low value can be a red-cell artefact (anaemia, blood loss).
// - hCG: a single level does not date a pregnancy; the change over time
//   is what is followed (testing.com).
// - AMH: says nothing about whether she can get pregnant (MedlinePlus); no
//   "good for fertility".
// - Estradiol: no endometriosis claim; it moves through the cycle.
// - CRP: no PMS / fertility claims. Prolactin: no "it's treatable".
// - Vitamin D: no IU numbers. Cholesterol: no statins. No iron, B12,
//   calcium, magnesium or folic acid supplement advice.

import type { MedicalDataItem } from './medical-utils';
import { labNumber, parseLabRange } from './labValue';
import { labFlag } from './labFlags';

export interface TestExplanation {
  high: string;
  low: string;
}

export const testExplanations: Record<string, TestExplanation> = {
  'hemoglobin': {
    low: 'A low hemoglobin means the blood carries less oxygen (anaemia). It can cause tiredness, dizziness or shortness of breath. Common causes include low iron, heavy periods and low vitamin B12 or folate.',
    high: 'A high hemoglobin can come from dehydration, smoking or living at high altitude, and less often from a lung or blood condition.',
  },
  'ferritin': {
    low: 'A low ferritin can mean the body\'s iron stores are low. This is common in women with heavy periods, and can cause tiredness.',
    high: 'A high ferritin can come from inflammation or infection, liver conditions, or the body storing too much iron.',
  },
  'tsh': {
    low: 'A low TSH can mean the thyroid is working too fast (overactive). That can cause weight loss, anxiety, a fast heartbeat and lighter periods. Doctors usually look at other thyroid results (T4, T3) before saying more.',
    high: 'A raised TSH can mean the thyroid is working slowly (underactive). That can cause tiredness, weight gain, feeling cold and heavier or irregular periods. Doctors usually re-test and check T4 before saying more.',
  },
  'vitamin d': {
    low: 'A low vitamin D is common, especially in winter. Over time it can affect bone health. Your doctor can tell you whether you need a supplement and how much.',
    high: 'A high vitamin D is rare and usually comes from taking a lot of supplements.',
  },
  'hba1c': {
    low: 'A low HbA1c can happen when red blood cells live shorter than usual (for example after blood loss or with some anaemias), which makes the test read lower.',
    high: 'A high HbA1c means the average blood sugar over the past 2 to 3 months has been higher. It can be a sign of diabetes or a raised risk of it. Anaemia, kidney or liver problems and pregnancy can affect the result.',
  },
  'glucose': {
    low: 'A low blood sugar can cause shakiness, sweating, dizziness or confusion.',
    high: 'A high blood sugar can be a sign of diabetes or a raised risk of it, and can also come from stress, illness, some medicines or not fasting before the test. One reading is not a diagnosis; doctors often repeat it or check HbA1c.',
  },
  'iron': {
    low: 'A low iron level can come from low iron stores (for example with heavy periods) and can go with anaemia, tiredness and weakness. It also changes during the day and after meals.',
    high: 'A high iron level can come from the body storing too much iron, liver conditions, or recent iron supplements. Doctors usually look at ferritin and transferrin too.',
  },
  'platelets': {
    low: 'A low platelet count can mean the blood does not clot as easily, which can cause easy bruising or longer bleeding. Causes range from viral infections to some medicines and immune conditions.',
    high: 'A high platelet count can come from inflammation, infection or low iron. Doctors usually re-check a result that stays high.',
  },
  'white blood cells': {
    low: 'A low white cell count can come from viral infections, some medicines or immune conditions.',
    high: 'A high white cell count can mean the body is fighting an infection or inflammation. Stress, smoking, pregnancy and some medicines can also raise it.',
  },
  'creatinine': {
    low: 'A low creatinine is usually not a concern; it can go with lower muscle mass or pregnancy.',
    high: 'A high creatinine can mean the kidneys are filtering less well. Dehydration, a lot of meat or exercise, and some medicines can also raise it. Doctors usually look at the eGFR (kidney filtration) too.',
  },
  'alt': {
    low: 'A low ALT is usually not a concern.',
    high: 'A high ALT can mean the liver is irritated or inflamed. Common causes include fatty liver, alcohol, some medicines and viral hepatitis.',
  },
  'ast': {
    low: 'A low AST is usually not a concern.',
    high: 'A high AST can come from the liver or from muscles (for example after hard exercise). It is usually read together with ALT.',
  },
  'total cholesterol': {
    low: 'A low total cholesterol is uncommon and usually not a concern on its own.',
    high: 'A high total cholesterol can raise the risk of heart disease over time. Doctors look at it together with LDL, HDL, blood pressure, smoking and family history.',
  },
  'cholesterol': {
    low: 'A low cholesterol is uncommon and usually not a concern on its own.',
    high: 'A high cholesterol can raise the risk of heart disease over time. Doctors look at it together with LDL, HDL, blood pressure, smoking and family history.',
  },
  'ldl': {
    low: 'A low LDL is usually not a concern.',
    high: 'A high LDL ("bad" cholesterol) can raise the risk of heart disease over time. Doctors look at it together with your other risk factors.',
  },
  'hdl': {
    low: 'A low HDL ("good" cholesterol) can go with a higher risk of heart disease. Doctors look at it together with your other risk factors.',
    high: 'A high HDL is usually not a concern.',
  },
  'estradiol': {
    low: 'Estradiol changes a lot through the cycle. A low level can be normal at some points of the cycle and around menopause; at other times it can affect periods and bone health.',
    high: 'Estradiol changes a lot through the cycle. A high level can be normal around ovulation, in pregnancy or during fertility treatment; less often it comes from an ovary or other hormone condition. Doctors often repeat it to see the trend.',
  },
  'progesterone': {
    low: 'Progesterone is normally low in the first half of the cycle. Outside that, a low level can mean ovulation did not happen that cycle. In pregnancy it can need follow-up.',
    high: 'Progesterone rises after ovulation and in pregnancy, so a higher level is expected then. Outside those times, a high level can come from an ovary or adrenal gland condition.',
  },
  'fsh': {
    low: 'A low FSH can come from hormonal birth control, pregnancy, or a pituitary or hypothalamus condition, and can affect ovulation.',
    high: 'A high FSH can mean the ovaries have fewer eggs left. Around menopause a high FSH is expected. FSH changes through the cycle, so it is read with the cycle day.',
  },
  'lh': {
    low: 'A low LH can come from hormonal birth control, pregnancy, or a pituitary or hypothalamus condition, and can affect ovulation.',
    high: 'LH rises sharply just before ovulation (the LH surge). A level that stays high can be seen with PCOS or around menopause.',
  },
  'hcg': {
    low: 'In early pregnancy hCG rises fast, so doctors follow how it changes over a few days rather than one number. Outside pregnancy hCG is normally very low.',
    high: 'A raised hCG usually means pregnancy. It can also come from fertility treatment (a trigger injection) and, rarely, from other conditions. A single level does not tell how far along a pregnancy is.',
  },
  'amh': {
    low: 'A low AMH can mean a smaller egg reserve. It does not tell you whether you can get pregnant or when menopause will come; if you are planning to conceive, a fertility specialist can explain what it means for you.',
    high: 'A high AMH can mean a larger egg reserve and is sometimes seen with PCOS, but it cannot show PCOS on its own.',
  },
  'vitamin b12': {
    low: 'A low B12 can cause tiredness, tingling or numb hands and feet, memory problems and anaemia. It is more likely with diets low in animal products, some gut conditions and some medicines.',
    high: 'A high B12 often comes from supplements or injections; less often it goes with a liver or blood condition.',
  },
  'folate': {
    low: 'A low folate can go with anaemia and tiredness. Folate matters before and in early pregnancy; if you are planning a pregnancy, ask your doctor about folic acid.',
    high: 'A high folate usually comes from supplements or fortified foods. Doctors sometimes check B12 at the same time.',
  },
  'calcium': {
    low: 'A low blood calcium can come from low protein (albumin) in the blood, low vitamin D or magnesium, kidney problems or the parathyroid glands. It can cause muscle cramps or tingling. A blood calcium does not show how much calcium is in your bones.',
    high: 'A high blood calcium can come from overactive parathyroid glands, a lot of vitamin D, and less often other conditions. Doctors may check PTH (parathyroid hormone).',
  },
  'magnesium': {
    low: 'A low magnesium can come from not getting enough in food, long-lasting diarrhoea, alcohol, some medicines (such as some water tablets) or poorly controlled diabetes. It can cause muscle cramps, weakness or tiredness.',
    high: 'A high magnesium is rare from food. It can come from supplements, laxatives or antacids, or from the kidneys not clearing it.',
  },
  'crp': {
    low: 'A low CRP is usually not a concern.',
    high: 'A high CRP means there is inflammation somewhere in the body, but not where or why. Causes range from infections to inflammatory or immune conditions; smoking can raise it too.',
  },
  'prolactin': {
    low: 'A low prolactin is rare and usually not a concern; after birth it can affect milk supply.',
    high: 'A high prolactin can affect ovulation and cause irregular or missed periods. It can come from pregnancy or breastfeeding, stress, some medicines, an underactive thyroid or a small, usually benign growth on the pituitary gland.',
  },
  'testosterone': {
    low: 'Testosterone is naturally low in women, so a low result is usually not a concern on its own.',
    high: 'A high testosterone in women can cause acne, extra hair growth and irregular periods. It is often seen with PCOS, and less often comes from an ovary or adrenal gland condition.',
  },
};

// Other names labs print for the same test.
const ALIASES: Record<string, string> = {
  'hemoglobin a1c': 'hba1c',
  'haemoglobin a1c': 'hba1c',
  'a1c': 'hba1c',
  'glycated hemoglobin': 'hba1c',
  'haemoglobin': 'hemoglobin',
  'b12': 'vitamin b12',
  'cobalamin': 'vitamin b12',
  'wbc': 'white blood cells',
  'leukocytes': 'white blood cells',
  'platelet': 'platelets',
  'c-reactive protein': 'crp',
  'oestradiol': 'estradiol',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Broad names lose to a specific one in the same title: "HDL Cholesterol"
// is HDL, "Hemoglobin A1c" is HbA1c. Otherwise longest name first, as a
// whole word ("Gastrin" is not AST).
const BROAD = new Set(['cholesterol', 'total cholesterol', 'hemoglobin', 'haemoglobin', 'iron']);
// Built on first use, not at import: a module with no import-time work can
// be dropped from bundles that only re-export it (lib/medical-utils.ts), so
// screens that never explain a result don't download this map.
let names: { name: string; re: RegExp }[] | null = null;
const getNames = () =>
  (names ??= [...Object.keys(testExplanations), ...Object.keys(ALIASES)]
    .sort((a, b) => Number(BROAD.has(a)) - Number(BROAD.has(b)) || b.length - a.length)
    .map(name => ({ name, re: new RegExp(`(^|[^a-z0-9])${escape(name)}($|[^a-z0-9])`) })));
// Related tests whose high / low mean something else (high TIBC goes with
// LOW iron; MCH is not hemoglobin; urine values and ratios read differently).
const NOT_THE_SAME_TEST = /binding capacity|tibc|transferrin|saturation|corpuscular|\bmch|ratio|\/|urin|non-hdl/;

/** The explanation for a test title, or undefined for a test we have none for. */
export function findExplanation(title: string | null | undefined): TestExplanation | undefined {
  const t = String(title ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t || NOT_THE_SAME_TEST.test(t)) return undefined;
  const hit = getNames().find(n => n.re.test(t));
  if (!hit) return undefined;
  return testExplanations[ALIASES[hit.name] ?? hit.name];
}

const HIGH_WORDS = new Set(['high', 'elevated']);
const LOW_WORDS = new Set(['low', 'decreased']);

/**
 * A plain note for a result card when the analysis gave none. Above /
 * below comes from the lab's printed range (or its high / low status word);
 * the tier from the shared lab-flags rule.
 */
export function generateFallbackNote(item: MedicalDataItem): string | null {
  if (item.notes) return null;

  const explanation = findExplanation(item.title);
  const status = String(item.status ?? '').trim().toLowerCase();
  const unit = item.unit ? ' ' + item.unit : '';

  let direction: 'high' | 'low' | 'unknown' = 'unknown';
  const val = item.value ? labNumber(item.value, { title: item.title, unit: item.unit }) : null;
  if (val !== null && item.reference_range) {
    const range = parseLabRange(item.reference_range, { sex: 'female' });
    if (range) {
      if (range.low != null && val < range.low) direction = 'low';
      else if (range.high != null && val > range.high) direction = 'high';
    }
  }
  if (direction === 'unknown') {
    if (HIGH_WORDS.has(status)) direction = 'high';
    else if (LOW_WORDS.has(status)) direction = 'low';
  }

  if (status === 'normal') return explanation ? `Your ${item.title} is within the lab's range.` : null;
  if (status === 'expected') {
    return explanation ? `Your ${item.title} is marked as expected for your situation.` : null;
  }

  const flag = labFlag(status);
  if (flag === 'urgent' || flag === 'outside') {
    const next = flag === 'urgent'
      ? ' The lab marked this as urgent: contact your doctor soon rather than waiting for your next visit.'
      : ' Ask your doctor what it means for you at your next visit.';
    const range = item.reference_range ? ` (lab's range: ${item.reference_range}${unit})` : '';
    const value = item.value ? ` (${item.value}${unit})` : '';
    if (explanation && direction !== 'unknown') {
      return `Your ${item.title}${value} is ${direction === 'low' ? 'below' : 'above'} the lab's range${range}. ${explanation[direction]}${next}`;
    }
    const dirLabel = direction === 'low' ? 'below' : direction === 'high' ? 'above' : 'outside';
    return `Your ${item.title}${value} is ${dirLabel} the lab's range${range}.${next}`;
  }

  // Borderline, informational or no status: nothing to say beyond the
  // figures (never "healthy", never a guess at what it means).
  return null;
}
