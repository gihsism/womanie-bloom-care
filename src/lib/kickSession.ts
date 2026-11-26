// Kick-count session logic (pure, unit-tested).
//
// Guidance:
// - NHS ("Your baby's movements") and RCOG (Green-top Guideline 57,
//   "Reduced fetal movements"; Tommy's/RCOG patient info): there is no set
//   number of movements that is "normal"; get to know your baby's own
//   pattern from about 24 weeks. If movements slow down, stop, or change,
//   contact your midwife or maternity unit STRAIGHT AWAY, day or night.
//   Do not wait until the next day, do not use a home Doppler, and do not
//   rely on counting to reassure yourself.
// - ACOG: one common method is the time taken to feel 10 movements;
//   10 within 2 hours is the usual reference.
// So the app records "count to 10 and the time it took" to help her see
// her baby's pattern, but the app never reassures and never says
// "wait and see": any concern points to the maternity unit now.

export interface KickSession {
  id: string;
  startedAt: number; // epoch ms
  endedAt: number | null;
  count: number;
  taps: number[];
}

export const TARGET_KICKS = 10;
export const REFERENCE_MS = 2 * 60 * 60 * 1000; // ACOG 10-in-2-hours reference
// Taps closer together than this are one movement (a double tap or a
// single roll felt twice).
export const DEBOUNCE_MS = 1500;
// Slower than her usual: more than double her typical time, with at least
// this many earlier completed sessions to compare against.
export const MIN_HISTORY_FOR_USUAL = 3;
export const SLOWER_FACTOR = 2;

export function startSession(now: number, id: string): KickSession {
  return { id, startedAt: now, endedAt: null, count: 0, taps: [] };
}

export interface TapResult {
  session: KickSession;
  /** True when this tap reached the target and closed the session. */
  completed: boolean;
  /** True when the tap was ignored as a double tap. */
  ignored: boolean;
}

export function tapKick(session: KickSession, now: number): TapResult {
  if (session.endedAt !== null) return { session, completed: false, ignored: true };
  const lastTap = session.taps[session.taps.length - 1];
  if (lastTap !== undefined && now - lastTap < DEBOUNCE_MS) {
    return { session, completed: false, ignored: true };
  }
  const count = session.count + 1;
  const completed = count >= TARGET_KICKS;
  return {
    session: { ...session, count, taps: [...session.taps, now], endedAt: completed ? now : null },
    completed,
    ignored: false,
  };
}

/** Undo the last tap (an accidental one). */
export function undoTap(session: KickSession): KickSession {
  if (session.endedAt !== null || session.count === 0) return session;
  return { ...session, count: session.count - 1, taps: session.taps.slice(0, -1) };
}

export function finishSession(session: KickSession, now: number): KickSession {
  return session.endedAt !== null ? session : { ...session, endedAt: now };
}

/** Time to the 10th movement, or null if the target was not reached. */
export function timeToTarget(s: KickSession): number | null {
  if (s.count < TARGET_KICKS) return null;
  const tenth = s.taps[TARGET_KICKS - 1] ?? s.endedAt;
  return tenth === null || tenth === undefined ? null : tenth - s.startedAt;
}

/** Her typical time to 10 (median of earlier completed sessions), or null. */
export function usualTimeToTarget(history: KickSession[]): number | null {
  const times = history.map(timeToTarget).filter((t): t is number => t !== null).sort((a, b) => a - b);
  if (times.length < MIN_HISTORY_FOR_USUAL) return null;
  const mid = Math.floor(times.length / 2);
  return times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
}

export type KickConcern = 'none' | 'over_reference' | 'slower_than_usual' | 'stopped_short';

/**
 * Whether a session should show the "contact your maternity unit straight
 * away" banner. Not a diagnosis: only a prompt to call.
 * - over_reference: 2 hours passed without 10 movements (live or saved).
 * - slower_than_usual: reached 10, but took more than twice her usual time.
 * - stopped_short: she stopped and saved before 10.
 */
export function kickConcern(s: KickSession, now: number, history: KickSession[] = []): KickConcern {
  const end = s.endedAt ?? now;
  if (s.count < TARGET_KICKS) {
    if (end - s.startedAt > REFERENCE_MS) return 'over_reference';
    if (s.endedAt !== null && s.count > 0) return 'stopped_short';
    return 'none';
  }
  const t = timeToTarget(s);
  if (t !== null && t > REFERENCE_MS) return 'over_reference';
  const usual = usualTimeToTarget(history.filter(h => h.id !== s.id && h.startedAt !== s.startedAt));
  if (t !== null && usual !== null && t > usual * SLOWER_FACTOR) return 'slower_than_usual';
  return 'none';
}
