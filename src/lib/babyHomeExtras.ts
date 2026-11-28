// The two lines of Home's baby card that need bigger tables: the next
// vaccination (BAG schedule) and the latest weight with its WHO
// percentile. Loaded on its own (dynamic import from BabyHomeCard), so
// neither the schedule nor the WHO tables come with Home.
import { format } from 'date-fns';
import { DAY_MONTH_FMT, DATE_FMT } from '@/lib/dateFormat';
import { BAG_BABY_VACCINES, babyVaccinePlan, vaccineMarksFrom } from '@/lib/babyVaccineSchedule';
import { ageInDays, kgLabel, normaliseSex, percentileOf, percentileShort, MAX_AGE_DAYS } from '@/lib/babyGrowth';

type Ev = { id: string; occurred_at: string; data?: unknown };

const dayLabel = (d: Date, now: Date) => format(d, d.getFullYear() === now.getFullYear() ? DAY_MONTH_FMT : DATE_FMT);

export interface NextVaccine {
  /** "6-in-1 vaccine + 2 more" */
  what: string;
  /** "due now" or "due 3 Jan" */
  when: string;
}

/**
 * The next visit on the BAG schedule with a dose not yet marked done:
 * the one due earliest (a date already reached reads "due now"). null
 * without a birth date or when nothing is left.
 */
export function nextVaccine(birthDate: string | null, vaccineEvents: Ev[], now = new Date()): NextVaccine | null {
  if (!birthDate) return null;
  const plan = babyVaccinePlan(birthDate, vaccineMarksFrom(vaccineEvents), now);
  let best: { due: Date; names: string[]; status: string } | null = null;
  for (const v of plan) {
    const open = v.doses.filter(d => (d.status === 'due' || d.status === 'soon' || d.status === 'later') && d.due);
    if (!open.length) continue;
    const due = open.reduce((a, d) => ((d.due as Date) < a ? (d.due as Date) : a), open[0].due as Date);
    if (!best || due < best.due) {
      const names = [...new Set(open.map(d => BAG_BABY_VACCINES[d.vaccine].name))];
      best = { due, names, status: open.some(d => d.status === 'due') ? 'due' : 'later' };
    }
  }
  if (!best) return null;
  const what = best.names.length > 1 ? `${best.names[0]} + ${best.names.length - 1} more` : best.names[0];
  return { what, when: best.status === 'due' ? 'due now' : `due ${dayLabel(best.due, now)}` };
}

export interface LatestWeight {
  /** "4.6 kg" */
  weight: string;
  /** "52nd percentile", or null without sex / birth date or outside 0-24 months. */
  percentile: string | null;
  /** "26 Nov" */
  on: string;
}

const localYmd = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');

/** The latest measurement with a weight, with its WHO weight-for-age percentile. Numbers only. */
export function latestWeight(birthDate: string | null, sex: string | null, growthEvents: Ev[], now = new Date()): LatestWeight | null {
  let latest: { kg: number; at: string } | null = null;
  for (const e of growthEvents) {
    let data = e.data as unknown;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { data = null; } }
    const g = Number((data as { weight_g?: unknown } | null)?.weight_g);
    if (!Number.isFinite(g) || g <= 0) continue;
    if (Number.isNaN(Date.parse(e.occurred_at))) continue;
    if (!latest || e.occurred_at > latest.at) latest = { kg: g / 1000, at: e.occurred_at };
  }
  if (!latest) return null;
  const on = localYmd(latest.at);
  const s = normaliseSex(sex);
  const day = birthDate ? ageInDays(birthDate.slice(0, 10), on) : null;
  const p = s && day !== null && day >= 0 && day <= MAX_AGE_DAYS ? percentileOf('weight', s, day, latest.kg) : null;
  return {
    weight: kgLabel(latest.kg),
    percentile: p === null ? null : `${percentileShort(p)} percentile`,
    on: dayLabel(new Date(latest.at), now),
  };
}
