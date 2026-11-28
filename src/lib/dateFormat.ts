// One way to write a date for her, everywhere: day, month, year
// ("3 Dec 2026"). Before this, prep sheets, summaries, print pages and
// cards mixed "December 3, 2026", "Dec 3, 2026", "12/3/2026" and
// "15 Jan 2025" depending on the screen and the phone's language.
//
// Use the helpers for plain dates, or the patterns with date-fns
// `format()` when a time or weekday is added around them. Machine dates
// ('yyyy-MM-dd' for the database) are not covered here.

import { format, isValid, parseISO } from 'date-fns';

/** date-fns pattern: "3 Dec 2026". */
export const DATE_FMT = 'd MMM yyyy';
/** date-fns pattern: "3 Dec" (when the year is obvious). */
export const DAY_MONTH_FMT = 'd MMM';
/** date-fns pattern: "Thu 3 Dec". */
export const WEEKDAY_DAY_MONTH_FMT = 'EEE d MMM';
/** date-fns pattern: "3 Dec 2026, 09:00". */
export const DATE_TIME_FMT = 'd MMM yyyy, HH:mm';

type DateInput = Date | string | number | null | undefined;

/** A Date, an ISO string (a bare 'yyyy-MM-dd' is read as a LOCAL day) or a timestamp. */
function toDate(d: DateInput): Date | null {
  if (d === null || d === undefined || d === '') return null;
  const out = d instanceof Date ? d : typeof d === 'string' ? parseISO(d) : new Date(d);
  return isValid(out) ? out : null;
}

function fmt(d: DateInput, pattern: string): string {
  const date = toDate(d);
  return date ? format(date, pattern) : '';
}

/** "3 Dec 2026" ('' for a missing or unreadable date). */
export const formatDate = (d: DateInput) => fmt(d, DATE_FMT);
/** "3 Dec". */
export const formatDayMonth = (d: DateInput) => fmt(d, DAY_MONTH_FMT);
/** "Thu 3 Dec". */
export const formatWeekdayDayMonth = (d: DateInput) => fmt(d, WEEKDAY_DAY_MONTH_FMT);
/** "3 Dec 2026, 09:00". */
export const formatDateTime = (d: DateInput) => fmt(d, DATE_TIME_FMT);

/** A short day range: "18-22 Jan", or "27 Jan-2 Feb" across a month. */
export function formatDayRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  return `${format(start, sameMonth ? 'd' : DAY_MONTH_FMT)}-${format(end, DAY_MONTH_FMT)}`;
}
