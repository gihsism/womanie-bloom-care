import { PRACTICE_TZ, formatPracticeTime } from './practiceTime';
import { viewerOutsidePracticeTz } from './timeSlots';

// Small pure helpers for the patient's booking flow (Find a Doctor, the
// doctor profile page, Visits, Notifications), kept here so they can be
// unit-tested without rendering.

export type BookingFailure = 'slot_taken' | 'bookings_off' | 'past' | 'outside_hours' | 'other';

/** What went wrong with a booking/reschedule call, from its HTTP status + server code. */
export function bookingFailure(status: number, code: unknown): BookingFailure {
  if (status === 409 || code === 'slot_taken') return 'slot_taken';
  if (code === 'bookings_off' || code === 'not_bookable' || status === 404) return 'bookings_off';
  if (code === 'past') return 'past';
  if (code === 'outside_hours') return 'outside_hours';
  return 'other';
}

/** "CHF 120", "Free", or null when the doctor has not set a price. */
export function formatPrice(price: number | null | undefined, currency?: string | null): string | null {
  if (price === null || price === undefined || !Number.isFinite(price)) return null;
  if (price === 0) return 'Free';
  return `${currency || 'CHF'} ${Number.isInteger(price) ? price : price.toFixed(2)}`;
}

/** "Tuesday 6 January 2099" for an instant, read in Swiss time. */
export function formatPracticeLongDate(instant: Date, tz: string = PRACTICE_TZ): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(instant).replace(/,/g, '');
}

/** "Tue 6 Jan" for an instant, read in Swiss time. */
export function formatPracticeShortDate(instant: Date, tz: string = PRACTICE_TZ): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })
    .format(instant).replace(/,/g, '');
}

/** " (Swiss time)" when this device's clock differs from Zurich, else "". */
export function swissSuffix(outside: boolean = viewerOutsidePracticeTz()): string {
  return outside ? ' (Swiss time)' : '';
}

/** "Tuesday 6 January 2099 at 10:00" (+ " (Swiss time)" abroad). */
export function formatVisitWhen(instant: Date, outside?: boolean): string {
  return `${formatPracticeLongDate(instant)} at ${formatPracticeTime(instant)}${swissSuffix(outside)}`;
}

export const visitTypeLabel = (t: string | null | undefined): string =>
  t === 'video' ? 'Video call' : 'In person';

const CONFIRM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface ConfirmableVisit {
  id: string;
  scheduled_at: string;
  status: string | null;
  booked_at?: string | null;
}

/**
 * Visits she booked in the last 7 days that are still upcoming and
 * active: the in-app "Booking confirmed" notices. Needs booked_at
 * (appointments.created_at); rows without it are skipped.
 */
export function recentlyBooked<T extends ConfirmableVisit>(rows: T[], now: Date = new Date()): T[] {
  const nowMs = now.getTime();
  return rows
    .filter(r => {
      if ((r.status ?? 'scheduled').toLowerCase() !== 'scheduled') return false;
      const at = Date.parse(r.scheduled_at);
      const booked = r.booked_at ? Date.parse(r.booked_at) : NaN;
      return Number.isFinite(at) && at > nowMs && Number.isFinite(booked)
        && booked <= nowMs + 60_000 && nowMs - booked <= CONFIRM_WINDOW_MS;
    })
    .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
}
