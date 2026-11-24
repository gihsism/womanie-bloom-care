import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { STAGE_PAGE, type Target } from '@/lib/todayItems';

// Home's one-tap tiles (idea 4): 3 per row, one or two words each. Tapping
// LOGS straight away (the same rows the Log sheet and the stage trackers
// write); holding a tile, or its "…", opens `details`. Only kinds of entry
// the app already stores — nothing here needs a new column or table:
//   daily_health_signals  symptoms / mood / notes segments (Flow, Pill,
//                         Hot flashes, Intercourse) — as DailyLogging
//   period_tracking       a new period start — as CycleCalendar
//   life_events           kick taps (session), contraction, feed, nappy,
//                         baby sleep, medicine dose — as the trackers

export type IconKey =
  | 'drop' | 'spot' | 'cramp' | 'head' | 'moodlow' | 'heart' | 'note' | 'foot' | 'wave' | 'nausea'
  | 'back' | 'scale' | 'bottle' | 'dirty' | 'wet' | 'moon' | 'pill' | 'pillx' | 'flame' | 'joint'
  | 'tired' | 'breastL' | 'breastR' | 'syringe' | 'plus' | 'acne' | 'bloat' | 'lh' | 'anxious' | 'cal' | 'steth' | 'flask';

export type TimerKind = 'contraction' | 'feed_l' | 'feed_r' | 'baby_sleep';

export type TileAction =
  | { kind: 'symptom'; value: string }
  | { kind: 'mood'; value: string }
  | { kind: 'flow'; value: 'spotting' }
  | { kind: 'period' }
  | { kind: 'pill'; value: 'on-time' | 'missed' }
  | { kind: 'hotflush' }
  | { kind: 'choice'; label: string; segment: string; options: { label: string; value: string }[] }
  | { kind: 'kick' }
  | { kind: 'timer'; timer: TimerKind }
  | { kind: 'nappy'; value: 'wet' | 'dirty' }
  | { kind: 'bottle' }
  | { kind: 'dose'; medicationId: string; name: string; dose: string | null; perDay: number }
  | { kind: 'open'; target: Target };

export interface Tile {
  id: string;
  label: string;
  icon: IconKey;
  action: TileAction;
  /** Where "hold" / "…" goes: the full form for this kind of entry. */
  details: Target;
}

export interface TileContext {
  weeksPregnant?: number | null;
  /** Contraception: the method is a daily pill (default true). */
  dailyPill?: boolean;
  /** IVF and any stage: the active medicines, for the dose checklist. */
  meds?: { id: string; name: string; dose: string | null; times_per_day: number | null }[];
  /** After birth: a baby is set up (feeds, nappies and sleep need one). */
  hasBaby?: boolean;
}

export const MAX_TILES = 6;
const LOG: Target = 'sheet:log';

const sym = (id: string, label: string, icon: IconKey, value = label): Tile =>
  ({ id, label, icon, action: { kind: 'symptom', value }, details: LOG });
const mood = (id: string, label: string, icon: IconKey, value: string): Tile =>
  ({ id, label, icon, action: { kind: 'mood', value }, details: LOG });

const NOTE: Tile = { id: 'note', label: 'Note', icon: 'note', action: { kind: 'open', target: LOG }, details: LOG };
const SPOTTING: Tile = { id: 'spotting', label: 'Spotting', icon: 'spot', action: { kind: 'flow', value: 'spotting' }, details: LOG };
const PERIOD: Tile = { id: 'period', label: 'Period', icon: 'drop', action: { kind: 'period' }, details: `${STAGE_PAGE}#cycle-calendar` };
const CRAMPS = sym('cramps', 'Cramps', 'cramp');
const HEADACHE = sym('headache', 'Headache', 'head');
const LOW_MOOD = mood('low-mood', 'Low mood', 'moodlow', 'sad');
const SEX: Tile = {
  id: 'sex', label: 'Sex', icon: 'heart', details: LOG,
  action: { kind: 'choice', label: 'Sex', segment: 'Intercourse', options: [
    { label: 'Protected', value: 'yes-protected' },
    { label: 'Not protected', value: 'yes-unprotected' },
  ] },
};

export function tilesFor(mode: LifeStage, ctx: TileContext = {}): Tile[] {
  const tiles = ((): Tile[] => {
    switch (mode) {
      case 'menstrual-cycle':
        return [PERIOD, SPOTTING, CRAMPS, HEADACHE, LOW_MOOD, SEX];
      case 'conception':
        return [
          PERIOD,
          {
            id: 'lh', label: 'LH test', icon: 'lh', details: LOG,
            action: { kind: 'choice', label: 'LH test', segment: 'LH test', options: [
              { label: 'Positive', value: 'positive' },
              { label: 'Negative', value: 'negative' },
            ] },
          },
          SEX, SPOTTING, CRAMPS, NOTE,
        ];
      case 'pre-menstrual':
        return [PERIOD, SPOTTING, CRAMPS, sym('acne', 'Acne', 'acne'), LOW_MOOD, NOTE];
      case 'contraception':
        return ctx.dailyPill === false
          ? [SPOTTING, CRAMPS, HEADACHE, LOW_MOOD, SEX, NOTE]
          : [
              { id: 'pill', label: 'Pill taken', icon: 'pill', action: { kind: 'pill', value: 'on-time' }, details: `${STAGE_PAGE}#contraception` },
              { id: 'pill-missed', label: 'Missed pill', icon: 'pillx', action: { kind: 'pill', value: 'missed' }, details: `${STAGE_PAGE}#contraception` },
              SPOTTING, HEADACHE, LOW_MOOD, SEX,
            ];
      case 'ivf': {
        const doses: Tile[] = (ctx.meds ?? []).slice(0, 3).map(m => ({
          id: `dose-${m.id}`, label: m.name, icon: 'syringe' as IconKey, details: 'sheet:medicines',
          action: { kind: 'dose', medicationId: m.id, name: m.name, dose: m.dose, perDay: Math.max(1, m.times_per_day ?? 1) },
        }));
        const add: Tile = { id: 'add-med', label: 'Add medicine', icon: 'plus', action: { kind: 'open', target: 'sheet:medicines' }, details: 'sheet:medicines' };
        return [...doses, ...(doses.length ? [] : [add]), sym('bloating', 'Bloating', 'bloat'), LOW_MOOD, NOTE, CRAMPS];
      }
      case 'pregnancy': {
        const late = (ctx.weeksPregnant ?? 0) >= 28;
        const weight: Tile = { id: 'weight', label: 'Weight', icon: 'scale', action: { kind: 'open', target: `${STAGE_PAGE}#weight` }, details: `${STAGE_PAGE}#weight` };
        return late
          ? [
              { id: 'kick', label: 'Kick', icon: 'foot', action: { kind: 'kick' }, details: `${STAGE_PAGE}#kick-counter` },
              { id: 'contraction', label: 'Contraction', icon: 'wave', action: { kind: 'timer', timer: 'contraction' }, details: `${STAGE_PAGE}#contraction-timer` },
              sym('nausea', 'Nausea', 'nausea'), sym('back-pain', 'Back pain', 'back'), weight, NOTE,
            ]
          : [sym('nausea', 'Nausea', 'nausea'), sym('back-pain', 'Back pain', 'back'), sym('tired', 'Tired', 'tired', 'Fatigue'), LOW_MOOD, weight, NOTE];
      }
      case 'postpartum': {
        if (!ctx.hasBaby) {
          return [
            { id: 'add-baby', label: 'Add baby', icon: 'plus', action: { kind: 'open', target: '/dashboard/baby?tab=feed&add=1' }, details: '/dashboard/baby' },
            LOW_MOOD, sym('tired', 'Tired', 'tired', 'Fatigue'), NOTE,
          ];
        }
        const baby = (tab: string): Target => `/dashboard/baby?tab=${tab}`;
        return [
          { id: 'feed-l', label: 'Left', icon: 'breastL', action: { kind: 'timer', timer: 'feed_l' }, details: baby('feed') },
          { id: 'feed-r', label: 'Right', icon: 'breastR', action: { kind: 'timer', timer: 'feed_r' }, details: baby('feed') },
          { id: 'bottle', label: 'Bottle', icon: 'bottle', action: { kind: 'bottle' }, details: `${baby('feed')}&add=1` },
          { id: 'wet', label: 'Wet', icon: 'wet', action: { kind: 'nappy', value: 'wet' }, details: baby('nappy') },
          { id: 'dirty', label: 'Dirty', icon: 'dirty', action: { kind: 'nappy', value: 'dirty' }, details: baby('nappy') },
          { id: 'sleep', label: 'Sleep', icon: 'moon', action: { kind: 'timer', timer: 'baby_sleep' }, details: baby('sleep') },
        ];
      }
      case 'menopause':
      case 'post-menopause':
        return [
          { id: 'hot-flush', label: 'Hot flush', icon: 'flame', action: { kind: 'hotflush' }, details: LOG },
          sym('bad-sleep', 'Bad sleep', 'moon', 'Insomnia'),
          LOW_MOOD,
          sym('joint-pain', 'Joint pain', 'joint'),
          sym('anxious', 'Anxious', 'anxious', 'Anxiety'),
          NOTE,
        ];
      default:
        return [SPOTTING, CRAMPS, HEADACHE, LOW_MOOD, NOTE];
    }
  })();
  return tiles.slice(0, MAX_TILES);
}

/** Toast and Today-row wording for a tile ("Kick logged", "Cramps"). */
export function loggedWord(tile: Tile, choice?: string): string {
  switch (tile.action.kind) {
    case 'period': return 'Period started';
    case 'flow': return 'Spotting';
    case 'pill': return tile.action.value === 'missed' ? 'Missed pill' : 'Pill taken';
    case 'mood': return tile.label;
    case 'choice': return choice ? `${tile.action.label}: ${choice.toLowerCase()}` : tile.action.label;
    case 'dose': return tile.action.name;
    case 'nappy': return `${tile.label} nappy`;
    case 'bottle': return 'Bottle feed';
    default: return tile.label;
  }
}
