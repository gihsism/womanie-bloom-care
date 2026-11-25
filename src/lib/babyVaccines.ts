// Home "Today" row for a baby's vaccinations (postpartum).
//
// Schedules differ by country, so the app never says which vaccine is due.
// It only points at the ages most national schedules share (2 months,
// 4 months, 1 year) and asks her to check the baby's health booklet.
// Dates are local calendar days.

export interface BabyForVaccines {
  name: string | null;
  /** 'YYYY-MM-DD' (local) or null when unknown. */
  birth_date: string | null;
  /** Newest logged vaccination for this baby, if any. */
  lastVaccineAt?: Date | null;
}

/** Ages (in months) at which most schedules have a vaccination visit. */
export const BABY_VACCINE_AGES_MONTHS = [2, 4, 12] as const;
/** The row shows from a few days before the age until three weeks after. */
const DAYS_BEFORE = 3;
const DAYS_AFTER = 21;
/** A vaccination logged from two weeks before the age counts as done. */
const LOGGED_FROM_DAYS_BEFORE = 14;

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function parseLocalDate(s: string | null): Date | null {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Same day-of-month N months later, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsLocal(d: Date, months: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
}

const ageLabel = (months: number) => (months === 12 ? '1 year' : `${months} months`);

export interface BabyVaccineReminder {
  name: string;
  age: string;
}

/** Babies at a common vaccination age with nothing logged around it. */
export function babyVaccineReminders(babies: BabyForVaccines[], now = new Date()): BabyVaccineReminder[] {
  const today = startOfDay(now).getTime();
  const out: BabyVaccineReminder[] = [];
  for (const b of babies) {
    const birth = parseLocalDate(b.birth_date);
    if (!birth) continue;
    for (const months of BABY_VACCINE_AGES_MONTHS) {
      const at = addMonthsLocal(birth, months).getTime();
      if (today < at - DAYS_BEFORE * DAY || today > at + DAYS_AFTER * DAY) continue;
      const last = b.lastVaccineAt ? startOfDay(b.lastVaccineAt).getTime() : null;
      if (last != null && last >= at - LOGGED_FROM_DAYS_BEFORE * DAY) continue;
      out.push({ name: b.name?.trim() || 'Baby', age: ageLabel(months) });
      break;
    }
  }
  return out;
}
