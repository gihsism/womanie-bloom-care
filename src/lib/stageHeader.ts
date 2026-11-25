import { postMenopauseBleed } from './bodyMap';

/** Header-length version of POST_MENOPAUSE_BLEED_TEXT (bodyMap.ts). */
export const POST_MENOPAUSE_BLEED_SHORT = 'Bleeding after menopause: see your doctor.';
import { format } from 'date-fns';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import type { CycleDialData } from '@/lib/bodyMap';
import type { IconKey } from '@/lib/quickLog/tiles';

// The coloured header on Home (idea 4, round 6): a stage chip, ONE big
// fact ("Week 30", "Day 18", "Period in 3 days") and one short sentence.
// `facts` (two small label/value pairs) stay in the model for other views;
// Home no longer shows them. Pure: the page gathers the facts, this turns
// them into words.

export interface HeaderFacts {
  now?: Date;
  stageName: string;
  /** Pregnancy */
  dueDate?: Date | null;
  babySize?: string | null;
  kicksToday?: number;
  /** Period tracking / trying / before first period */
  cycle?: CycleDialData | null;
  /** Start of the last period she actually logged (null = none logged). */
  cycleStart?: Date | null;
  /** The most recent symptom she logged (any day), for stages without a cycle yet. */
  lastSymptom?: { name: string; date: Date } | null;
  /** The next visit (today's first, else the next one booked). */
  nextVisit?: Date | null;
  /** Contraception */
  pill?: { isPill: boolean; packDay: number | null; streak: number; takenToday: 'taken' | 'late' | 'missed' | null } | null;
  /** IVF */
  ivf?: { phase: string; next: string | null; day: number } | null;
  doses?: { taken: number; total: number } | null;
  /** After birth */
  baby?: { name: string; dayOfLife: number | null; lastFeedMin: number | null; feedsToday: number; wet: number; dirty: number; sleepMin: number } | null;
  /** Menopause and after */
  hotFlushesToday?: number;
  hotFlushes7?: number;
  monthsSincePeriod?: number | null;
  /** Anything logged today (all stages), for the fallback fact. */
  loggedToday?: number;
}

export interface Fact { label: string; value: string }
export interface HeaderModel {
  chip: string;
  chipIcon: IconKey;
  big: string;
  sentence: string;
  facts: [Fact, Fact];
}

const CHIP_ICON: Record<LifeStage, IconKey> = {
  'pre-menstrual': 'drop', 'menstrual-cycle': 'drop', contraception: 'pill', conception: 'drop', ivf: 'syringe',
  pregnancy: 'heart', postpartum: 'heart', menopause: 'flame', 'post-menopause': 'moon',
};

const DAY = 86_400_000;
const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysBetween = (a: Date, b: Date) => Math.round((startOf(b) - startOf(a)) / DAY);

export function visitValue(v: Date | null | undefined, now: Date): string {
  if (!v) return 'None booked';
  const n = daysBetween(now, v);
  if (n === 0) return `Today ${format(v, 'HH:mm')}`;
  if (n === 1) return `Tomorrow ${format(v, 'HH:mm')}`;
  if (n > 1 && n < 7) return format(v, 'EEE HH:mm');
  return format(v, 'EEE d MMM');
}

const inDays = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
export const ago = (min: number) => {
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min ` : ''}ago`;
  const d = Math.floor(min / (24 * 60));
  return d === 1 ? 'yesterday' : `${d} days ago`;
};
const shortName = (s: string) => (s.length <= 16 ? s : `${s.slice(0, 15).trimEnd()}…`);
const hm = (min: number) => { const h = Math.floor(min / 60); const m = Math.round(min % 60); return h ? `${h}h ${m}m` : `${m}m`; };

export function headerFor(mode: LifeStage, f: HeaderFacts): HeaderModel {
  const now = f.now ?? new Date();
  const chip = f.stageName;
  const chipIcon = CHIP_ICON[mode] ?? 'drop';
  const visit: Fact = { label: 'Next visit', value: visitValue(f.nextVisit, now) };
  const logged: Fact = { label: 'Logged today', value: String(f.loggedToday ?? 0) };
  const m = (big: string, sentence: string, a: Fact, b: Fact): HeaderModel => ({ chip, chipIcon, big, sentence, facts: [a, b] });

  switch (mode) {
    case 'pregnancy': {
      if (!f.dueDate) return m('Your pregnancy', 'Add your due date in Me to see your week.', visit, logged);
      const daysLeft = daysBetween(now, f.dueDate);
      // A due date more than 40 weeks away, or long past, is a typo or an
      // old pregnancy: never show "Week 0" or "Week 42 of 40".
      if (daysLeft > 280) return m('Your pregnancy', 'Check your due date in Me.', visit, logged);
      if (daysLeft < -14) return m('Is your baby here?', 'Switch to After birth in Me.', visit, logged);
      const week = Math.min(42, Math.max(0, Math.floor((now.getTime() - (f.dueDate.getTime() - 280 * DAY)) / (7 * DAY))));
      const left = Math.max(0, daysBetween(now, f.dueDate));
      const sentence = left > 0 ? `${left} day${left === 1 ? '' : 's'} to go · due ${format(f.dueDate, 'd MMM')}` : 'Due date reached · any day now';
      const second: Fact = week >= 28 ? { label: 'Kicks today', value: String(f.kicksToday ?? 0) }
        : f.babySize ? { label: 'Baby is about', value: f.babySize } : logged;
      return m(`Week ${week}`, sentence, visit, second);
    }
    case 'menstrual-cycle':
    case 'conception':
    case 'pre-menstrual': {
      // Before a first period nothing is predicted until she has logged one.
      const c = mode === 'pre-menstrual' && !f.cycleStart ? null : f.cycle;
      if (!c) {
        if (mode === 'pre-menstrual') {
          const s = f.lastSymptom;
          const last: Fact = s ? { label: 'Last symptom', value: shortName(s.name) } : logged;
          return m('No period yet', 'Log your first period when it comes.', last, visit);
        }
        return m('Log your period', 'Tap Log today when it starts.', visit, logged);
      }
      // A period well past its expected day: count on instead of wrapping
      // round to a new "Day 3 of 28" nobody logged.
      const elapsed = f.cycleStart ? daysBetween(f.cycleStart, now) : null;
      if (elapsed != null && elapsed >= c.length) {
        const late = elapsed - c.length + 1;
        const lastFact: Fact = { label: 'Last period', value: format(f.cycleStart!, 'd MMM') };
        if (late > 60) return m('Log your period', `Last one logged ${elapsed} days ago`, lastFact, visit);
        return m(`Day ${elapsed + 1}`, `Period ${late} day${late === 1 ? '' : 's'} late`, lastFact, visit);
      }
      const fertile = c.daysToFertile === 0 ? (c.fertileEnd - c.day <= 0 ? 'Ends today' : 'Now')
        : c.daysToFertile != null ? (c.daysToFertile === 1 ? 'Tomorrow' : `In ${c.daysToFertile} days`) : 'Ended';
      const next: Fact = { label: 'Next period', value: `~${format(c.nextPeriod, 'EEE d MMM')}` };
      const win: Fact = { label: 'Fertile window', value: fertile };
      const a = mode === 'conception' ? win : next;
      const b = mode === 'conception' ? next : (mode === 'pre-menstrual' ? visit : win);
      const ofLen = `Day ${c.day} of ${c.length}`;
      // ONE big fact: the period while it's on, the period when it's close,
      // the fertile window when trying, otherwise the cycle day.
      if (c.phase === 'period') return m(`Period day ${c.day}`, `Usually lasts about ${c.periodDays} days`, a, b);
      if (mode === 'conception' && c.daysToFertile === 0) return m('Fertile today', `${ofLen} · a good day to try`, a, b);
      if (c.daysToPeriod <= 7) {
        const big = c.daysToPeriod <= 0 ? 'Period today' : c.daysToPeriod === 1 ? 'Period tomorrow' : `Period in ${c.daysToPeriod} days`;
        return m(big, c.daysToPeriod <= 1 ? `${ofLen} · likely, not certain` : ofLen, a, b);
      }
      if (mode === 'conception' && c.daysToFertile != null) {
        return m(`Day ${c.day}`, `Fertile window ${inDays(c.daysToFertile)}`, a, b);
      }
      return m(`Day ${c.day}`, `Period in about ${c.daysToPeriod} days`, a, b);
    }
    case 'contraception': {
      const p = f.pill;
      if (!p || !p.isPill) return m('Your method', 'Log spotting or anything unusual.', visit, logged);
      const sentence = p.takenToday === 'taken' ? "Today's pill is taken"
        : p.takenToday === 'late' ? "Taken today, a little late"
        : p.takenToday === 'missed' ? "Today's pill is marked missed"
        : 'Not taken yet today';
      return m(p.packDay ? `Pack day ${p.packDay}` : 'Your pill', sentence,
        { label: 'Streak', value: `${p.streak} day${p.streak === 1 ? '' : 's'}` }, visit);
    }
    case 'ivf': {
      if (!f.ivf) return m('Your IVF cycle', 'Set your start date and phase.', visit, logged);
      if (f.ivf.day < 1) return m('Your IVF cycle', `Starts ${inDays(1 - f.ivf.day)}`, visit, logged);
      if (f.ivf.day > 90) return m('Your IVF cycle', 'Set the start of your new cycle.', visit, logged);
      const doses: Fact = f.doses && f.doses.total > 0
        ? { label: 'Doses today', value: `${f.doses.taken} of ${f.doses.total}` }
        : { label: 'Doses today', value: 'None set up' };
      return m(`Day ${f.ivf.day}`, f.ivf.next ? `${f.ivf.phase} · next: ${f.ivf.next}` : `${f.ivf.phase} · the last step`, doses, visit);
    }
    case 'postpartum': {
      const b = f.baby;
      if (!b) return m('After birth', 'Add your baby to log feeds and nappies.', visit, logged);
      const unborn = b.dayOfLife == null || b.dayOfLife < 1;
      const age = unborn ? b.name : b.dayOfLife! < 15 ? `Day ${b.dayOfLife}` : `${Math.floor((b.dayOfLife! - 1) / 7)} weeks`;
      const who = unborn ? '' : `${shortName(b.name)} · `;
      const cap = (t: string) => (who ? `${who}${t}` : t.charAt(0).toUpperCase() + t.slice(1));
      const sentence = cap(b.lastFeedMin != null ? `last feed ${ago(b.lastFeedMin)}` : 'no feeds logged yet');
      return m(age, sentence, { label: 'Nappies today', value: `${b.wet} wet · ${b.dirty} dirty` }, { label: 'Sleep today', value: hm(b.sleepMin) });
    }
    case 'menopause':
    case 'post-menopause': {
      const t = f.hotFlushesToday ?? 0;
      const w = f.hotFlushes7 ?? 0;
      const big = t > 0 ? `${t} hot flush${t === 1 ? '' : 'es'}` : 'No hot flushes';
      const months: Fact = { label: 'Since last period', value: f.monthsSincePeriod == null ? 'Not logged' : `${f.monthsSincePeriod} month${f.monthsSincePeriod === 1 ? '' : 's'}` };
      // A period logged within 12 months after menopause is a bleed worth a doctor's look.
      const sentence = postMenopauseBleed(mode, f.monthsSincePeriod ?? null) ? POST_MENOPAUSE_BLEED_SHORT
        : w > 0 ? `Today · ${w} this week` : 'Today · log each one as it comes';
      return m(big, sentence, mode === 'menopause' ? months : { label: 'Hot flushes', value: `${w} this week` }, visit);
    }
    default:
      return m(chip, 'Tap Log today to note how you are.', visit, logged);
  }
}
