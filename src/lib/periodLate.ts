import { MAX_LATE_DAYS } from './todayItems';

// Home's "Period late?" helper card: shown when the period is several days
// past the predicted date (period tracking and trying to conceive). Pure,
// so the threshold and the wording are unit-tested.
//
// Wording rule: neutral and factual. Predictions are estimates, a home
// pregnancy test is one option if a pregnancy is possible, and "ask your
// doctor". Never a diagnosis and never a cause named as hers.
//
// LATE_HELP_FROM_DAYS: the Today row and the dial already say "Period N
// days late?" from day 1. The card adds the longer note only once the
// period is clearly later than the usual few days of variation. It stops
// at MAX_LATE_DAYS like the row: beyond that the log is likely just stale.

export const LATE_HELP_FROM_DAYS = 5;
const STAGES: readonly string[] = ['menstrual-cycle', 'conception'];

export interface PeriodLateHelp {
  lateBy: number;
  title: string;
  lines: string[];
}

export function periodLateHelp(mode: string | null | undefined, periodDaysUntil: number | null | undefined): PeriodLateHelp | null {
  if (!mode || !STAGES.includes(mode) || periodDaysUntil == null) return null;
  const lateBy = -periodDaysUntil;
  if (lateBy < LATE_HELP_FROM_DAYS || lateBy > MAX_LATE_DAYS) return null;
  return {
    lateBy,
    title: `Your period is ${lateBy} days later than predicted`,
    lines: [
      'Predictions are estimates. Cycles often shift by several days, for example with stress, illness, travel, or changes in sleep, exercise or weight.',
      'If you could be pregnant, a home pregnancy test is one way to find out. Tests are most reliable from the day your period was due; if the result is negative and your period still has not come, you can repeat it after a few days.',
      'Ask your doctor if your period stays away, if this keeps happening, or if you are unsure what a result means. With strong pain or heavy bleeding, get medical help straight away.',
    ],
  };
}

/** Device key: the period start she hid the card for (it comes back next cycle). */
export const periodLateHiddenKey = (userId: string) => `womanie_period_late_hidden_${userId}`;
