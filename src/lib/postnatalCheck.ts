// Home -> Today: "Your 6-week postnatal check: booked yet?" for someone in
// the postpartum stage. Pure, so the window and the "already has a visit"
// rule are unit-tested.
//
// Window: weeks 5 to 8 after the birth, the same window as the
// "6-week postnatal visit" recovery milestone on the stage page
// (PostpartumDashboard, id 'six-week-visit'). Hidden when:
//   - the birth date is unknown,
//   - she ticked that milestone as done,
//   - any visit (booked or past, not cancelled) is dated after the birth:
//     she has a visit logged, so we do not second-guess what it was for.

export const POSTNATAL_FROM_DAYS = 5 * 7;
export const POSTNATAL_TO_DAYS = 8 * 7;
export const POSTNATAL_MILESTONE_ID = 'six-week-visit';
export const POSTNATAL_LABEL = 'Your 6-week postnatal check: booked yet?';

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function postnatalCheckDue(opts: {
  birthDate: Date | null | undefined;
  /** Start times of her visits that are not cancelled (past and upcoming). */
  visits: Date[];
  /** The recovery milestone ticked as done. */
  ticked?: boolean;
  now?: Date;
}): boolean {
  const { birthDate, visits, ticked } = opts;
  const now = opts.now ?? new Date();
  if (!birthDate || Number.isNaN(birthDate.getTime()) || ticked) return false;
  const days = Math.round((startOfDay(now) - startOfDay(birthDate)) / DAY);
  if (days < POSTNATAL_FROM_DAYS || days > POSTNATAL_TO_DAYS) return false;
  const birth = startOfDay(birthDate);
  return !visits.some(v => !Number.isNaN(v.getTime()) && startOfDay(v) > birth);
}

/** The birth date to use: the account's birth record, else the youngest baby, else the device copy. */
export function pickBirthDate(birthRecordAt: string | null | undefined, babyBirthDates: Array<string | null | undefined>, deviceDate: string | null | undefined): Date | null {
  const parse = (s: string | null | undefined) => {
    if (!s) return null;
    const day = String(s).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const d = new Date(`${day}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  if (birthRecordAt) {
    const d = new Date(birthRecordAt);
    if (!Number.isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const babies = babyBirthDates.map(parse).filter((d): d is Date => d != null).sort((a, b) => b.getTime() - a.getTime());
  return babies[0] ?? parse(deviceDate);
}
