// What to do after a late or missed pill, by pill type and hours late.
//
// Sources (the hour limits and steps below follow these; the leaflet in
// her own pack wins if it says something different):
//   - FSRH Clinical Guideline: Combined Hormonal Contraception (Jan 2019,
//     amended Oct 2023), "Missed pill rules" — late = less than 24 h late,
//     one pill missed = 24–48 h late, two or more missed = 48 h or more;
//     7 days of condoms after 2+ missed; week 1 -> consider emergency
//     contraception (EC), week 3 -> skip the pill-free break.
//   - FSRH Clinical Guideline: Progestogen-only Pills (Aug 2022, amended
//     2023) — traditional POP (levonorgestrel / norethisterone) is missed
//     at more than 3 h late, desogestrel at more than 12 h late,
//     drospirenone 4 mg (24+4) at more than 24 h late. Take one pill now,
//     condoms for 48 h (drospirenone: 7 days); EC if there was sex without
//     a condom since the missed pill.
//   - FSRH (now CoSRH) CEU Guidance: Recommended Actions after Incorrect
//     Use of Combined Hormonal Contraception (2020, amended 2021) - the
//     week-by-week rules above; EC "should be considered if UPSI occurred
//     in the pill-free interval or in the first week"; one missed pill:
//     EC "not usually required but may need to be considered if pills have
//     been missed earlier in the packet or in the last week of the previous
//     packet". Vomiting within 3 hours of any pill (combined or
//     progestogen-only) = take another pill (FSRH CHC 2019 + POP 2022;
//     NHS "Combined pill: sickness or diarrhoea"; Qlaira / Zoely leaflets
//     allow 4 h - the leaflet wins).
//   - Drospirenone (FSRH POP 2022): EC if sex without a condom while
//     pills were missed and before 7 pills in a row were taken again;
//     missed in days 1-7 -> EC if sex without a condom in the 4
//     hormone-free days before the pack.
//   - Research library: CDC U.S. Selected Practice Recommendations for
//     Contraceptive Use 2024 (pmid 39106301; same 24 h / 48 h split, 7
//     days of condoms, skip the hormone-free days after week-3 misses, EC
//     after week-1 misses). WHO Selected Practice Recommendations (3rd ed.
//     2016) use the same thresholds. Checked against all of the above on
//     2026-11-27.
//   - Swiss practice (SGGG guidance, Swiss package leaflets on
//     compendium.ch, Swiss pharmacies' EC counselling) uses the same hour
//     limits. In Switzerland the emergency pill is sold in pharmacies
//     without a prescription after a short talk with the pharmacist; a
//     copper IUD fitted by a doctor within 5 days is the most effective EC.
//
// Plain language, no brand names. Never a diagnosis: every result ends
// with "if unsure, ask your pharmacist or doctor".

export type PillType = 'combined' | 'pop-traditional' | 'pop-desogestrel' | 'pop-drospirenone';

export const PILL_TYPES: { id: PillType; label: string; hint: string }[] = [
  { id: 'combined', label: 'Combined pill', hint: 'Oestrogen + progestogen, usually 21 pills then a break' },
  { id: 'pop-desogestrel', label: 'Mini-pill (desogestrel)', hint: 'Progestogen-only, taken every day, 12-hour window' },
  { id: 'pop-drospirenone', label: 'Mini-pill (drospirenone)', hint: 'Progestogen-only, 24 hormone pills + 4 without, 24-hour window' },
  { id: 'pop-traditional', label: 'Mini-pill (older type)', hint: 'Levonorgestrel or norethisterone, 3-hour window' },
];

export const DEFAULT_PILL_TYPE: PillType = 'combined';

export function isPillType(v: unknown): v is PillType {
  return typeof v === 'string' && PILL_TYPES.some(t => t.id === v);
}

/** Hours late after which the pill counts as missed (FSRH). */
export const MISSED_AFTER_HOURS: Record<PillType, number> = {
  combined: 24,
  'pop-traditional': 3,
  'pop-desogestrel': 12,
  'pop-drospirenone': 24,
};

/** Pack days that hold hormone pills (the rest are a break / hormone-free pills). */
export const ACTIVE_DAYS: Record<PillType, number> = {
  combined: 21,
  'pop-traditional': 28,
  'pop-desogestrel': 28,
  'pop-drospirenone': 24,
};

export type LateLevel =
  | 'not-late'       // not due yet / on time
  | 'late'           // late but still protected
  | 'missed'         // past the window (combined: one pill)
  | 'missed-2plus'   // combined only: 48 h or more = two or more pills
  | 'break';         // the missed pill was a break / hormone-free pill

export function classifyLate(pillType: PillType, hoursLate: number, packDay?: number | null): LateLevel {
  if (packDay != null && packDay > ACTIVE_DAYS[pillType]) return 'break';
  if (!Number.isFinite(hoursLate) || hoursLate <= 0) return 'not-late';
  const limit = MISSED_AFTER_HOURS[pillType];
  // FSRH POP wording: "more than 3 / 12 / 24 hours late"; CHC: "24 hours or more".
  const missed = pillType === 'combined' ? hoursLate >= limit : hoursLate > limit;
  if (!missed) return 'late';
  if (pillType === 'combined' && hoursLate >= 48) return 'missed-2plus';
  return 'missed';
}

/**
 * Vomiting within this many hours of a pill counts like a missed pill:
 * 3 h for combined and progestogen-only pills alike (FSRH CHC 2019 and
 * POP 2022, NHS). Kept per type so a brand rule can differ later.
 */
export function vomitWindowHours(_pillType: PillType): number {
  return 3;
}

/** The sources line under the guidance (plain names, no links needed on paper). */
export const SOURCES_LINE =
  'Based on: FSRH (UK) missed-pill guidance for combined and progestogen-only pills, and the CDC U.S. Selected Practice Recommendations for Contraceptive Use (2024).';

/** Hours since the pill was due: due day (yyyy-MM-dd) at her usual time (HH:mm). */
export function hoursLateSince(dueDay: string, usualTime: string, now = new Date()): number {
  const [y, m, d] = dueDay.split('-').map(Number);
  const [hh, mm] = /^\d{1,2}:\d{2}$/.test(usualTime) ? usualTime.split(':').map(Number) : [9, 0];
  const due = new Date(y, m - 1, d, hh, mm);
  return Math.max(0, (now.getTime() - due.getTime()) / 3_600_000);
}

/** The quick choices on the guidance sheet: label + a representative hour count. */
export const LATE_CHOICES: { id: string; label: string; hours: number }[] = [
  { id: 'lt3', label: 'Under 3 h', hours: 2 },
  { id: '3-12', label: '3–12 h', hours: 8 },
  { id: '12-24', label: '12–24 h', hours: 18 },
  { id: '24-48', label: '24–48 h (one pill)', hours: 36 },
  { id: '48plus', label: '48 h or more', hours: 60 },
];

export function choiceForHours(hours: number): string {
  if (hours < 3) return 'lt3';
  if (hours < 12) return '3-12';
  if (hours < 24) return '12-24';
  if (hours < 48) return '24-48';
  return '48plus';
}

export interface MissedPillGuidance {
  level: LateLevel;
  /** One calm headline. */
  title: string;
  /** What to do now, in order. */
  steps: string[];
  /** Extra protection needed (condoms / no sex), or null when none. */
  extraProtection: string | null;
  /** Emergency contraception: whether to think about it, and the plain options. */
  emergency: { consider: boolean; text: string } | null;
  /** Always shown last. */
  footer: string;
}

export const EC_OPTIONS =
  'Emergency contraception options: an emergency pill from a pharmacy (no prescription needed in Switzerland; works best the sooner you take it, within 3 to 5 days depending on the type), or a copper IUD fitted by a doctor within 5 days, which is the most effective option.';

export const UNSURE_FOOTER =
  'If you are unsure, ask your pharmacist or doctor today. Your pill leaflet has the rules for your brand.';

const TAKE_NOW = 'Take the late pill now, as soon as you remember.';
const CARRY_ON = 'Take the next pill at your usual time, even if that means two pills today.';

export function missedPillGuidance(pillType: PillType, hoursLate: number, packDay?: number | null): MissedPillGuidance {
  const level = classifyLate(pillType, hoursLate, packDay);
  const base = { footer: UNSURE_FOOTER };

  if (level === 'break') {
    return {
      ...base,
      level,
      title: 'This was a break-week pill',
      steps: [
        pillType === 'combined'
          ? 'Pills in the break week (or the coloured pills without hormones) do not protect you, so missing one does not change your protection.'
          : 'The last pills in your pack have no hormones, so missing one does not change your protection.',
        'Throw the missed one away and carry on, so your next pack starts on time.',
      ],
      extraProtection: null,
      emergency: null,
    };
  }

  if (level === 'not-late') {
    return {
      ...base,
      level,
      title: 'Not late yet',
      steps: ['Take your pill at your usual time.'],
      extraProtection: null,
      emergency: null,
    };
  }

  if (level === 'late') {
    const window = MISSED_AFTER_HOURS[pillType];
    return {
      ...base,
      level,
      title: 'Late, but you are still protected',
      steps: [
        TAKE_NOW,
        CARRY_ON,
        `Less than ${window} hours late counts as a late pill for this type, not a missed one.`,
      ],
      extraProtection: null,
      emergency: null,
    };
  }

  if (pillType === 'combined') {
    if (level === 'missed') {
      return {
        ...base,
        level,
        title: 'One pill missed',
        steps: [
          TAKE_NOW,
          CARRY_ON,
          'Finish the pack as usual and take your normal break.',
        ],
        extraProtection: null,
        emergency: {
          consider: false,
          text: 'Emergency contraception is usually not needed after one missed pill. Ask a pharmacist if you also missed pills earlier in this pack or at the end of the last pack. ' + EC_OPTIONS,
        },
      };
    }
    // Two or more missed (48 h or more).
    const steps = [
      'Take the most recent missed pill now. Leave any earlier missed pills in the pack.',
      CARRY_ON,
    ];
    let consider = false;
    let ecLine = packDay == null
      ? 'If the missed pills were in the first week of the pack and you had sex without a condom in the break week or since, emergency contraception may be needed: talk to a pharmacist today. Later in the pack, if all the pills in the 7 days before were taken correctly, it is not usually needed.'
      : 'If all the pills in the 7 days before were taken correctly, emergency contraception is not usually needed.';
    if (packDay != null && packDay >= 1 && packDay <= 7) {
      consider = true;
      ecLine = 'The missed pills were in the first week of the pack. If you had sex without a condom in the break week or since, emergency contraception may be needed: talk to a pharmacist today.';
    } else if (packDay != null && packDay >= 15 && packDay <= 21) {
      steps.push('The missed pills were in the last week of hormone pills: finish them, then skip the break and start the next pack straight away.');
    }
    return {
      ...base,
      level,
      title: 'Two or more pills missed',
      steps,
      extraProtection: 'Use condoms or avoid sex until you have taken 7 hormone pills in a row.',
      emergency: { consider, text: `${ecLine} ${EC_OPTIONS}` },
    };
  }

  if (pillType === 'pop-drospirenone') {
    const steps = [TAKE_NOW, CARRY_ON];
    let consider = false;
    let ecLine = 'If you had sex without a condom since the pill was due, or before you have taken 7 pills in a row again, ask a pharmacist about emergency contraception today.';
    if (packDay != null && packDay >= 1 && packDay <= 7) {
      consider = true;
      ecLine = 'The missed pill was in the first week of the pack. If you had sex without a condom in the 4 hormone-free days before this pack or since the pill was due, emergency contraception may be needed: talk to a pharmacist today.';
    } else if (packDay != null && packDay >= 15 && packDay <= 24) {
      steps.push('Skip the 4 pills without hormones and start the next pack straight after the last hormone pill.');
    }
    return {
      ...base,
      level,
      title: 'Pill missed (more than 24 hours late)',
      steps,
      extraProtection: 'Use condoms or avoid sex for the next 7 days.',
      emergency: { consider, text: `${ecLine} ${EC_OPTIONS}` },
    };
  }

  // Traditional and desogestrel progestogen-only pills.
  const limit = MISSED_AFTER_HOURS[pillType];
  return {
    ...base,
    level,
    title: `Pill missed (more than ${limit} hours late)`,
    steps: [
      'Take one pill now, as soon as you remember. If you missed more than one, still take only one.',
      CARRY_ON,
    ],
    extraProtection: 'Use condoms or avoid sex for the next 2 days (48 hours).',
    emergency: {
      consider: true,
      text: `If you had sex without a condom since the pill was due, or in the next 2 days before protection is back, emergency contraception may be needed: talk to a pharmacist today. ${EC_OPTIONS}`,
    },
  };
}
