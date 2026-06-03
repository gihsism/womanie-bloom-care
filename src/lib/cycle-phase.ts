// Shared cycle-phase computation.
//
// Turns a short history of logged periods into a coarse, conservative
// description of where the user is in their cycle right now — used to
// ground the AI doctor's answers ("why am I so bloated this week?") in
// the actual phase rather than asking the user to repeat herself.
//
// Deliberately conservative: returns null whenever the prediction would
// be unreliable (no data, implausible cycle length, or the most recent
// period is so old that we'd have to roll the prediction forward past a
// full extra cycle — i.e. the user simply stopped logging). Sending a
// stale or invented phase to a medical assistant is worse than sending
// nothing.

export interface PeriodInput {
  period_start_date: string;
  cycle_length: number | null;
}

export type CyclePhase =
  | 'menstrual'
  | 'follicular'
  | 'ovulation'
  | 'luteal'
  | 'late-luteal';

export interface CyclePhaseResult {
  phase: CyclePhase;
  // Days until the next predicted period start (0 = predicted today).
  daysToNextPeriod: number;
  // Days since the last logged period start.
  daysSinceLastPeriod: number;
  cycleLength: number;
  // A one-line, human-readable summary safe to drop into a prompt.
  summary: string;
}

const MIN_VALID_CYCLE = 18;
const MAX_VALID_CYCLE = 60;
const PMS_WINDOW_LEN = 5;
const MENSTRUAL_LEN = 5;

const PHASE_NOTE: Record<CyclePhase, string> = {
  menstrual: 'menstrual phase',
  follicular: 'follicular phase',
  ovulation: 'ovulation window',
  luteal: 'luteal phase',
  'late-luteal': 'late-luteal / PMS window',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compute the current cycle phase from a list of recent periods.
 * `now` is injectable for testing/determinism; defaults to the caller's
 * supplied value (callers pass Date.now()-derived values).
 *
 * Returns null when no reliable prediction can be made.
 */
export function computeCyclePhase(
  periods: PeriodInput[],
  nowMs: number,
): CyclePhaseResult | null {
  if (!periods || periods.length === 0) return null;

  const sorted = [...periods].sort(
    (a, b) => Date.parse(b.period_start_date) - Date.parse(a.period_start_date),
  );
  const lastStartMs = Date.parse(sorted[0].period_start_date);
  if (Number.isNaN(lastStartMs)) return null;

  const cycleLength = sorted[0].cycle_length ?? 28;
  if (cycleLength < MIN_VALID_CYCLE || cycleLength > MAX_VALID_CYCLE) return null;

  const daysSinceLastPeriod = Math.floor((nowMs - lastStartMs) / DAY_MS);
  // Future-dated or absurd input → bail.
  if (daysSinceLastPeriod < 0) return null;
  // If the user stopped logging more than a full cycle + grace ago, any
  // prediction would be fabricated. Stay silent.
  if (daysSinceLastPeriod > cycleLength + 7) return null;

  // Days into the current cycle, and days until the next predicted start.
  const cycleDay = daysSinceLastPeriod % cycleLength;
  const daysToNextPeriod = cycleLength - cycleDay;

  const ovulationDay = cycleLength - 14; // luteal phase is ~14 days

  let phase: CyclePhase;
  if (cycleDay < MENSTRUAL_LEN) {
    phase = 'menstrual';
  } else if (daysToNextPeriod <= PMS_WINDOW_LEN) {
    phase = 'late-luteal';
  } else if (cycleDay >= ovulationDay - 1 && cycleDay <= ovulationDay + 1) {
    phase = 'ovulation';
  } else if (cycleDay < ovulationDay) {
    phase = 'follicular';
  } else {
    phase = 'luteal';
  }

  const summary =
    phase === 'menstrual'
      ? `Currently menstruating (cycle day ${cycleDay + 1}, ~${cycleLength}-day cycle)`
      : `Cycle day ${cycleDay + 1} of ~${cycleLength}, ${PHASE_NOTE[phase]}, next period predicted in ~${daysToNextPeriod} day${daysToNextPeriod === 1 ? '' : 's'}`;

  return { phase, daysToNextPeriod, daysSinceLastPeriod, cycleLength, summary };
}
