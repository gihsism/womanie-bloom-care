// Pregnancy: "Check-ups and scans" overview. Lists ONLY the steps whose
// timing a source in the Womanie research library states (library.json,
// ids below); for everything else (how many check-ups, when, what your
// insurance covers in Switzerland) the card says to ask your midwife or
// doctor. Shows which ones she has marked done, and counts a glucose test
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
}

const FIRST_TRIMESTER_GUIDELINE: ScheduleSource = {
  id: 'pmid-39353600',
  label: 'First-trimester guideline, Ultraschall in der Medizin 2025',
  url: 'https://pubmed.ncbi.nlm.nih.gov/39353600/',
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
  },
  {
    key: 'mid-pregnancy-scan',
    label: 'Mid-pregnancy scan',
    when: 'Around week 20',
    startWeek: 19,
    endWeek: 22,
    note: 'A second scan to complete the check of how the baby is developing.',
    source: FIRST_TRIMESTER_GUIDELINE,
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
  },
];

export const SCHEDULE_ASK_LINE =
  'How many check-ups you have, when they are and what your insurance covers: ask your midwife or doctor.';

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
