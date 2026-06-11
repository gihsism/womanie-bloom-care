import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// One-step reschedule for the patient's own appointment. Mirrors
// /api/appointments/book: schedule windows are enforced by the slot
// picker client-side (same trust level as booking), while the conflict
// check is atomic server-side — the UPDATE only lands if no other
// non-cancelled appointment for that doctor overlaps the new window,
// so two patients racing for the same slot can't both win it.

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
      `SELECT id, doctor_id, duration, status
         FROM appointments
        WHERE id = $1 AND patient_id = $2`,
      [body.appointment_id, user.id]
    ) as Array<{ id: string; doctor_id: string; duration: number | null; status: string | null }>;
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

    // Conflict-guarded move: same overlap math as book.ts, excluding
    // this appointment itself so moving within/adjacent to your own
    // current slot is allowed.
    const updated = await sql.query(
      `UPDATE appointments
          SET scheduled_at = $1, updated_at = now()
        WHERE id = $2
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
    ) as Array<{ id: string; scheduled_at: string }>;

    if (updated.length === 0) {
      return res.status(409).json({
        error: 'That slot was just taken. Pick a different time.',
      });
    }

    return res.status(200).json({ appointment: updated[0] });
  } catch (error) {
    console.error('appointments/reschedule error:', error);
    return res.status(500).json({ error: 'Failed to reschedule appointment' });
  }
}

export default withSentry(handler);
