// Age- and cycle-phase-adjusted reference ranges for the hormones
// Womanie sees most often on uploaded lab panels. Sources cited per
// table — these are population reference intervals from peer-reviewed
// literature, not Womanie's clinical opinion.
//
// Used to:
//   1. Show "expected for your age" alongside raw lab values
//      (CycleLabInsights, PanelDetail).
//   2. Feed useCyclePrediction so the prediction caveat can name a
//      specific out-of-range hormone driving cycle irregularity.
//
// Everything here is plain data + pure functions. No I/O, no React.

export type HormoneKey =
  | 'amh'
  | 'fsh'
  | 'lh'
  | 'estradiol'
  | 'progesterone'
  | 'tsh'
  | 'testosterone_total'
  | 'testosterone_free'
  | 'prolactin'
  | 'dheas';

export type CyclePhase = 'follicular' | 'midcycle' | 'luteal' | 'postmenopausal' | 'any';

export interface Range {
  low: number;
  high: number;
  unit: string;
  source: string;
  note?: string;
}

// AMH by age — Seifer 2011 (US national cohort, percentiles).
// Each entry: median ng/mL ± p5–p95 band. Used both as a reference
// range and to compute a rough percentile bucket.
//
// AMH naturally declines with age. A value normal for a 25-year-old
// would be diminished reserve for a 38-year-old — so this is the
// single most important table on the page.
export const AMH_BY_AGE: Array<{
  ageFrom: number;
  ageTo: number;
  median: number;
  p5: number;
  p95: number;
}> = [
  { ageFrom: 20, ageTo: 24, median: 3.5, p5: 1.2, p95: 7.0 },
  { ageFrom: 25, ageTo: 29, median: 3.0, p5: 1.0, p95: 6.5 },
  { ageFrom: 30, ageTo: 34, median: 2.5, p5: 0.7, p95: 5.5 },
  { ageFrom: 35, ageTo: 37, median: 1.8, p5: 0.4, p95: 4.5 },
  { ageFrom: 38, ageTo: 40, median: 1.2, p5: 0.2, p95: 3.5 },
  { ageFrom: 41, ageTo: 42, median: 0.7, p5: 0.1, p95: 2.5 },
  { ageFrom: 43, ageTo: 44, median: 0.4, p5: 0.05, p95: 1.8 },
  { ageFrom: 45, ageTo: 49, median: 0.2, p5: 0.02, p95: 1.0 },
  { ageFrom: 50, ageTo: 99, median: 0.05, p5: 0.0, p95: 0.3 },
];

// FSH thresholds for ovarian reserve (day-3 draw, ACOG/ESHRE).
// Values above 10 IU/L suggest diminished ovarian reserve; >25 is
// menopausal range.
export const FSH_DAY3_THRESHOLDS = {
  normal: { low: 1, high: 10, unit: 'IU/L' },
  diminishedReserve: { low: 10, high: 15, unit: 'IU/L' },
  poorResponse: { low: 15, high: 25, unit: 'IU/L' },
  menopausal: { low: 25, high: 200, unit: 'IU/L' },
} as const;

// LH/FSH ratio > 2 with elevated LH suggests PCOS (Rotterdam criteria
// supportive marker, not diagnostic on its own).
export const PCOS_LH_FSH_RATIO_THRESHOLD = 2.0;

// TSH reference range that affects cycle timing. NACB/AACE adult
// reference. Womanie flags subclinical hypothyroidism + overt hypo as
// cycle-irritating because both lengthen / disrupt cycles.
export const TSH_RANGE = {
  low: 0.4,
  high: 4.0,
  unit: 'mIU/L',
  source: 'NACB/AACE',
};

// Prolactin above this (ng/mL) can suppress ovulation and skip cycles.
export const PROLACTIN_HIGH_NG_ML = 23;
// Total testosterone above this (ng/dL) often co-occurs with cycle
// irregularity (upper end of the typical female reference range).
export const TESTOSTERONE_TOTAL_HIGH_NG_DL = 70;
// The PCOS ratio is only meaningful when LH itself is elevated, so we
// also require LH above this floor before flagging the pattern.
export const PCOS_LH_FLOOR = 10;

export interface LabFlags {
  tshOutOfRange: boolean | null;
  highFsh: boolean | null;
  menopausalFsh: boolean | null;
  pcosLhFshPattern: boolean | null;
  highProlactin: boolean | null;
  highTestosterone: boolean | null;
}

// Derive the cycle-affecting lab flags from the latest values. Each flag
// is `null` until its lab arrives, then boolean. Pure so it can be unit-
// tested independently of the data-loading hook that calls it
// (useUserHealthContext). Only reads `.value`, so any {value:number} map
// keyed by HormoneKey works.
export function deriveLabFlags(
  labs: Partial<Record<HormoneKey, { value: number }>>,
): LabFlags {
  return {
    tshOutOfRange: labs.tsh
      ? labs.tsh.value < TSH_RANGE.low || labs.tsh.value > TSH_RANGE.high
      : null,
    highFsh: labs.fsh ? labs.fsh.value > FSH_DAY3_THRESHOLDS.normal.high : null,
    menopausalFsh: labs.fsh ? labs.fsh.value > FSH_DAY3_THRESHOLDS.menopausal.low : null,
    pcosLhFshPattern:
      labs.lh && labs.fsh && labs.fsh.value > 0
        ? labs.lh.value / labs.fsh.value > PCOS_LH_FSH_RATIO_THRESHOLD && labs.lh.value > PCOS_LH_FLOOR
        : null,
    highProlactin: labs.prolactin ? labs.prolactin.value > PROLACTIN_HIGH_NG_ML : null,
    highTestosterone: labs.testosterone_total
      ? labs.testosterone_total.value > TESTOSTERONE_TOTAL_HIGH_NG_DL
      : null,
  };
}

// Cycle-phase-adjusted ranges for estradiol, LH, progesterone. Pulled
// from Mayo / LabCorp reference tables. Picking the right phase
// requires knowing where the user is in her cycle.
export const PHASE_RANGES: Record<HormoneKey, Partial<Record<CyclePhase, Range>>> = {
  amh: {
    any: { low: 1.0, high: 4.0, unit: 'ng/mL', source: 'see AMH_BY_AGE' },
  },
  fsh: {
    follicular: { low: 3, high: 10, unit: 'IU/L', source: 'ACOG' },
    midcycle: { low: 4, high: 25, unit: 'IU/L', source: 'ACOG' },
    luteal: { low: 1.5, high: 9, unit: 'IU/L', source: 'ACOG' },
    postmenopausal: { low: 26, high: 135, unit: 'IU/L', source: 'ACOG' },
  },
  lh: {
    follicular: { low: 2, high: 10, unit: 'IU/L', source: 'Mayo' },
    midcycle: { low: 14, high: 96, unit: 'IU/L', source: 'Mayo', note: 'LH surge — ovulation imminent' },
    luteal: { low: 1, high: 11, unit: 'IU/L', source: 'Mayo' },
    postmenopausal: { low: 8, high: 33, unit: 'IU/L', source: 'Mayo' },
  },
  estradiol: {
    follicular: { low: 19, high: 144, unit: 'pg/mL', source: 'Mayo' },
    midcycle: { low: 64, high: 357, unit: 'pg/mL', source: 'Mayo' },
    luteal: { low: 56, high: 214, unit: 'pg/mL', source: 'Mayo' },
    postmenopausal: { low: 0, high: 20, unit: 'pg/mL', source: 'Mayo' },
  },
  progesterone: {
    follicular: { low: 0.1, high: 0.7, unit: 'ng/mL', source: 'Mayo' },
    midcycle: { low: 0.1, high: 1.5, unit: 'ng/mL', source: 'Mayo' },
    luteal: { low: 1.7, high: 27.0, unit: 'ng/mL', source: 'Mayo', note: 'Day-21 ≥ 3 ng/mL suggests ovulation' },
    postmenopausal: { low: 0, high: 0.5, unit: 'ng/mL', source: 'Mayo' },
  },
  tsh: {
    any: { low: 0.4, high: 4.0, unit: 'mIU/L', source: 'NACB/AACE' },
  },
  testosterone_total: {
    any: { low: 15, high: 70, unit: 'ng/dL', source: 'LabCorp female', note: 'Elevated → consider PCOS workup' },
  },
  testosterone_free: {
    any: { low: 0.3, high: 1.9, unit: 'pg/mL', source: 'LabCorp female' },
  },
  prolactin: {
    any: { low: 4, high: 23, unit: 'ng/mL', source: 'Mayo female', note: 'Elevated can suppress ovulation' },
  },
  dheas: {
    any: { low: 35, high: 430, unit: 'µg/dL', source: 'LabCorp female 18–49' },
  },
};

// Title → key map. Maps the canonical extracted-data titles
// (normalize-test-title.ts upstream) to our hormone keys.
const TITLE_TO_KEY: Array<[RegExp, HormoneKey]> = [
  [/^anti[-\s]?m(u|ü|u̇)llerian( hormone)?$|^amh$/i, 'amh'],
  [/^fsh$|follicle[-\s]?stimulating/i, 'fsh'],
  [/^lh$|luteinizing/i, 'lh'],
  [/^estradiol$|^e2$/i, 'estradiol'],
  [/^progesterone$/i, 'progesterone'],
  [/^tsh$|thyroid[-\s]?stimulating/i, 'tsh'],
  [/^testosterone(\s+total)?$/i, 'testosterone_total'],
  [/^free\s+testosterone$|^testosterone\s+free$/i, 'testosterone_free'],
  [/^prolactin$/i, 'prolactin'],
  [/^dhea[-\s]?s$/i, 'dheas'],
];

export function hormoneKeyForTitle(title: string | null | undefined): HormoneKey | null {
  if (!title) return null;
  const t = title.trim();
  for (const [pattern, key] of TITLE_TO_KEY) {
    if (pattern.test(t)) return key;
  }
  return null;
}

export interface AmhAssessment {
  ageBracket: string;
  median: number;
  p5: number;
  p95: number;
  percentileBucket: 'very_low' | 'low' | 'average' | 'high' | 'very_high';
  reserveLabel: 'diminished' | 'low_average' | 'average' | 'good' | 'high';
  note: string;
  unit: 'ng/mL';
}

// Compare a user's AMH value to her age bracket. Returns null when we
// can't anchor it (no age, value out of plausible range, etc).
export function assessAmh(valueNgMl: number | null, age: number | null): AmhAssessment | null {
  if (valueNgMl === null || age === null) return null;
  if (!Number.isFinite(valueNgMl) || valueNgMl < 0 || valueNgMl > 50) return null;
  if (!Number.isFinite(age) || age < 10 || age > 100) return null;

  const bracket = AMH_BY_AGE.find(b => age >= b.ageFrom && age <= b.ageTo);
  if (!bracket) return null;

  // Interpolate a rough percentile bucket. Anchors: p5, median, p95.
  let percentileBucket: AmhAssessment['percentileBucket'];
  let reserveLabel: AmhAssessment['reserveLabel'];
  if (valueNgMl < bracket.p5) {
    percentileBucket = 'very_low';
    reserveLabel = 'diminished';
  } else if (valueNgMl < bracket.median * 0.5) {
    percentileBucket = 'low';
    reserveLabel = 'low_average';
  } else if (valueNgMl <= bracket.median * 1.4) {
    percentileBucket = 'average';
    reserveLabel = 'average';
  } else if (valueNgMl <= bracket.p95) {
    percentileBucket = 'high';
    reserveLabel = 'good';
  } else {
    percentileBucket = 'very_high';
    reserveLabel = 'high';
  }

  const ageBracket = bracket.ageTo >= 99 ? `${bracket.ageFrom}+` : `${bracket.ageFrom}–${bracket.ageTo}`;
  const note =
    reserveLabel === 'diminished'
      ? `Below the 5th percentile for ages ${ageBracket} — discuss reserve testing with a fertility specialist if planning conception.`
      : reserveLabel === 'low_average'
        ? `Below median for ages ${ageBracket}, but within normal range.`
        : reserveLabel === 'average'
          ? `Around the median for ages ${ageBracket}.`
          : reserveLabel === 'good'
            ? `Above median for ages ${ageBracket} — reassuring for ovarian reserve.`
            : `Notably high for ages ${ageBracket}. PCOS can raise AMH; if cycles are irregular, consider a full workup.`;

  return {
    ageBracket,
    median: bracket.median,
    p5: bracket.p5,
    p95: bracket.p95,
    percentileBucket,
    reserveLabel,
    note,
    unit: 'ng/mL',
  };
}

// Convenience: lookup a phase range for any hormone.
export function getPhaseRange(key: HormoneKey, phase: CyclePhase): Range | null {
  const byPhase = PHASE_RANGES[key];
  if (!byPhase) return null;
  return byPhase[phase] ?? byPhase.any ?? null;
}

// Approximate cycle phase from cycle day. Used when a user's lab was
// drawn during a tracked cycle and we know the day count.
export function cyclePhaseForDay(cycleDay: number, cycleLength: number): CyclePhase {
  if (cycleDay <= 0) return 'follicular';
  // Mid-cycle ovulation window: ovulation day ± 2.
  const ovulation = cycleLength - 14;
  if (Math.abs(cycleDay - ovulation) <= 2) return 'midcycle';
  if (cycleDay < ovulation) return 'follicular';
  return 'luteal';
}

// Numeric value extractor: pulls a number out of strings like
// "3.4", "3.4 ng/mL", "<0.1", ">100", "3,4" (European decimal).
// Returns null when no number is present.
export function parseLabValue(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).replace(/,/g, '.').replace(/[<>≤≥]/g, '');
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}
