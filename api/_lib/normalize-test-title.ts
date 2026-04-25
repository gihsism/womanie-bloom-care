// Canonical test-title normalisation.
//
// Claude's extraction can be inconsistent — the same test shows up as
// "Hb" in one doc, "Hemoglobin" in another, "Haemoglobin" in a third.
// That breaks every cross-document feature: HealthTrends groups by
// title, RecentFindings dedupes by title, ResultSparkline plots by
// title, NewDocInsights diffs by title. So the right place to fix
// this is the moment values land in `medical_extracted_data` —
// normalize once, never again.
//
// Map keys are lowercase + alphanumeric+space-only after trimming;
// the value is the canonical display title we want stored. New
// aliases can be added without a migration; for the existing rows we
// can run a one-off backfill against this same map later.

const ALIASES: Record<string, string> = {
  // Iron + hematology
  hb: 'Hemoglobin',
  hgb: 'Hemoglobin',
  haemoglobin: 'Hemoglobin',
  hemoglobin: 'Hemoglobin',
  hematocrit: 'Hematocrit',
  hct: 'Hematocrit',
  haematocrit: 'Hematocrit',
  ferritin: 'Ferritin',
  serumferritin: 'Ferritin',
  iron: 'Iron',
  serumiron: 'Iron',
  tibc: 'TIBC',
  totalironbindingcapacity: 'TIBC',
  transferrin: 'Transferrin',
  transferrinsaturation: 'Transferrin Saturation',

  // CBC
  rbc: 'Red Blood Cells',
  redbloodcells: 'Red Blood Cells',
  redbloodcellcount: 'Red Blood Cells',
  wbc: 'White Blood Cells',
  whitebloodcells: 'White Blood Cells',
  whitebloodcellcount: 'White Blood Cells',
  platelets: 'Platelets',
  plateletcount: 'Platelets',
  plt: 'Platelets',
  mcv: 'MCV',
  mch: 'MCH',
  mchc: 'MCHC',
  rdw: 'RDW',
  neutrophils: 'Neutrophils',
  lymphocytes: 'Lymphocytes',
  monocytes: 'Monocytes',
  eosinophils: 'Eosinophils',
  basophils: 'Basophils',

  // Thyroid
  tsh: 'TSH',
  thyroidstimulatinghormone: 'TSH',
  ft4: 'Free T4',
  freet4: 'Free T4',
  ft3: 'Free T3',
  freet3: 'Free T3',
  t3: 'Total T3',
  t4: 'Total T4',
  totalt3: 'Total T3',
  totalt4: 'Total T4',
  antitpo: 'Anti-TPO',
  antithyroidperoxidase: 'Anti-TPO',
  thyroidperoxidaseantibody: 'Anti-TPO',
  antithyroglobulin: 'Anti-Thyroglobulin',
  antitg: 'Anti-Thyroglobulin',

  // Hormones / cycle / fertility
  estradiol: 'Estradiol',
  e2: 'Estradiol',
  progesterone: 'Progesterone',
  fsh: 'FSH',
  folliclestimulatinghormone: 'FSH',
  lh: 'LH',
  luteinizinghormone: 'LH',
  amh: 'AMH',
  antimullerianhormone: 'AMH',
  antimullerian: 'AMH',
  prolactin: 'Prolactin',
  testosterone: 'Testosterone',
  totaltestosterone: 'Total Testosterone',
  freetestosterone: 'Free Testosterone',
  dhea: 'DHEA-S',
  dheas: 'DHEA-S',
  dheasulfate: 'DHEA-S',
  shbg: 'SHBG',
  hcg: 'HCG',
  betahcg: 'HCG',

  // Glucose / diabetes
  glucose: 'Glucose',
  fastingglucose: 'Fasting Glucose',
  bloodglucose: 'Glucose',
  hba1c: 'HbA1c',
  haemoglobina1c: 'HbA1c',
  hemoglobina1c: 'HbA1c',
  glycatedhemoglobin: 'HbA1c',
  insulin: 'Insulin',
  fastinginsulin: 'Fasting Insulin',
  homair: 'HOMA-IR',

  // Lipids
  totalcholesterol: 'Total Cholesterol',
  cholesterol: 'Total Cholesterol',
  ldl: 'LDL',
  ldlcholesterol: 'LDL',
  hdl: 'HDL',
  hdlcholesterol: 'HDL',
  triglycerides: 'Triglycerides',
  apob: 'ApoB',
  apolipoproteinb: 'ApoB',
  lpa: 'Lp(a)',
  lipoproteina: 'Lp(a)',

  // Liver
  alt: 'ALT',
  ast: 'AST',
  ggt: 'GGT',
  alp: 'Alkaline Phosphatase',
  alkalinephosphatase: 'Alkaline Phosphatase',
  bilirubin: 'Bilirubin',
  totalbilirubin: 'Bilirubin',
  albumin: 'Albumin',
  totalprotein: 'Total Protein',

  // Kidney
  creatinine: 'Creatinine',
  serumcreatinine: 'Creatinine',
  urea: 'Urea',
  bun: 'BUN',
  bloodureanitrogen: 'BUN',
  egfr: 'eGFR',
  estimatedgfr: 'eGFR',
  uricacid: 'Uric Acid',

  // Vitamins / minerals
  vitamind: 'Vitamin D',
  '25ohvitamind': 'Vitamin D',
  '25oh': 'Vitamin D',
  '25hydroxyvitamind': 'Vitamin D',
  vitaminb12: 'Vitamin B12',
  b12: 'Vitamin B12',
  cobalamin: 'Vitamin B12',
  folate: 'Folate',
  folicacid: 'Folate',
  vitaminb9: 'Folate',
  calcium: 'Calcium',
  magnesium: 'Magnesium',
  sodium: 'Sodium',
  potassium: 'Potassium',
  phosphate: 'Phosphate',
  zinc: 'Zinc',

  // Inflammation / coagulation
  crp: 'CRP',
  hscrp: 'hs-CRP',
  highsensitivitycrp: 'hs-CRP',
  esr: 'ESR',
  fibrinogen: 'Fibrinogen',
  ddimer: 'D-Dimer',
  inr: 'INR',
  pt: 'PT',
  aptt: 'APTT',

  // Autoimmune / antibodies
  ana: 'ANA',
  antinuclearantibody: 'ANA',
  anticardiolipin: 'Anticardiolipin',
  rheumatoidfactor: 'Rheumatoid Factor',
  rf: 'Rheumatoid Factor',
  anticcp: 'Anti-CCP',

  // Tumour markers
  ca125: 'CA-125',
  ca15: 'CA 15-3',
  '15ca3': 'CA 15-3',
  cea: 'CEA',
};

const NORMAL_RE = /[^a-z0-9]/g;

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(NORMAL_RE, '');
}

/**
 * Normalize a test title to its canonical display form. Returns the
 * input unchanged when no alias is known so we never lose data we
 * couldn't classify — better to keep Claude's wording than to silently
 * remap to something wrong.
 */
export function normalizeTestTitle(title: string | null | undefined): string {
  if (!title || typeof title !== 'string') return '';
  const trimmed = title.trim();
  if (!trimmed) return '';
  const key = normalizeKey(trimmed);
  return ALIASES[key] ?? trimmed;
}
