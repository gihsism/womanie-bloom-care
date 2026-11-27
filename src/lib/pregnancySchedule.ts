// Pregnancy: "Check-ups and scans" overview. Lists ONLY the steps whose
// timing a source in the Womanie research library states (library.json,
// ids below); for everything else (how many check-ups, when) the card says
// to ask your midwife or doctor. Swiss notes (what basic insurance covers,
// BAG; the SGGG glucose-test advice) sit next to the steps with their own
// official Swiss source. The RhD and GBS steps cite the Swiss SGGG letters
// themselves (library items with hand-written summaries, round 5). Shows which ones she has marked done, and counts a glucose test
// result in her records dated in this pregnancy as done. Pure, unit-tested.
//
// Marks live in womanie_preg_checkups_{uid} (synced to the account, see
// lib/account-data.ts), the same shape as the vaccination marks.

export interface ScheduleSource {
  /** Research library id (api/_lib/research/library.json). */
  id: string;
  label: string;
  url: string;
}

export interface ScheduleItem {
  key: string;
  label: string;
  /** When, in the source's words. */
  when: string;
  /** Week range used for "around now"; endWeek null = from startWeek on; startWeek null = no set week. */
  startWeek: number | null;
  endWeek: number | null;
  note: string;
  source: ScheduleSource;
  /** What applies in Switzerland, from an official Swiss source (not a library item). */
  swiss?: { note: string; source: SwissSource };
  /** A second Swiss note with its own source (e.g. a coverage change the BAG page does not list yet). */
  swissMore?: { note: string; source: SwissSource };
}

export interface SwissSource {
  label: string;
  url: string;
}

const BAG_MATERNITY: SwissSource = {
  label: 'BAG, Krankenversicherung: Leistungen bei Mutterschaft',
  url: 'https://www.bag.admin.ch/de/krankenversicherung-leistungen-bei-mutterschaft',
};

/** EDI decision of 9 June 2026 (AS 2026 336): KLV Art. 13 new letter b quater, in force 1 July 2026. */
const BAG_KLV_JULY_2026: SwissSource = {
  label: 'BAG, Kommentar zu den Änderungen der KLV per 1.7.2026 (Art. 13 Bst. bquater)',
  url: 'https://www.bag.admin.ch/dam/it/sd-web/hB7uwEMylr2J/Kommentar%20zu%20den%20%C3%84nderungen%20der%20KLV%20per%201.7.2026%20und%201.1.2027.pdf',
};

const FIRST_TRIMESTER_GUIDELINE: ScheduleSource = {
  id: 'pmid-39353600',
  label: 'First-trimester guideline, Ultraschall in der Medizin 2025',
  url: 'https://pubmed.ncbi.nlm.nih.gov/39353600/',
};

/** Swiss SGGG letters held in the research library as hand-written summaries (scripts/research/swiss-sources.mjs). */
const SGGG_ANTI_D: ScheduleSource = {
  id: 'gp-sggg-empfehlungen-zur-anti-d-immunglobulin-ga-d77009',
  label: 'SGGG expert letter 68 (anti-D), Gynäkologie 1/2020',
  url: 'https://www.rosenfluh.ch/media/gynaekologie/2020/01/Empfehlungen-zur-Anti-D-Immunglobulin-Gabe-in-der-Schwangerschaft-Anti-D-Prophylaxe.pdf',
};

const SGGG_GBS: ScheduleSource = {
  id: 'gp-sggg-86-prophylaxe-gbs-sepsis-des-neugeborene-52360b',
  label: 'SGGG clinical practice recommendation 86 (GBS), 2024',
  url: 'https://www.sggg.ch/fileadmin/user_upload/86_Prophylaxe_GBS-Sepsis_des_Neugeborenen_englischVersion.pdf',
};

export const PREGNANCY_SCHEDULE: ScheduleItem[] = [
  {
    key: 'first-trimester-scan',
    label: 'First-trimester scan',
    when: 'Weeks 11 to 13+6',
    startWeek: 11,
    endWeek: 13,
    note: 'The guideline calls this the best time to screen for many pregnancy complications, so care can be planned early.',
    source: FIRST_TRIMESTER_GUIDELINE,
    swiss: {
      note: 'In Switzerland, basic insurance covers a scan at weeks 12 to 14 in a normal pregnancy.',
      source: BAG_MATERNITY,
    },
    swissMore: {
      note: 'Since 1 July 2026, basic insurance in Switzerland also covers a first-trimester test for the risk of pre-eclampsia (a pregnancy condition with high blood pressure), done at the same weeks 12 to 14 scan for women expecting one baby: your risk factors, your blood pressure, a Doppler scan of the blood flow to the womb and a blood test (PlGF). Depending on the result, your doctor may prescribe low-dose aspirin to lower the risk.',
      source: BAG_KLV_JULY_2026,
    },
  },
  {
    key: 'chromosome-screening',
    label: 'Screening for chromosome conditions',
    when: 'Offered in every pregnancy',
    startWeek: null,
    endWeek: null,
    note: 'Your choice whether to have it. Which test and when: ask your midwife or doctor.',
    source: {
      id: 'pmid-32804883',
      label: 'ACOG Practice Bulletin 226, 2020',
      url: 'https://pubmed.ncbi.nlm.nih.gov/32804883/',
    },
    swiss: {
      note: 'In Switzerland, basic insurance covers the first-trimester test (risk of trisomy 21, 18 and 13), and a NIPT blood test from week 12 if that risk is 1 in 1000 or higher.',
      source: BAG_MATERNITY,
    },
  },
  {
    key: 'mid-pregnancy-scan',
    label: 'Mid-pregnancy scan',
    when: 'Around week 20',
    startWeek: 19,
    endWeek: 22,
    note: 'A second scan to complete the check of how the baby is developing.',
    source: FIRST_TRIMESTER_GUIDELINE,
    swiss: {
      note: 'In Switzerland, basic insurance covers a second scan at weeks 20 to 23 in a normal pregnancy.',
      source: BAG_MATERNITY,
    },
  },
  {
    key: 'glucose-test',
    label: 'Test for gestational diabetes',
    when: 'From week 24',
    startWeek: 24,
    endWeek: null,
    note: 'A blood sugar test, usually with a sugary drink. Your results show here once they are in your records.',
    source: {
      id: 'pmid-34374716',
      label: 'US Preventive Services Task Force, 2021',
      url: 'https://pubmed.ncbi.nlm.nih.gov/34374716/',
    },
    swiss: {
      note: 'In Switzerland, the SGGG recommends testing every pregnant woman between weeks 24 and 28, as a rule with a 75 g glucose drink test (OGTT). Without risk factors, a fasting blood sugar test can come first, which spares some women the drink.',
      source: {
        label: 'SGGG expert letter 81, Gynäkologie 1/2024',
        url: 'https://www.rosenfluh.ch/media/gynaekologie/2024/01/Screening-und-Management-der-Gestationsdiabetes.pdf',
      },
    },
  },
  {
    key: 'rhd-baby-test',
    label: "Baby's RhD blood group test (if you are RhD negative)",
    when: 'Weeks 18 to 24',
    startWeek: 18,
    endWeek: 24,
    note: "Your blood group is checked at an early check-up. If you are RhD negative, a blood test from you can show your baby's RhD group. Only if the baby is RhD positive do you get an anti-D injection at weeks 28 to 30 and after the birth. If you are RhD positive, this step does not apply to you.",
    source: SGGG_ANTI_D,
  },
  {
    key: 'gbs-swab',
    label: 'Swab for group B streptococcus (GBS)',
    when: 'Weeks 35 to 37',
    startWeek: 35,
    endWeek: 37,
    note: 'One swab from the lower vagina and the skin around the anus, which you can often take yourself. If it finds GBS, you are offered antibiotics through a drip during labour to protect your baby; no treatment is needed before labour. Tell your team if you are allergic to penicillin.',
    source: SGGG_GBS,
  },
];

export const SCHEDULE_ASK_LINE =
  'How many check-ups you have, when they are and what your insurance covers: ask your midwife or doctor.';

/** Swiss check-up count, shown under the ask line. */
export const SWISS_CHECKUPS_LINE = {
  note: 'In Switzerland, basic insurance covers seven check-ups with a doctor or midwife in a normal pregnancy, more if needed in a high-risk pregnancy. You pay no deductible or co-payment for these maternity services, and from week 13 until eight weeks after the birth none for other medical care either.',
  source: BAG_MATERNITY,
};

export interface CheckupMark {
  /** yyyy-mm-dd she marked it done. */
  doneDate?: string;
}
export type CheckupState = Record<string, CheckupMark>;

export const PREG_CHECKUPS_KEY = (userId: string) => `womanie_preg_checkups_${userId}`;

export type ScheduleStatusKind = 'done' | 'now' | 'upcoming' | 'earlier' | 'anytime';

export interface ScheduleStatus {
  kind: ScheduleStatusKind;
  label: string;
  /** Where "done" came from. */
  from?: 'mark' | 'record';
  date?: string;
}

export interface LabRow {
  title: string;
  date_recorded: string | null;
}

const GLUCOSE = /\b(ogtt|gtt|glucose|blood\s+sugar|glukose|blutzucker)\b/i;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ymdShort = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/**
 * The latest glucose-test date in her records that falls in this
 * pregnancy from week 20 on (an earlier fasting glucose is a different test).
 */
export function glucoseTestInPregnancy(labs: LabRow[], dueDate: Date | null): string | null {
  if (!dueDate) return null;
  const start = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate() - 280 + 20 * 7);
  const end = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate() + 21);
  let best: string | null = null;
  for (const l of labs) {
    const day = /^(\d{4}-\d{2}-\d{2})/.exec(l.date_recorded ?? '')?.[1];
    if (!day || !GLUCOSE.test(l.title ?? '')) continue;
    const [y, m, d] = day.split('-').map(Number);
    const t = new Date(y, m - 1, d);
    if (t < start || t > end) continue;
    if (!best || day > best) best = day;
  }
  return best;
}

export function scheduleStatus(
  item: ScheduleItem,
  week: number | null,
  state: CheckupState,
  glucoseRecord: string | null = null,
): ScheduleStatus {
  const mark = state[item.key]?.doneDate;
  if (mark) return { kind: 'done', label: `Done ${ymdShort(mark)}`, from: 'mark', date: mark };
  if (item.key === 'glucose-test' && glucoseRecord) {
    return { kind: 'done', label: `Result in your records, ${ymdShort(glucoseRecord)}`, from: 'record', date: glucoseRecord };
  }
  if (item.startWeek == null || week == null) return { kind: 'anytime', label: 'Not marked yet' };
  if (week < item.startWeek) {
    const n = item.startWeek - week;
    return { kind: 'upcoming', label: `In ${n} ${n === 1 ? 'week' : 'weeks'}` };
  }
  if (item.endWeek == null || week <= item.endWeek) return { kind: 'now', label: 'Around now' };
  return { kind: 'earlier', label: 'Earlier in pregnancy: mark it if you had it' };
}

/** "2 of 4 marked done". */
export function doneCount(week: number | null, state: CheckupState, glucoseRecord: string | null = null): number {
  return PREGNANCY_SCHEDULE.filter(i => scheduleStatus(i, week, state, glucoseRecord).kind === 'done').length;
}
