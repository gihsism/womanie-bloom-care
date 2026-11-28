// One way to write a clock time for her, everywhere: 24-hour "HH:mm"
// ("14:30"). Before this, visit cards, the doctor's day and print pages
// said "2:30 PM" or followed the phone's language ('p',
// toLocaleTimeString). Goes with src/lib/dateFormat.ts.

import { format, isValid, parseISO } from 'date-fns';

/** date-fns pattern: "14:30". */
export const TIME_FMT = 'HH:mm';
/** date-fns pattern: "14:30:05" (contraction timer). */
export const TIME_SECONDS_FMT = 'HH:mm:ss';

type TimeInput = Date | string | number | null | undefined;

function toDate(d: TimeInput): Date | null {
  if (d === null || d === undefined || d === '') return null;
  const out = d instanceof Date ? d : typeof d === 'string' ? parseISO(d) : new Date(d);
  return isValid(out) ? out : null;
}

/** "14:30" ('' for a missing or unreadable time). */
export function formatTime(d: TimeInput): string {
  const date = toDate(d);
  return date ? format(date, TIME_FMT) : '';
}

/** "14:30:05". */
export function formatTimeSeconds(d: TimeInput): string {
  const date = toDate(d);
  return date ? format(date, TIME_SECONDS_FMT) : '';
}
