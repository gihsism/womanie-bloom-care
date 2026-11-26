import { sendPush, vapidConfig } from './push-send.js';
import { parsePrefs, type SubscriptionRow } from './push-schedule.js';
import { formatPracticeDateTime } from './practice-time.js';

// Tells a doctor, on her own phone, that a patient booked, moved or
// cancelled a visit with her. Reuses the patient-reminder Web Push setup
// (push_subscriptions, VAPID keys); the doctor switches it on per device
// in Profile & settings -> "Booking alerts" (prefs.bookings).
//
// Rules:
// - Only the visit's doctor's OWN devices: the query is filtered by
//   doctor_id and every row is re-checked before sending.
// - Lock-screen wording stays discreet: no patient name, only the time.
// - Best effort: never throws, so a push failure can't fail the booking.
//   With no VAPID keys (push off) it returns at once without touching
//   the database.

export type BookingEvent = 'booked' | 'cancelled' | 'moved';

type Query = (text: string, params: unknown[]) => Promise<unknown[]>;

export function bookingPayload(event: BookingEvent, scheduledAt: Date, appointmentId: string) {
  const when = formatPracticeDateTime(scheduledAt);
  const body =
    event === 'booked' ? `New booking: ${when}`
    : event === 'moved' ? `A visit was moved to ${when}`
    : `A patient cancelled the visit on ${when}`;
  return { title: 'Womanie', body, url: '/doctor/dashboard', tag: `booking-${appointmentId}-${event}` };
}

export async function notifyDoctorOfBooking(
  query: Query,
  doctorId: string,
  event: BookingEvent,
  scheduledAt: Date | string,
  appointmentId: string,
): Promise<number> {
  try {
    const cfg = vapidConfig();
    if (!cfg || !doctorId) return 0;
    const at = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
    if (Number.isNaN(at.getTime())) return 0;
    const subs = (await query(
      'SELECT id, user_id, endpoint, p256dh, auth, timezone, prefs FROM push_subscriptions WHERE user_id = $1',
      [doctorId],
    )) as SubscriptionRow[];
    const payload = bookingPayload(event, at, appointmentId);
    let sent = 0;
    for (const s of subs) {
      if (s.user_id !== doctorId) continue;
      if (!parsePrefs(s.prefs).bookings) continue;
      const r = await sendPush(cfg, s, payload);
      if (r === 'sent') sent++;
      if (r === 'gone') {
        await query('DELETE FROM push_subscriptions WHERE id = $1 AND user_id = $2', [s.id, doctorId]).catch(() => undefined);
      }
    }
    return sent;
  } catch (err) {
    // Most likely migration 015 is not applied yet; never fail the caller.
    console.error('doctor-notify failed:', (err as Error)?.message);
    return 0;
  }
}
