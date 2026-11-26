import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { fitsSchedule, type ScheduleWindow } from '../../_lib/practice-time.js';
import { notifyDoctorOfBooking } from '../../_lib/doctor-notify.js';

// One-step reschedule for the patient's own appointment. Mirrors
// /api/appointments/book: schedule windows are enforced by the slot
// picker client-side (same trust level as booking), while the conflict
// check is atomic server-side — the UPDATE only lands if no other
// non-cancelled appointment for that doctor overlaps the new window,
// so two patients racing for the same slot can't both win it.
// 2026-11-26: the move runs behind the same per-doctor advisory lock as
// booking (race-proof), must land inside the doctor's opening hours in
// Swiss time, and tells the doctor (Booking alerts) that the visit moved.

interface RescheduleBody {
  appointment_id: string;
  scheduled_at: string; // new start, ISO string
}

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body as Partial<RescheduleBody> | undefined;
  if (!body || typeof body.appointment_id !== 'string' || typeof body.scheduled_at !== 'string') {
    return res.status(400).json({ error: 'appointment_id and scheduled_at are required' });
  }

  const newStart = new Date(body.scheduled_at);
  if (Number.isNaN(newStart.getTime())) {
    return res.status(400).json({ error: 'scheduled_at is not a valid ISO timestamp' });
  }
  if (newStart.getTime() < Date.now()) {
    return res.status(400).json({ error: 'Cannot reschedule into the past' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Ownership + state check. Only the patient who booked it can move
    // it, and only while it's still an upcoming scheduled appointment.
    const rows = await sql.query(
      `SELECT a.id, a.doctor_id, a.duration, a.status,
              (SELECT COALESCE(json_agg(json_build_object(
                        'day_of_week', ds.day_of_week, 'start_time', ds.start_time,
                        'end_time', ds.end_time, 'is_active', ds.is_active)), '[]'::json)
                 FROM doctor_schedule ds
                WHERE ds.doctor_id = a.doctor_id AND ds.is_active IS NOT FALSE) AS schedule
         FROM appointments a
        WHERE a.id = $1 AND a.patient_id = $2`,
      [body.appointment_id, user.id]
    ) as Array<{ id: string; doctor_id: string; duration: number | null; status: string | null; schedule?: ScheduleWindow[] | string | null }>;
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    const apt = rows[0];
    const status = (apt.status ?? 'scheduled').toLowerCase();
    if (status !== 'scheduled') {
      return res.status(400).json({ error: `Cannot reschedule a ${status} appointment` });
    }

    const duration = apt.duration && apt.duration > 0 ? apt.duration : 30;
    const newStartIso = newStart.toISOString();
    const newEndIso = new Date(newStart.getTime() + duration * 60000).toISOString();

    let schedule: ScheduleWindow[] = [];
    try {
      const raw = typeof apt.schedule === 'string' ? JSON.parse(apt.schedule) : apt.schedule;
      schedule = Array.isArray(raw) ? raw : [];
    } catch { schedule = []; }
    if (!fitsSchedule(newStart, duration, schedule)) {
      return res.status(400).json({ error: 'That time is outside your doctor\'s opening hours. Pick one of the offered times.' });
    }

    // Conflict-guarded move: same overlap math as book.ts, excluding
    // this appointment itself so moving within/adjacent to your own
    // current slot is allowed. Re-check status in the WHERE so a
    // concurrent cancel between the SELECT above and this UPDATE can't
    // silently succeed and leave a cancelled appointment with a new time.
    let updated: Array<{ id: string; scheduled_at: string }>;
    try {
      const results = await sql.transaction([
        sql.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`appointments:${apt.doctor_id}`]),
        sql.query(
          `UPDATE appointments
              SET scheduled_at = $1, updated_at = now()
            WHERE id = $2
              AND COALESCE(status, 'scheduled') = 'scheduled'
              AND NOT EXISTS (
                SELECT 1 FROM appointments a
                 WHERE a.doctor_id = $3
                   AND a.id <> $2
                   AND COALESCE(a.status, 'scheduled') <> 'cancelled'
                   AND a.scheduled_at < $4::timestamptz
                   AND a.scheduled_at + (COALESCE(a.duration, 30) * INTERVAL '1 minute') > $1::timestamptz
              )
            RETURNING id, scheduled_at, duration, consultation_type, status`,
          [newStartIso, apt.id, apt.doctor_id, newEndIso]
        ),
      ]);
      updated = results[1] as Array<{ id: string; scheduled_at: string }>;
    } catch (err) {
      if ((err as { code?: string })?.code === '23505') updated = [];
      else throw err;
    }

    if (updated.length === 0) {
      return res.status(409).json({
        error: 'That slot was just taken. Pick a different time.',
      });
    }

    await notifyDoctorOfBooking(
      (text, params) => sql.query(text, params) as Promise<unknown[]>,
      apt.doctor_id, 'moved', newStartIso, apt.id,
    );

    return res.status(200).json({ appointment: updated[0] });
  } catch (error) {
    console.error('appointments/reschedule error:', error);
    return res.status(500).json({ error: 'Failed to reschedule appointment' });
  }
}

export default withSentry(handler);
