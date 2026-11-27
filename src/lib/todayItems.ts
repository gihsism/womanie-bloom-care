import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { POSTNATAL_LABEL } from './postnatalCheck';

// Home's three answers to "what do I do now?", as pure functions so they
// can be unit-tested without a browser or database:
//   todayItems()        — the ranked "Today" list (max 3 one-line rows)
//   primaryActionFor()  — the single filled button for the stage
//   moreFor()           — the "More for <stage>" links (max 4)
//
// A target is either a route ('/path' or '/path#anchor') or one of the Log
// sheet targets ('sheet:log' opens today's log, 'sheet:medicines' opens the
// sheet on the medicine ticks).

export type Target = string;

export const STAGE_PAGE = '/dashboard/stage';
export const RECORDS = '/dashboard/medical-history';
/** Records opened on its "My charts" segment (cycle, ovulation, sleep charts). */
export const RECORDS_CHARTS = `${RECORDS}?tab=charts`;
export const VISITS = '/dashboard/appointments';
export const ME = '/dashboard/settings';
/** The baby tracker opened on its Vaccines tab. */
export const BABY_VACCINES = '/dashboard/baby?tab=vax';

export interface TodayItem {
  id: string;
  label: string; // one line, ≤ 60 characters
  target: Target;
}

export interface TodaySignals {
  now?: Date;
  /** Start time of a (not yet finished) visit today. */
  appointmentToday?: Date | null;
  /** Doctor notes written in the last 14 days. */
  newDoctorNotes?: number;
  /** Results marked "talk to your doctor". */
  flaggedResults?: number;
  /** Days until the next predicted period; negative = late. Cycle stages only. */
  periodDaysUntil?: number | null;
  /** Start of the next upcoming visit (after today). */
  nextVisit?: Date | null;
  /** Medicines whose reminder time has passed today without a "Taken" tick (time = HH:MM). */
  medicinesDue?: Array<{ name: string; time: string }>;
  /** Medicines whose course or pack ends within a few days (lib/medicineSupply.ts), soonest first. */
  medicinesRunningOut?: Array<{ name: string; label: string }>;
  /**
   * Contraceptive pill ticks (contraception + daily pill only). reminderTime
   * is the HH:MM she set on the contraception card; takenYesterday is null
   * when she isn't ticking regularly (no nag for people who never tick);
   * packDay 22–28 is the pill-free week of a 21/7 pack, as the card assumes.
   */
  pill?: { reminderTime: string; takenToday: boolean; takenYesterday: boolean | null; packDay?: number | null } | null;
  /** Pregnancy vaccines in their window and not marked received / "not now". */
  vaccinesDue?: string[];
  /** Date of the last EPDS mood check; null = never taken; undefined = not known yet. */
  lastMoodCheck?: Date | null;
  /** Postpartum: weeks 5-8 after the birth with no visit logged since (lib/postnatalCheck.ts). */
  postnatalCheckDue?: boolean;
  /** Postpartum: babies at a common vaccination age with nothing logged around it. */
  babyVaccines?: Array<{ name: string; age: string }>;
  /**
   * Last day a mood was ticked in the daily log; null = none in the last
   * weeks; undefined = not known yet. Drives the gentle weekly mood row for
   * the stages without the EPDS check.
   */
  lastMoodLog?: Date | null;
  /** Getting-started progress; omitted or done === total hides the row. */
  setup?: { done: number; total: number; nameMissing?: boolean; nextTarget?: Target } | null;
}

export const MAX_TODAY = 3;
export const MAX_MORE = 4;
const DAY = 86_400_000;
export const MAX_LATE_DAYS = 14;
/** PMSForecastCard's window: the 5 days before the predicted period. */
export const PMS_WINDOW_DAYS = 5;
/** The EPDS card asks to "check in again in 2 weeks". */
export const MOOD_CHECK_EVERY_DAYS = 14;
const MOOD_STAGES: readonly string[] = ['pregnancy', 'postpartum'];
/** The other stages get a gentle weekly mood prompt (daily log mood ticks). */
export const MOOD_LOG_EVERY_DAYS = 7;
const MONDAY = 1;

const minutesOf = (hhmmStr: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmmStr);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** Trim to one row of at most 60 characters. */
const fit = (label: string) => (label.length <= 60 ? label : `${label.slice(0, 59).trimEnd()}…`);

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

/** "today", "tomorrow" or the weekday name (callers stay within a week). */
function dayName(now: Date, d: Date): string {
  const n = daysBetween(now, d);
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  return WEEKDAY[d.getDay()];
}
const onDay = (now: Date, d: Date) => {
  const n = dayName(now, d);
  return n === 'today' || n === 'tomorrow' ? n : `on ${n}`;
};

const CYCLE_STAGES: readonly string[] = ['menstrual-cycle', 'conception'];

export function todayItems(mode: LifeStage, s: TodaySignals): TodayItem[] {
  const now = s.now ?? new Date();
  const items: TodayItem[] = [];

  // 1. A visit today
  if (s.appointmentToday) {
    items.push({ id: 'visit-today', label: `Visit today at ${hhmm(s.appointmentToday)}`, target: VISITS });
  }
  // 2. A new note from the doctor
  if ((s.newDoctorNotes ?? 0) > 0) {
    const n = s.newDoctorNotes!;
    items.push({ id: 'doctor-note', label: n === 1 ? 'New note from your doctor' : `${n} new notes from your doctor`, target: VISITS });
  }
  // 3. Results to talk about
  if ((s.flaggedResults ?? 0) > 0) {
    const n = s.flaggedResults!;
    items.push({ id: 'flagged-results', label: n === 1 ? '1 result to talk to your doctor about' : `${n} results to talk to your doctor about`, target: RECORDS });
  }
  // 4. A due stage task: missed pill, medicine due, vaccination due,
  //    6-week postnatal check, baby vaccination age, mood check due, period due in the next 2 days or late.
  const pill = s.pill;
  if (mode === 'contraception' && pill && !(pill.packDay != null && pill.packDay > 21)) {
    const due = minutesOf(pill.reminderTime);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (!pill.takenToday && due != null && nowMin >= due) {
      items.push({ id: 'pill-missed', label: `Today's pill not ticked yet (due ${pill.reminderTime})`, target: `${STAGE_PAGE}#contraception` });
    } else if (pill.takenYesterday === false && !(pill.packDay != null && pill.packDay === 1)) {
      items.push({ id: 'pill-missed', label: "Yesterday's pill not ticked. Missed it?", target: `${STAGE_PAGE}#contraception` });
    }
  }
  const meds = s.medicinesDue ?? [];
  if (meds.length === 1) {
    items.push({ id: 'medicine-due', label: fit(`${meds[0].name} due (${meds[0].time})`), target: 'sheet:medicines' });
  } else if (meds.length > 1) {
    items.push({ id: 'medicine-due', label: `${meds.length} medicines due`, target: 'sheet:medicines' });
  }
  const vax = mode === 'pregnancy' ? s.vaccinesDue ?? [] : [];
  if (vax.length > 0) {
    items.push({
      id: 'vaccination-due',
      label: fit(vax.length === 1 ? `${vax[0]} vaccination due` : `${vax.length} vaccinations due: ${vax.join(', ')}`),
      target: `${STAGE_PAGE}#vaccinations`,
    });
  }
  if (MOOD_STAGES.includes(mode) && s.lastMoodCheck !== undefined) {
    const last = s.lastMoodCheck;
    if (last === null) {
      items.push({ id: 'mood-check', label: 'Take the 2-minute mood check', target: `${STAGE_PAGE}#mood-check` });
    } else if (daysBetween(last, now) >= MOOD_CHECK_EVERY_DAYS) {
      items.push({ id: 'mood-check', label: 'Mood check due (every 2 weeks)', target: `${STAGE_PAGE}#mood-check` });
    }
  }
  if (mode === 'postpartum' && s.postnatalCheckDue) {
    items.push({ id: 'postnatal-check', label: POSTNATAL_LABEL, target: `${STAGE_PAGE}#recovery` });
  }
  const babies = mode === 'postpartum' ? s.babyVaccines ?? [] : [];
  if (babies.length === 1) {
    items.push({ id: 'baby-vaccination', label: fit(`${babies[0].name} is ${babies[0].age}: check the vaccine booklet`), target: BABY_VACCINES });
  } else if (babies.length > 1) {
    items.push({ id: 'baby-vaccination', label: 'Vaccination age: check the babies\' booklets', target: BABY_VACCINES });
  }
  const pd = s.periodDaysUntil;
  if (CYCLE_STAGES.includes(mode) && pd != null) {
    // Late by up to two weeks; beyond that the log is likely just stale.
    if (pd < 0 && pd >= -MAX_LATE_DAYS) {
      const late = -pd;
      items.push({ id: 'period-late', label: `Period ${late} day${late === 1 ? '' : 's'} late? Log it if it started`, target: 'sheet:log' });
    } else if (pd >= 0 && pd <= 2) {
      const when = pd === 0 ? 'today' : pd === 1 ? 'tomorrow' : 'in 2 days';
      items.push({ id: 'period-soon', label: `Period likely ${when}`, target: 'sheet:log' });
    }
  }
  // 5. Time-limited heads-ups: PMS in the next few days, a medicine running
  // out (course / pack ends within 3 days), a visit within 7 days
  // Same window as the PMS card on the stage page: the 5 days before the period.
  if (mode === 'menstrual-cycle' && pd != null && pd >= 3 && pd <= 7) {
    const label = pd > PMS_WINDOW_DAYS
      ? `PMS likely from ${dayName(now, new Date(now.getFullYear(), now.getMonth(), now.getDate() + pd - PMS_WINDOW_DAYS))}`
      : `PMS days: period in ${pd} days`;
    items.push({ id: 'pms-soon', label, target: `${STAGE_PAGE}#pms` });
  }
  const out = s.medicinesRunningOut ?? [];
  if (out.length === 1) {
    items.push({ id: 'medicine-supply', label: fit(out[0].label), target: `${STAGE_PAGE}#medicines` });
  } else if (out.length > 1) {
    items.push({ id: 'medicine-supply', label: `${out.length} medicines run out in the next few days`, target: `${STAGE_PAGE}#medicines` });
  }
  if (s.nextVisit) {
    const n = daysBetween(now, s.nextVisit);
    if (n >= 1 && n <= 7) {
      items.push({ id: 'visit-soon', label: `Visit ${onDay(now, s.nextVisit)} at ${hhmm(s.nextVisit)}`, target: VISITS });
    }
  }
  // 5b. Gentle weekly mood prompt for the stages without the EPDS check: a
  // week since she last ticked a mood; someone who never ticks one sees
  // it on Mondays only, so it stays weekly rather than daily.
  if (!MOOD_STAGES.includes(mode) && s.lastMoodLog !== undefined) {
    const last = s.lastMoodLog;
    const due = last === null ? now.getDay() === MONDAY : daysBetween(last, now) >= MOOD_LOG_EVERY_DAYS;
    if (due) items.push({ id: 'mood-weekly', label: 'How has your mood been this week?', target: 'sheet:log' });
  }
  // 6. Unfinished setup, as one row
  if (s.setup && s.setup.done < s.setup.total) {
    items.push(
      s.setup.nameMissing
        ? { id: 'setup', label: 'Add your name', target: `${ME}#profile` }
        : { id: 'setup', label: `Finish setting up (${s.setup.done} of ${s.setup.total} done)`, target: s.setup.nextTarget ?? RECORDS },
    );
  }

  return items.slice(0, MAX_TODAY);
}

export const NOTHING_TODAY = 'Nothing needs you today';

export interface PrimaryAction {
  label: string;
  target: Target;
}

export function primaryActionFor(
  mode: LifeStage,
  opts: { weeksPregnant?: number | null; dailyPill?: boolean } = {},
): PrimaryAction {
  const log: PrimaryAction = { label: 'Log today', target: 'sheet:log' };
  switch (mode) {
    case 'contraception':
      return opts.dailyPill === false ? log : { label: "Log today's pill", target: `${STAGE_PAGE}#contraception` };
    case 'ivf':
      return { label: 'Log medication', target: 'sheet:medicines' };
    case 'pregnancy': {
      const w = opts.weeksPregnant ?? 0;
      if (w >= 37) return { label: 'Time contractions', target: `${STAGE_PAGE}#contraction-timer` };
      if (w >= 28) return { label: 'Count kicks', target: `${STAGE_PAGE}#kick-counter` };
      return log;
    }
    case 'postpartum':
      return { label: 'Log a feed', target: '/dashboard/baby?tab=feed' };
    case 'menopause':
    case 'post-menopause':
      return { label: 'Log symptoms', target: 'sheet:log' };
    default:
      return log;
  }
}

/**
 * The quiet "Log today" link under the filled button, for the stages
 * whose filled button opens something else (pregnancy from week 28 = kick
 * counter / contraction timer, a daily pill, a baby feed). Every stage
 * thus keeps one tap from Home into today's mood/symptom log. null when
 * the filled button already opens a Log sheet.
 */
export function secondaryActionFor(
  mode: LifeStage,
  opts: { weeksPregnant?: number | null; dailyPill?: boolean } = {},
): PrimaryAction | null {
  return primaryActionFor(mode, opts).target.startsWith('sheet:') ? null : { label: 'Log today', target: 'sheet:log' };
}

export interface MoreRow {
  label: string;
  target: Target;
}

export function moreFor(mode: LifeStage, opts: { weeksPregnant?: number | null } = {}): MoreRow[] {
  const guides: MoreRow = { label: 'Guides', target: `${STAGE_PAGE}#guides` };
  const meds: MoreRow = { label: 'Medicines', target: `${STAGE_PAGE}#medicines` };
  const rows: MoreRow[] = (() => {
    switch (mode) {
      case 'pre-menstrual':
        return [{ label: 'What to expect', target: STAGE_PAGE }, { label: 'Your results', target: RECORDS }, meds];
      case 'menstrual-cycle':
        return [{ label: 'Calendar', target: `${STAGE_PAGE}#cycle-calendar` }, { label: 'Charts & history', target: RECORDS_CHARTS }, guides, meds];
      case 'conception':
        return [{ label: 'Calendar', target: `${STAGE_PAGE}#cycle-calendar` }, { label: 'Ovulation & charts', target: RECORDS_CHARTS }, guides, meds];
      case 'contraception':
        return [{ label: 'Your method', target: `${STAGE_PAGE}#contraception` }, { label: 'Your results', target: RECORDS }, guides, meds];
      case 'ivf':
        return [{ label: 'Your IVF timeline', target: `${STAGE_PAGE}#ivf-tracker` }, { label: 'Your results', target: RECORDS }, guides, meds];
      case 'pregnancy': {
        const late = (opts.weeksPregnant ?? 0) >= 32;
        return [
          { label: 'Weight & blood pressure', target: `${STAGE_PAGE}#weight` },
          { label: 'Vaccinations', target: `${STAGE_PAGE}#vaccinations` },
          late ? { label: 'Labour & birth', target: '/dashboard/birth' } : { label: 'Mood check', target: `${STAGE_PAGE}#mood-check` },
          guides,
        ];
      }
      case 'postpartum':
        // No "Baby tracker" row: the hero's own link already says it.
        return [
          { label: 'Your recovery', target: `${STAGE_PAGE}#recovery` },
          { label: 'Mood check', target: `${STAGE_PAGE}#mood-check` },
          { label: 'Birth details', target: '/dashboard/birth' },
          meds,
        ];
      case 'menopause':
      case 'post-menopause':
        return [
          { label: 'Symptom calendar', target: `${STAGE_PAGE}#symptoms` },
          { label: 'Blood pressure', target: `${STAGE_PAGE}#blood-pressure` },
          guides,
          meds,
        ];
      default:
        return [guides, meds];
    }
  })();
  return rows.slice(0, MAX_MORE);
}
