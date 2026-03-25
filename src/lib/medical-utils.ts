// Types shared across medical components

export interface MedicalDataItem {
  id: string;
  data_type: string;
  title: string;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  status: string | null;
  date_recorded: string | null;
  notes: string | null;
  created_at: string;
  document_id: string | null;
  raw_data?: {
    priority?: string;
    panel?: string;
    is_repeat_test?: boolean;
    possible_conditions?: string[];
  } | null;
}

export interface DocumentInfo {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  ai_suggested_name: string | null;
  ai_summary: string | null;
  ai_suggested_category: string | null;
  uploaded_at: string | null;
  document_type: string;
}

// Status display config
export const friendlyStatus: Record<string, { label: string; emoji: string; color: string; bgColor: string; description: string }> = {
  normal: { label: 'All good', emoji: '✅', color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', description: 'This result is within the healthy range.' },
  expected: { label: 'Normal for you', emoji: '💙', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800', description: 'This is outside the general range, but perfectly normal for your situation.' },
  abnormal: { label: 'Worth discussing', emoji: '⚠️', color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', description: 'This result is outside the normal range. Talk to your doctor about it.' },
  critical: { label: 'Needs attention', emoji: '🔴', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', description: 'This needs urgent medical attention.' },
  informational: { label: 'For reference', emoji: 'ℹ️', color: 'text-muted-foreground', bgColor: 'bg-muted/50 border-border', description: 'Tracked for your records.' },
  active: { label: 'Current', emoji: '📌', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800', description: '' },
  resolved: { label: 'Resolved', emoji: '✓', color: 'text-muted-foreground', bgColor: 'bg-muted/50 border-border', description: '' },
};

export const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function getStatusInfo(status: string | null) {
  return friendlyStatus[status || ''] || friendlyStatus.informational;
}

// Friendly test name lookup
export const friendlyTestNames: Record<string, string> = {
  'Hemoglobin': 'Hemoglobin — carries oxygen in your blood',
  'Ferritin': 'Ferritin — your iron stores',
  'TSH': 'TSH — thyroid function',
  'HCG': 'HCG — pregnancy hormone',
  'Vitamin D': 'Vitamin D — bone & immune health',
  'Vitamin B12': 'Vitamin B12 — nerve & blood cell health',
  'Folate': 'Folate — cell growth & pregnancy support',
  'Folic Acid': 'Folic Acid — cell growth & pregnancy support',
  'Iron': 'Iron — mineral for energy',
  'Glucose': 'Glucose — blood sugar',
  'Fasting Glucose': 'Fasting Glucose — blood sugar (fasting)',
  'HbA1c': 'HbA1c — average blood sugar over 3 months',
  'Platelets': 'Platelets — blood clotting cells',
  'White Blood Cells': 'White Blood Cells — infection fighters',
  'Red Blood Cells': 'Red Blood Cells — oxygen carriers',
  'ALT': 'ALT — liver health marker',
  'AST': 'AST — liver health marker',
  'GGT': 'GGT — liver & bile duct marker',
  'Bilirubin': 'Bilirubin — liver processing marker',
  'Estradiol': 'Estradiol — main estrogen hormone',
  'Progesterone': 'Progesterone — supports pregnancy & cycle',
  'FSH': 'FSH — reproductive hormone',
  'LH': 'LH — ovulation hormone',
  'AMH': 'AMH — ovarian reserve (egg supply)',
  'Prolactin': 'Prolactin — hormone affecting periods & fertility',
  'Testosterone': 'Testosterone — hormone affecting skin, hair & cycle',
  'DHEA-S': 'DHEA-S — adrenal hormone',
  'Creatinine': 'Creatinine — kidney function',
  'Urea': 'Urea — kidney function',
  'Total Cholesterol': 'Total Cholesterol — heart health',
  'LDL': 'LDL — "bad" cholesterol',
  'HDL': 'HDL — "good" cholesterol',
  'Triglycerides': 'Triglycerides — blood fat levels',
  'CRP': 'CRP — inflammation marker',
  'D-Dimer': 'D-Dimer — blood clotting marker',
  'Fibrinogen': 'Fibrinogen — blood clotting protein',
  'Calcium': 'Calcium — bone & muscle health',
  'Magnesium': 'Magnesium — muscle, nerve & sleep support',
  'Sodium': 'Sodium — fluid balance',
  'Potassium': 'Potassium — heart & muscle function',
  'Phosphate': 'Phosphate — bone health',
  'Total Protein': 'Total Protein — overall nutrition',
  'Albumin': 'Albumin — liver function & nutrition',
  'ANA': 'ANA — autoimmune screening',
  'Anti-TPO': 'Anti-TPO — thyroid autoimmune marker',
  'Anticardiolipin': 'Anticardiolipin — blood clotting disorder marker',
  'INR': 'INR — blood clotting speed',
  'PT': 'PT — blood clotting time',
  'APTT': 'APTT — blood clotting time',
  'Hematocrit': 'Hematocrit — red blood cell proportion',
  'MCV': 'MCV — red blood cell size',
  'MCH': 'MCH — hemoglobin per red blood cell',
  'MCHC': 'MCHC — hemoglobin concentration',
  'RDW': 'RDW — red blood cell size variation',
  'Neutrophils': 'Neutrophils — main infection fighters',
  'Lymphocytes': 'Lymphocytes — immune system cells',
  'Monocytes': 'Monocytes — immune cells',
  'Eosinophils': 'Eosinophils — allergy & parasite fighters',
  'Basophils': 'Basophils — allergy-related immune cells',
};

export function getFriendlyName(title: string): string {
  return friendlyTestNames[title] || title;
}

// Test-specific explanations
export const testExplanations: Record<string, { high: string; low: string; normal: string }> = {
  'hemoglobin': { low: 'Low hemoglobin means your blood carries less oxygen, which can cause fatigue, dizziness, and shortness of breath.', high: 'Elevated hemoglobin can be caused by dehydration, smoking, or living at high altitude.', normal: 'Your hemoglobin is healthy — your blood is carrying oxygen well.' },
  'ferritin': { low: 'Low ferritin means your iron stores are depleted. Very common in women due to menstrual blood loss. You may feel tired, have brain fog, or experience hair loss.', high: 'Elevated ferritin can indicate inflammation, liver issues, or iron overload.', normal: 'Your iron stores look good.' },
  'tsh': { low: 'Low TSH suggests your thyroid is overactive (hyperthyroidism). This can cause weight loss, anxiety, and shorter periods.', high: 'Elevated TSH suggests your thyroid is underactive (hypothyroidism). This can cause fatigue, weight gain, and heavier periods.', normal: 'Your thyroid function is healthy.' },
  'vitamin d': { low: 'Low vitamin D is very common and can affect bone health, mood, immunity, and fertility. A supplement can bring it back to healthy levels.', high: 'Very high vitamin D is rare and usually from excessive supplementation.', normal: 'Your vitamin D level is healthy.' },
  'glucose': { low: 'Low blood sugar can cause shakiness and dizziness. If fasting, mildly low is usually fine.', high: 'Elevated blood sugar may indicate prediabetes or diabetes. Lifestyle changes can help.', normal: 'Your blood sugar is in a healthy range.' },
  'estradiol': { low: 'Low estradiol can affect cycle regularity and bone density. In menopause this is expected.', high: 'Elevated estradiol often occurs around ovulation. During IVF stimulation, elevated levels are expected.', normal: 'Your estradiol level is in a healthy range.' },
  'progesterone': { low: 'Low progesterone may indicate you haven\'t ovulated recently. Normal in the first half of your cycle.', high: 'Elevated progesterone confirms ovulation has occurred. During pregnancy, high progesterone is expected.', normal: 'Your progesterone level looks appropriate.' },
  'fsh': { low: 'Low FSH can indicate hormonal suppression affecting ovulation.', high: 'Elevated FSH can indicate diminished ovarian reserve. In menopause, high FSH is expected.', normal: 'Your FSH level is in a healthy range.' },
  'lh': { low: 'Low LH can indicate hormonal imbalance affecting ovulation.', high: 'Elevated LH can indicate an LH surge (ovulation!) or, if persistently high, PCOS.', normal: 'Your LH level is in a healthy range.' },
  'hcg': { low: 'Low HCG in early pregnancy may need monitoring. Outside pregnancy, HCG should be very low.', high: 'Elevated HCG typically indicates pregnancy.', normal: 'Your HCG level is in the expected range.' },
  'amh': { low: 'Low AMH indicates a lower ovarian reserve. If planning to conceive, timing matters.', high: 'Elevated AMH can indicate high egg reserve or may be associated with PCOS.', normal: 'Your ovarian reserve looks healthy.' },
  'crp': { low: 'Low CRP indicates minimal inflammation — this is good.', high: 'Elevated CRP indicates inflammation. Can worsen PMS and affect fertility.', normal: 'No significant inflammation detected.' },
  'calcium': { low: 'Low calcium can affect bone density and cause muscle cramps.', high: 'Elevated calcium may indicate a parathyroid issue.', normal: 'Your calcium level is healthy.' },
  'magnesium': { low: 'Low magnesium is linked to worse period cramps, PMS mood swings, and sleep problems.', high: 'Elevated magnesium is rare from diet alone.', normal: 'Your magnesium level is healthy.' },
};

export function generateFallbackNote(item: MedicalDataItem): string | null {
  if (item.notes) return null;

  const val = item.value ? parseFloat(item.value) : null;
  const hasValue = val !== null && !isNaN(val);

  const titleLower = item.title.toLowerCase();
  const explanation = testExplanations[titleLower]
    || Object.entries(testExplanations).find(([key]) => titleLower.includes(key))?.[1];

  let direction: 'high' | 'low' | 'unknown' = 'unknown';
  if (hasValue && item.reference_range) {
    const match = item.reference_range.match(/([\d.]+)\s*[-–]\s*([\d.]+)/);
    if (match) {
      const low = parseFloat(match[1]);
      const high = parseFloat(match[2]);
      if (val! < low) direction = 'low';
      else if (val! > high) direction = 'high';
    }
  }

  if (item.status === 'normal' || item.status === 'expected') {
    if (explanation) return explanation.normal;
    return null;
  }

  if (item.status === 'abnormal' || item.status === 'critical') {
    if (explanation && direction !== 'unknown') {
      const rangeText = item.reference_range ? ` (healthy range: ${item.reference_range}${item.unit ? ' ' + item.unit : ''})` : '';
      return `Your ${item.title} (${item.value}${item.unit ? ' ' + item.unit : ''}) is ${direction === 'low' ? 'below' : 'above'} the healthy range${rangeText}. ${explanation[direction]}`;
    }
    const dirLabel = direction === 'low' ? 'lower than' : direction === 'high' ? 'higher than' : 'outside';
    return `Your ${item.title} (${item.value || ''}${item.unit ? ' ' + item.unit : ''}) is ${dirLabel} the healthy range${item.reference_range ? ` (${item.reference_range}${item.unit ? ' ' + item.unit : ''})` : ''}. Bring this up at your next doctor visit for personalized advice.`;
  }

  if (explanation) return explanation.normal;
  return null;
}
