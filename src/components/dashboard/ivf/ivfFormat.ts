import { WEEKDAY_DAY_MONTH_FMT } from '@/lib/dateFormat';
import { format } from 'date-fns';
import { DEFAULT_IVF_TZ, isValidTimeZone } from '@/lib/ivfJourney';

/** The device's timezone (Europe/Zurich when the browser does not say). */
export function deviceTz(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : DEFAULT_IVF_TZ;
  } catch { return DEFAULT_IVF_TZ; }
}

/** 'YYYY-MM-DD' -> "Thu 20 Nov" (read as a local calendar day). */
export function fmtDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return format(new Date(y, m - 1, d), WEEKDAY_DAY_MONTH_FMT);
}

/** A trigger instant as "Thu 20 Nov, 21:30" in a timezone. */
export function fmtMoment(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}, ${get('hour')}:${get('minute')}`;
}

export function fmtClock(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
}

export function inDays(n: number): string {
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
}
