// When a medicine runs out: the course end date she entered, or the last
// day of the current pack (pack started + doses in pack / doses a day).
// Home's Today list shows a row from REFILL_WINDOW_DAYS before that day
// up to the day itself (columns from migration 027; before it is applied
// the fields are simply absent and nothing shows). Pure, unit-tested.
//
// The pack estimate follows her schedule (times_per_day), not the doses
// she ticked: plenty of people take a medicine without ticking it.

export interface SupplyMed {
  name: string;
  times_per_day?: number | null;
  /** Last day of a course, yyyy-mm-dd (migration 027). */
  ends_on?: string | null;
  /** Doses in the current pack (migration 027). */
  pack_size?: number | null;
  /** Day she started the current pack, yyyy-mm-dd (migration 027). */
  pack_started_on?: string | null;
}

export interface SupplyEnd {
  kind: 'course' | 'pack';
  /** yyyy-mm-dd: the last day she has a dose for. */
  lastDay: string;
}

export interface SupplyReminder extends SupplyEnd {
  name: string;
  /** 0 = today. */
  daysLeft: number;
  /** One line, e.g. "Iron: pack runs out in 3 days". */
  label: string;
}

export const REFILL_WINDOW_DAYS = 3;
const DAY = 86_400_000;

const parse = (s: string | null | undefined): Date | null => {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s)) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayDiff = (a: Date, b: Date) =>
  Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / DAY);

/** The earlier of the course end and the pack's last day; null when neither is known. */
export function supplyEnd(m: SupplyMed): SupplyEnd | null {
  const ends: SupplyEnd[] = [];
  const course = parse(m.ends_on);
  if (course) ends.push({ kind: 'course', lastDay: ymd(course) });
  const start = parse(m.pack_started_on);
  const size = Number(m.pack_size);
  const perDay = Number(m.times_per_day);
  if (start && Number.isInteger(size) && size > 0 && Number.isInteger(perDay) && perDay > 0) {
    const days = Math.ceil(size / perDay);
    ends.push({ kind: 'pack', lastDay: ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + days - 1)) });
  }
  if (ends.length === 0) return null;
  return ends.sort((a, b) => a.lastDay.localeCompare(b.lastDay))[0];
}

const when = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

export function supplyLabel(name: string, end: SupplyEnd, daysLeft: number): string {
  return end.kind === 'course'
    ? `${name}: last day of the course ${when(daysLeft)}`
    : daysLeft === 0 ? `${name}: last dose of this pack today` : `${name}: pack runs out ${when(daysLeft)}`;
}

/** Medicines whose supply ends within the window (today included), soonest first. */
export function supplyReminders(meds: SupplyMed[], now = new Date(), windowDays = REFILL_WINDOW_DAYS): SupplyReminder[] {
  const out: SupplyReminder[] = [];
  for (const m of meds) {
    if (!m.name?.trim()) continue;
    const end = supplyEnd(m);
    if (!end) continue;
    const daysLeft = dayDiff(now, parse(end.lastDay)!);
    if (daysLeft < 0 || daysLeft > windowDays) continue;
    out.push({ ...end, name: m.name.trim(), daysLeft, label: supplyLabel(m.name.trim(), end, daysLeft) });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
}

/** "Pack lasts until 2 Dec" / "Course ends 2 Dec" for the medicine row; null when unknown. */
export function supplyNote(m: SupplyMed, locale?: string): string | null {
  const end = supplyEnd(m);
  if (!end) return null;
  const d = parse(end.lastDay)!.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return end.kind === 'course' ? `Course ends ${d}` : `Pack lasts until ${d}`;
}
