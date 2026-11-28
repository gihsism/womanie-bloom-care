// Types shared across medical components

import { labFlag } from './labFlags';

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
  mime_type: string;
  ai_suggested_name: string | null;
  ai_summary: string | null;
  ai_suggested_category: string | null;
  uploaded_at: string | null;
  document_type: string;
}

// Status display config
export const friendlyStatus: Record<string, { label: string; emoji: string; color: string; bgColor: string; dot: string; description: string }> = {
  normal: { label: 'All good', emoji: '✅', color: 'text-muted-foreground', bgColor: 'bg-muted/60 border-border', dot: 'bg-foreground/25', description: 'This result is within the healthy range.' },
  expected: { label: 'Normal for you', emoji: '💙', color: 'text-foreground/75', bgColor: 'bg-muted/40 border-border', dot: 'bg-foreground/50', description: 'This is outside the general range, but perfectly normal for your situation.' },
  abnormal: { label: 'Worth discussing', emoji: '⚠️', color: 'text-destructive', bgColor: 'bg-destructive/5 border-destructive/20', dot: 'bg-destructive/60', description: 'This result is outside the normal range. Talk to your doctor about it.' },
  critical: { label: 'Needs attention', emoji: '🔴', color: 'text-destructive', bgColor: 'bg-destructive/10 border-destructive/30', dot: 'bg-destructive', description: 'This needs urgent medical attention.' },
  borderline: { label: 'Borderline', emoji: '•', color: 'text-foreground/75', bgColor: 'bg-muted/40 border-border', dot: 'bg-foreground/50', description: 'Close to the edge of the range. Worth keeping an eye on.' },
  informational: { label: 'For reference', emoji: 'ℹ️', color: 'text-muted-foreground', bgColor: 'bg-muted/50 border-border', dot: 'bg-muted-foreground/40', description: 'Tracked for your records.' },
  active: { label: 'Current', emoji: '📌', color: 'text-primary', bgColor: 'bg-primary/5 border-primary/20', dot: 'bg-primary', description: '' },
  resolved: { label: 'Resolved', emoji: '✓', color: 'text-muted-foreground', bgColor: 'bg-muted/50 border-border', dot: 'bg-muted-foreground/40', description: '' },
};

export const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

// Older rows and doctor-entered rows say high / low / elevated … (the
// shared lab-flags rule counts them as outside the range): they get the
// same label as "abnormal", never "For reference".
export function getStatusInfo(status: string | null) {
  const key = String(status ?? '').trim().toLowerCase();
  if (friendlyStatus[key]) return friendlyStatus[key];
  const flag = labFlag(key);
  if (flag === 'urgent') return friendlyStatus.critical;
  if (flag === 'outside') return friendlyStatus.abnormal;
  if (flag === 'borderline') return friendlyStatus.borderline;
  return friendlyStatus.informational;
}

// Tones for health values shown outside Health Records (Home cards):
// the same muted-ink / burnt-orange language as friendlyStatus, never
// green or yellow. ok = in range, watch = worth discussing, alert =
// needs attention.
export type HealthTone = 'ok' | 'watch' | 'alert';
export const healthTone: Record<HealthTone, { text: string; badge: string; dot: string; tint: string }> = {
  ok: { text: 'text-foreground/75', badge: 'bg-muted/60 text-muted-foreground border-border', dot: 'bg-foreground/25', tint: 'bg-muted/40 border-border' },
  watch: { text: 'text-destructive', badge: 'bg-destructive/5 text-destructive border-destructive/20', dot: 'bg-destructive/60', tint: 'bg-destructive/5 border-destructive/20' },
  alert: { text: 'text-destructive', badge: 'bg-destructive/10 text-destructive border-destructive/30', dot: 'bg-destructive', tint: 'bg-destructive/10 border-destructive/30' },
};

// Soft burnt-orange "attention" banner (replaces the old yellow ones).
export const attentionBanner = 'flex items-start gap-2 p-2.5 rounded-lg border bg-destructive/5 border-destructive/20 text-foreground/80';

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

// Test-specific explanations and the fallback note: one shared module.
export { testExplanations, findExplanation, generateFallbackNote } from './testExplanations';
