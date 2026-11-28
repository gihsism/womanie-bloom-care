// Swiss baby vaccination schedule for the Vaccines tab and the printed
// summary. Kept out of babyVaccines.ts (Home's reminder rule, also used by
// the server) so Home does not load the schedule.
//
// Source: BAG / EKIF, Schweizerischer Impfplan 2026 (published 23 Feb 2026,
// corrected 16 Apr 2026), Tabelle 1 "Synopsis" and chapter 1.1 "Alter
// 0-3 Jahre" incl. 1.1.a (RSV) and h-l (rotavirus, MenB, MenACWY, MMR,
// varicella): https://www.bag.admin.ch/de/schweizerischer-impfplan

import { addMonthsLocal } from './babyVaccines';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
function parseLocalDate(s: string | null): Date | null {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

// ---------------------------------------------------------------------------
// Swiss schedule, birth to 18 months (BAG Schweizerischer Impfplan 2026).
//
// Basic (Basisimpfung, recommended for all babies; the RSV antibody is
// placed in the same category):
//   - RSV long-acting antibody (e.g. nirsevimab), one dose in the first
//     year: born October-March -> first week of life, unless the mother had
//     the RSV vaccine (Abrysvo, weeks 32+0 to 36+0) at least 14 days before
//     the birth; born April-September -> in October or as soon as possible
//     after. Possible until the day before the 1st birthday. (Ch. 1.1.a,
//     Abbildung 1.)
//   - DTPa-IPV-Hib-HBV (6-in-1) at 2, 4, 12 months ("2+1").
//   - Pneumococcal conjugate (PCV) at 2, 4, 12 months ("2+1").
//   - MMRV (measles, mumps, rubella, varicella) at 9 and 12 months.
// Complementary (ergaenzende Impfung, mainly the baby's own protection):
//   - Rotavirus, oral, at 2 and 4 months; dose 1 from 6 weeks up to
//     15 weeks 6 days, dose 2 by 23 weeks 6 days; not given from 24 weeks.
//   - Meningococcal B (4CMenB) at 3, 5 and 12-18 months (at 2 and 4 months
//     together with the others is also possible).
//   - Meningococcal ACWY at 12-18 months, 1 or 2 doses depending on the
//     vaccine (shown as one entry).
// Not in the routine Swiss plan: BCG, a hepatitis B dose at birth (only for
// babies of HBsAg-positive mothers). Vitamin K is not a vaccine.
// ---------------------------------------------------------------------------

export type BabyVaccineId = 'rsv' | 'hexa' | 'pcv' | 'rota' | 'menb' | 'mmrv' | 'acwy';

export interface BabyVaccineInfo {
  id: BabyVaccineId;
  name: string;
  /** What it protects against, in plain words. */
  against: string;
  /** BAG category: basic = for all babies; complementary = mainly the baby's own protection. */
  category: 'basic' | 'complementary';
}

export const BAG_BABY_VACCINES: Record<BabyVaccineId, BabyVaccineInfo> = {
  rsv: { id: 'rsv', name: 'RSV antibody', against: 'RSV, a winter virus that can cause serious chest infections in babies', category: 'basic' },
  hexa: { id: 'hexa', name: '6-in-1 vaccine', against: 'diphtheria, tetanus, whooping cough, polio, Hib and hepatitis B', category: 'basic' },
  pcv: { id: 'pcv', name: 'Pneumococcal vaccine', against: 'pneumococcal infections (meningitis, pneumonia, blood infection)', category: 'basic' },
  rota: { id: 'rota', name: 'Rotavirus drops', against: 'rotavirus, a common cause of severe diarrhoea; given by mouth', category: 'complementary' },
  menb: { id: 'menb', name: 'Meningococcal B vaccine', against: 'meningococcal B (meningitis, blood infection)', category: 'complementary' },
  mmrv: { id: 'mmrv', name: 'MMRV vaccine', against: 'measles, mumps, rubella and chickenpox', category: 'basic' },
  acwy: { id: 'acwy', name: 'Meningococcal ACWY vaccine', against: 'meningococcal A, C, W and Y (meningitis, blood infection)', category: 'complementary' },
};

export interface BabyVaccineDose {
  /** Stable id, saved with a "done" mark: 'hexa-1'. */
  id: string;
  vaccine: BabyVaccineId;
  dose: number;
  of: number;
  /** Visit age in months; null = RSV antibody (depends on the birth month). */
  months: number | null;
  /** Shown age, e.g. '2 months', '12-18 months'. */
  age: string;
  /** Last day it can be given, in days of age (rotavirus). */
  maxAgeDays?: number;
  note?: string;
}

const dose = (vaccine: BabyVaccineId, n: number, of: number, months: number | null, age: string, extra: Partial<BabyVaccineDose> = {}): BabyVaccineDose =>
  ({ id: `${vaccine}-${n}`, vaccine, dose: n, of, months, age, ...extra });

/** Every dose from birth to 18 months, BAG Impfplan 2026 (Tabelle 1, ch. 1.1). */
export const BAG_BABY_SCHEDULE: BabyVaccineDose[] = [
  dose('rsv', 1, 1, null, 'First year', { note: 'One injection. Not needed if you had the RSV vaccine in pregnancy at least 2 weeks before the birth, except in special cases such as a premature birth.' }),
  dose('hexa', 1, 3, 2, '2 months'),
  dose('pcv', 1, 3, 2, '2 months'),
  // 15 weeks 6 days = 111 days; 23 weeks 6 days = 167 days.
  dose('rota', 1, 2, 2, '2 months', { maxAgeDays: 111, note: 'Given from 6 weeks up to 15 weeks 6 days of age.' }),
  dose('menb', 1, 3, 3, '3 months', { note: 'Often its own visit at 3 and 5 months (less fever). It can also be given with the 2- and 4-month vaccines.' }),
  dose('hexa', 2, 3, 4, '4 months'),
  dose('pcv', 2, 3, 4, '4 months'),
  dose('rota', 2, 2, 4, '4 months', { maxAgeDays: 167, note: 'Given by 23 weeks 6 days of age; not given from 24 weeks.' }),
  dose('menb', 2, 3, 5, '5 months'),
  dose('mmrv', 1, 2, 9, '9 months'),
  dose('hexa', 3, 3, 12, '12 months', { note: 'Ideally done before 13 months.' }),
  dose('pcv', 3, 3, 12, '12 months', { note: 'Ideally done before 13 months.' }),
  dose('mmrv', 2, 2, 12, '12 months'),
  dose('menb', 3, 3, 12, '12-18 months'),
  dose('acwy', 1, 1, 12, '12-18 months', { note: 'One or two doses, depending on the vaccine.' }),
];

export const BAG_SCHEDULE_SOURCE = 'Source: BAG Swiss vaccination schedule 2026';
export const BAG_SCHEDULE_URL = 'https://www.bag.admin.ch/de/schweizerischer-impfplan';

export type DoseStatus = 'done' | 'due' | 'soon' | 'later' | 'closed';

export interface VaccineMark { id: string; dose: string; /** 'YYYY-MM-DD' */ on: string }

export interface PlannedDose extends BabyVaccineDose {
  name: string;
  /** Due date (local), null without a birth date. */
  due: Date | null;
  status: DoseStatus;
  /** 'YYYY-MM-DD' she marked it done. */
  doneOn?: string;
  markId?: string;
}

export interface PlannedVisit {
  key: string;
  age: string;
  due: Date | null;
  status: DoseStatus;
  doses: PlannedDose[];
}

/** "Due soon" = within the next 30 days. */
export const DUE_SOON_DAYS = 30;
const addDays = (dt: Date, n: number) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);
const inRsvSeason = (birth: Date) => birth.getMonth() >= 9 || birth.getMonth() <= 2;

/** RSV antibody due date: born October-March -> the birth day; born April-September -> 1 October that year. */
export function rsvDueDate(birth: Date): Date {
  return inRsvSeason(birth) ? birth : new Date(birth.getFullYear(), 9, 1);
}

/** When the RSV antibody is given, in plain words, for this birth date. */
export function rsvTiming(birthDate: string | null): string {
  const birth = parseLocalDate(birthDate);
  if (!birth) return 'Born October to March: in the first week of life. Born April to September: in October.';
  return inRsvSeason(birth)
    ? 'Born in the RSV season (October to March): in the first week of life, or as soon as possible after.'
    : `Born April to September: in October ${birth.getFullYear()}, or as soon as possible after (before the first birthday).`;
}

const doseName = (x: BabyVaccineDose) => {
  const v = BAG_BABY_VACCINES[x.vaccine].name;
  return x.of > 1 ? `${v}, dose ${x.dose} of ${x.of}` : v;
};

/**
 * The schedule with her "done" marks. Each dose is done, due (date
 * reached, not marked), soon (within 30 days), later, or closed (no longer
 * given at this age: rotavirus after its age limit, the RSV antibody from
 * the first birthday). Grouped by visit (same age), in schedule order.
 */
export function babyVaccinePlan(birthDate: string | null, marks: VaccineMark[], now = new Date()): PlannedVisit[] {
  const birth = parseLocalDate(birthDate);
  const today = startOfDay(now).getTime();
  const markOf = new Map<string, VaccineMark>();
  for (const m of marks) {
    const prev = markOf.get(m.dose);
    if (!prev || m.on < prev.on) markOf.set(m.dose, m);
  }
  const planned: PlannedDose[] = BAG_BABY_SCHEDULE.map(x => {
    const due = !birth ? null : x.months === null ? rsvDueDate(birth) : addMonthsLocal(birth, x.months);
    const mark = markOf.get(x.id);
    let status: DoseStatus;
    if (mark) status = 'done';
    else if (!birth || !due) status = 'later';
    else if (x.maxAgeDays != null && today > addDays(birth, x.maxAgeDays).getTime()) status = 'closed';
    else if (x.vaccine === 'rsv' && today >= addMonthsLocal(birth, 12).getTime()) status = 'closed';
    else if (today >= due.getTime()) status = 'due';
    else if (today >= addDays(due, -DUE_SOON_DAYS).getTime()) status = 'soon';
    else status = 'later';
    return { ...x, name: doseName(x), due, status, doneOn: mark?.on, markId: mark?.id };
  });
  // Rotavirus dose 2 is not started without dose 1.
  const r1 = planned.find(p => p.id === 'rota-1');
  const r2 = planned.find(p => p.id === 'rota-2');
  if (r1 && r2 && r1.status === 'closed' && r2.status !== 'done') r2.status = 'closed';

  const visits: PlannedVisit[] = [];
  for (const p of planned) {
    const key = p.months === null ? 'rsv' : p.age;
    let v = visits.find(x => x.key === key);
    if (!v) { v = { key, age: p.months === null ? 'Birth to 1 year' : p.age, due: p.due, status: 'later', doses: [] }; visits.push(v); }
    v.doses.push(p);
  }
  const rank: Record<DoseStatus, number> = { due: 0, soon: 1, later: 2, done: 3, closed: 4 };
  for (const v of visits) {
    const open = v.doses.filter(x => x.status !== 'done' && x.status !== 'closed');
    v.status = open.length
      ? open.reduce((a, b) => (rank[b.status] < rank[a.status] ? b : a)).status
      : v.doses.some(x => x.status === 'done') ? 'done' : 'closed';
  }
  return visits;
}

const ymd = (t: Date) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

/** "Done" marks from baby_vaccine life events (only entries saved from the schedule carry a dose id). */
export function vaccineMarksFrom(events: Array<{ id: string; occurred_at: string; data?: unknown }>): VaccineMark[] {
  const out: VaccineMark[] = [];
  for (const e of events) {
    let data = e.data as unknown;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = null; } }
    const id = (data as { dose?: unknown } | null)?.dose;
    if (typeof id !== 'string' || !BAG_BABY_SCHEDULE.some(x => x.id === id)) continue;
    const t = new Date(e.occurred_at);
    if (Number.isNaN(t.getTime())) continue;
    out.push({ id: e.id, dose: id, on: ymd(t) });
  }
  return out;
}
