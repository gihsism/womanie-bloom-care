import { format } from 'date-fns';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import type { CycleDialData } from '@/lib/bodyMap';
import type { IconKey } from '@/lib/quickLog/tiles';

// The coloured header on Home (idea 4): a stage chip, ONE big status line
// ("Week 30 of 40", "Day 18 of 28"), one short sentence, and two small fact
// boxes. Pure: the page gathers the facts, this turns them into words.

export interface HeaderFacts {
  now?: Date;
  stageName: string;
  /** Pregnancy */
  dueDate?: Date | null;
  babySize?: string | null;
  kicksToday?: number;
  /** Period tracking / trying / before first period */
  cycle?: CycleDialData | null;
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
const ago = (min: number) => (min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min ` : ''}ago`);
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
      if (!f.dueDate) return m('Your pregnancy', 'Add your due date to see your week.', visit, logged);
      const week = Math.min(42, Math.max(0, Math.floor((now.getTime() - (f.dueDate.getTime() - 280 * DAY)) / (7 * DAY))));
      const left = Math.max(0, daysBetween(now, f.dueDate));
      const sentence = left > 0 ? `${left} day${left === 1 ? '' : 's'} to go · due ${format(f.dueDate, 'd MMM')}` : 'Due date reached · any day now';
      const second: Fact = week >= 28 ? { label: 'Kicks today', value: String(f.kicksToday ?? 0) }
        : f.babySize ? { label: 'Baby is about', value: f.babySize } : logged;
      return m(`Week ${week} of 40`, sentence, visit, second);
    }
    case 'menstrual-cycle':
    case 'conception':
    case 'pre-menstrual': {
      const c = f.cycle;
      if (!c) {
        return mode === 'pre-menstrual'
          ? m('No period yet', 'Tap Period when it starts.', visit, logged)
          : m('Log your period', 'Tap Period below when it starts.', visit, logged);
      }
      const sentence = c.phase === 'period' ? `Period day ${c.day}`
        : c.daysToPeriod <= 1 ? `Period likely ${inDays(c.daysToPeriod)}`
        : `Period in about ${c.daysToPeriod} days`;
      const fertile = c.daysToFertile === 0 ? (c.fertileEnd - c.day <= 0 ? 'Ends today' : 'Now')
        : c.daysToFertile != null ? (c.daysToFertile === 1 ? 'Tomorrow' : `In ${c.daysToFertile} days`) : 'Ended';
      const next: Fact = { label: 'Next period', value: `~${format(c.nextPeriod, 'EEE d MMM')}` };
      const win: Fact = { label: 'Fertile window', value: fertile };
      return m(`Day ${c.day} of ${c.length}`, sentence, mode === 'conception' ? win : next, mode === 'conception' ? next : (mode === 'pre-menstrual' ? visit : win));
    }
    case 'contraception': {
      const p = f.pill;
      if (!p || !p.isPill) return m('Your method', 'Log spotting or anything unusual.', visit, logged);
      const sentence = p.takenToday === 'taken' ? "Today's pill is taken"
        : p.takenToday === 'late' ? "Today's pill is taken, a little late"
        : p.takenToday === 'missed' ? "Today's pill is marked missed"
        : 'Not taken yet today';
      return m(p.packDay ? `Pill ${p.packDay} of 28` : 'Your pill', sentence,
        { label: 'Streak', value: `${p.streak} day${p.streak === 1 ? '' : 's'}` }, visit);
    }
    case 'ivf': {
      if (!f.ivf) return m('Your IVF cycle', 'Set your start date and phase.', visit, logged);
      const doses: Fact = f.doses && f.doses.total > 0
        ? { label: 'Doses today', value: `${f.doses.taken} of ${f.doses.total}` }
        : { label: 'Doses today', value: 'None set up' };
      return m(`${f.ivf.phase} · day ${f.ivf.day}`, f.ivf.next ? `Next: ${f.ivf.next}` : 'The last step of this cycle', doses, visit);
    }
    case 'postpartum': {
      const b = f.baby;
      if (!b) return m('After birth', 'Add your baby to log feeds and nappies.', visit, logged);
      const age = b.dayOfLife == null ? b.name : b.dayOfLife < 15 ? `${b.name} · day ${b.dayOfLife}` : `${b.name} · ${Math.floor((b.dayOfLife - 1) / 7)} weeks`;
      const sentence = b.lastFeedMin != null ? `Last feed ${ago(b.lastFeedMin)} · ${b.feedsToday} today` : 'No feeds logged yet today';
      return m(age, sentence, { label: 'Nappies today', value: `${b.wet} wet · ${b.dirty} dirty` }, { label: 'Sleep today', value: hm(b.sleepMin) });
    }
    case 'menopause':
    case 'post-menopause': {
      const t = f.hotFlushesToday ?? 0;
      const w = f.hotFlushes7 ?? 0;
      const big = t > 0 ? `${t} hot flush${t === 1 ? '' : 'es'} today` : w > 0 ? `${w} hot flush${w === 1 ? '' : 'es'} this week` : 'No hot flushes today';
      const months: Fact = { label: 'Since last period', value: f.monthsSincePeriod == null ? 'Not logged' : `${f.monthsSincePeriod} month${f.monthsSincePeriod === 1 ? '' : 's'}` };
      return m(big, 'Tap Hot flush each time one comes.', mode === 'menopause' ? months : { label: 'Hot flushes', value: `${w} this week` }, visit);
    }
    default:
      return m(chip, 'Tap a tile to log how you are.', visit, logged);
  }
}
