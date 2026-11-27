// Menopause stages: "Symptom diary, last 4 weeks" for the visit prep sheet.
// Week-by-week counts of what she logged (hot flushes, sleep, mood) and
// one neutral sentence. Reads the same daily_health_signals rows and the
// same parser as "Your symptoms over time" (menopauseInsights.ts), so the
// two never disagree. Pure, unit-tested.
//
// Wording rule: counts only. No trend words, no verdicts.

import { parseDayRow, shortDate, type Day, type SignalInput } from './menopauseInsights';
import { daysBetween, parseDay } from './visitSummary';

export const DIARY_WEEKS = 4;

export interface DiaryWeek {
  /** First and last calendar day of the week (the list is oldest week first). */
  from: Date;
  to: Date;
  daysLogged: number;
  /** Days with hot flushes (the tag, or a count above 0). */
  hotFlushDays: number;
  /** Sum of the hot flushes she counted; null when no day that week has a number. */
  hotFlushCount: number | null;
  /** Nights marked as poor sleep (quality 1-2/5 or the insomnia tag). */
  poorSleepNights: number;
  /** Mean hours on the nights she typed hours; null when none. */
  sleepHours: number | null;
  lowMoodDays: number;
}

export interface SymptomDiary {
  weeks: DiaryWeek[];
  daysLogged: number;
  totalDays: number;
  /** Any hot-flush number / sleep hours in the window: show those rows. */
  hasHotCounts: boolean;
  hasSleepHours: boolean;
  sentence: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mean1 = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;

/** "29 Oct – 4 Nov". */
export const weekLabel = (w: Pick<DiaryWeek, 'from' | 'to'>) => `${shortDate(w.from)} – ${shortDate(w.to)}`;

export function symptomDiary(signals: SignalInput[], now = new Date(), weeks = DIARY_WEEKS): SymptomDiary {
  const totalDays = weeks * 7;
  // One entry per calendar day (the last row wins), as in menopauseInsights.
  const byAgo = new Map<number, Day>();
  for (const r of signals) {
    const d = parseDay(r?.signal_date);
    if (!d) continue;
    const ago = daysBetween(d, now);
    if (ago < 0 || ago >= totalDays) continue;
    byAgo.set(ago, parseDayRow(r, ago));
  }
  const days = [...byAgo.values()].filter(d => d.logged);

  const out: DiaryWeek[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const inWeek = days.filter(d => Math.floor(d.ago / 7) === w);
    const counts = inWeek.map(d => d.hotCount).filter((v): v is number => v != null);
    const hours = inWeek.map(d => d.sleepHours).filter((v): v is number => v != null);
    out.push({
      from: addDays(now, -(w * 7 + 6)),
      to: addDays(now, -(w * 7)),
      daysLogged: inWeek.length,
      hotFlushDays: inWeek.filter(d => d.hotTag || (d.hotCount ?? 0) > 0).length,
      hotFlushCount: counts.length ? counts.reduce((a, b) => a + b, 0) : null,
      poorSleepNights: inWeek.filter(d => d.poorSleep).length,
      sleepHours: hours.length ? mean1(hours) : null,
      lowMoodDays: inWeek.filter(d => d.lowMood).length,
    });
  }

  const sum = (f: (w: DiaryWeek) => number) => out.reduce((a, w) => a + f(w), 0);
  const daysLogged = days.length;
  const hasHotCounts = out.some(w => w.hotFlushCount != null);
  const hasSleepHours = out.some(w => w.sleepHours != null);

  let sentence: string;
  if (daysLogged === 0) {
    sentence = `Nothing logged in the last ${weeks} weeks.`;
  } else {
    const hotCount = sum(w => w.hotFlushCount ?? 0);
    const parts = [
      `hot flushes on ${plural(sum(w => w.hotFlushDays), 'day', 'days')}${hasHotCounts ? ` (${plural(hotCount, 'hot flush', 'hot flushes')} counted)` : ''}`,
      `poor sleep on ${plural(sum(w => w.poorSleepNights), 'night', 'nights')}`,
      `low mood on ${plural(sum(w => w.lowMoodDays), 'day', 'days')}`,
    ];
    if (hasSleepHours) {
      const hrs = days.map(d => d.sleepHours).filter((v): v is number => v != null);
      parts.push(`an average of ${mean1(hrs)} hours of sleep on the ${plural(hrs.length, 'night', 'nights')} with hours logged`);
    }
    const last = parts.pop();
    sentence = `Logged on ${daysLogged} of the last ${totalDays} days. In that time: ${parts.join(', ')} and ${last}.`;
  }
  return { weeks: out, daysLogged, totalDays, hasHotCounts, hasSleepHours, sentence };
}
