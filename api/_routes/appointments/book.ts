import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { fitsSchedule, type ScheduleWindow } from '../../_lib/practice-time.js';
import { notifyDoctorOfBooking } from '../../_lib/doctor-notify.js';

// Server-side booking with conflict check. The /api/db generic router
// can insert into appointments, but it can't run a "WHERE NOT EXISTS
// overlapping" guard atomically — so two patients clicking the same
// slot inside the FindDoctor round-trip both succeed. This endpoint
// inserts inside an INSERT ... SELECT ... WHERE NOT EXISTS so the
// second submitter gets a clean 409 instead of a double-booked row.
//
// 2026-11-26 hardening:
// - NOT EXISTS alone is not race-proof under READ COMMITTED (two inserts
//   can both see "no overlap"), so the insert now runs in one transaction
//   behind a per-doctor advisory lock: the second booking waits, then sees
//   the first. Migration 017 adds a unique index on (doctor_id,
//   scheduled_at) for active visits as a database-level backstop (23505 ->
//   409 here).
// - The slot must sit inside the doctor's opening hours read in Swiss
//   time, and the visit length is the doctor's own setting, not whatever
//   the client sends.
// - The doctor gets a phone alert if she switched "Booking alerts" on.

interface BookBody {
  doctor_id: string;
  scheduled_at: string; // ISO string
  duration: number; // minutes
  consultation_type: 'video' | 'in_person' | string;
}

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body as Partial<BookBody> | undefined;
  if (!body || typeof body.doctor_id !== 'string' || typeof body.scheduled_at !== 'string') {
    return res.status(400).json({ error: 'doctor_id and scheduled_at are required' });
  }
  const duration = typeof body.duration === 'number' && body.duration > 0 ? Math.floor(body.duration) : 30;
  if (duration > 240) {
    return res.status(400).json({ error: 'duration too large' });
  }
  const consultationType = typeof body.consultation_type === 'string' ? body.consultation_type : 'in_person';

  const scheduledAt = new Date(body.scheduled_at);
  if (Number.isNaN(scheduledAt.getTime())) {
    return res.status(400).json({ error: 'scheduled_at is not a valid ISO timestamp' });
  }
  if (scheduledAt.getTime() < Date.now()) {
    return res.status(400).json({ error: 'That time has already passed. Pick one of the offered times.', code: 'past' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Confirm doctor exists + is verified + has bookable settings, and
    // load her opening hours and visit length in the same round-trip.
    const docRows = await sql.query(
      `SELECT dp.user_id, dp.is_verified, dp.verification_status, cs.is_available, cs.consultation_duration, cs.video_enabled,
              (SELECT COALESCE(json_agg(json_build_object(
                        'day_of_week', ds.day_of_week, 'start_time', ds.start_time,
                        'end_time', ds.end_time, 'is_active', ds.is_active)), '[]'::json)
                 FROM doctor_schedule ds
                WHERE ds.doctor_id = dp.user_id AND ds.is_active IS NOT FALSE) AS schedule
         FROM doctor_profiles dp
         LEFT JOIN consultation_settings cs ON cs.doctor_id = dp.user_id
        WHERE dp.user_id = $1`,
      [body.doctor_id]
    ) as Array<{
      user_id: string; is_verified: boolean; verification_status?: string | null; is_available: boolean | null;
      consultation_duration?: number | null; video_enabled?: boolean | null;
      schedule?: ScheduleWindow[] | string | null;
    }>;
    if (docRows.length === 0) {
      return res.status(404).json({ error: 'Doctor not found', code: 'not_bookable' });
    }
    const doc = docRows[0];
    // Approved only: a revoked/rejected doctor stays unbookable even if a
    // stale is_verified flag was left behind.
    const status = (doc.verification_status ?? 'approved').toLowerCase();
    if (!doc.is_verified || status !== 'approved') {
      return res.status(400).json({ error: 'This doctor is not currently bookable', code: 'not_bookable' });
    }
    // The doctor switched "Accept new bookings" off (possibly while this
    // patient had the booking dialog open): a distinct code so the app can
    // say so and drop the doctor from the list instead of a generic error.
    if (doc.is_available !== true) {
      return res.status(400).json({
        error: 'This doctor has just paused new bookings. Your visit was not booked.',
        code: 'bookings_off',
      });
    }
    const docDuration = typeof doc.consultation_duration === 'number' && doc.consultation_duration > 0
      ? Math.min(Math.floor(doc.consultation_duration), 240)
      : duration;
    let schedule: ScheduleWindow[] = [];
    try {
      const raw = typeof doc.schedule === 'string' ? JSON.parse(doc.schedule) : doc.schedule;
      schedule = Array.isArray(raw) ? raw : [];
    } catch { schedule = []; }
    if (!fitsSchedule(scheduledAt, docDuration, schedule)) {
      return res.status(400).json({ error: 'That time is outside this doctor\'s opening hours. Pick one of the offered times.', code: 'outside_hours' });
    }
    const type = consultationType === 'video' && doc.video_enabled !== false ? 'video' : 'in_person';

    // Conflict-guarded insert: only writes if no existing appointment
    // for the same doctor overlaps the requested window. Postgres
    // computes both `scheduled_at + (duration||30) * INTERVAL '1 minute'`
    // and the candidate's end so the overlap math is correct even when
    // the new slot is partially inside another.
    const windowEnd = new Date(scheduledAt.getTime() + docDuration * 60000).toISOString();
    const scheduledIso = scheduledAt.toISOString();

    let inserted: Array<{ id: string; scheduled_at: string }>;
    try {
      const results = await sql.transaction([
        // Serialises bookings per doctor until this transaction ends.
        sql.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`appointments:${body.doctor_id}`]),
        sql.query(
          `INSERT INTO appointments
              (doctor_id, patient_id, scheduled_at, duration, consultation_type, status, payment_status)
            SELECT $1, $2, $3, $4, $5, 'scheduled', 'pending'
             WHERE NOT EXISTS (
               SELECT 1 FROM appointments a
                WHERE a.doctor_id = $1
                  AND COALESCE(a.status, 'scheduled') <> 'cancelled'
                  AND a.scheduled_at < $6::timestamptz
                  AND a.scheduled_at + (COALESCE(a.duration, 30) * INTERVAL '1 minute') > $3::timestamptz
             )
            RETURNING id, scheduled_at, duration, consultation_type, status, payment_status`,
          [body.doctor_id, user.id, scheduledIso, docDuration, type, windowEnd]
        ),
      ]);
      inserted = results[1] as Array<{ id: string; scheduled_at: string }>;
    } catch (err) {
      // Unique index from migration 017: the same slot won by someone else.
      if ((err as { code?: string })?.code === '23505') inserted = [];
      else throw err;
    }

    if (inserted.length === 0) {
      return res.status(409).json({
        error: 'This slot was just taken by another patient. Pick a different time.',
        code: 'slot_taken',
      });
    }

    // Auto-create a *pending* connection so the doctor can request
    // chart access without the patient hunting for an access code
    // (approved by Alena 2026-06-11). Pending only — no data is shared
    // until the patient approves it from PendingConnections. The NOT
    // EXISTS guard (the table has no unique pair constraint) skips the
    // insert when any connection already exists for this pair; since
    // reject/revoke delete the row, re-booking after one creates a
    // fresh pending request the patient still controls. A failure here
    // never fails the booking itself.
    try {
      await sql.query(
        `INSERT INTO doctor_patient_connections (doctor_id, patient_id, connection_type, status)
         SELECT $1, $2, 'booking', 'pending'
          WHERE NOT EXISTS (
            SELECT 1 FROM doctor_patient_connections
             WHERE doctor_id = $1 AND patient_id = $2
          )`,
        [body.doctor_id, user.id]
      );
    } catch (connErr) {
      console.error('appointments/book: pending-connection insert failed (non-fatal):', connErr);
    }

    await notifyDoctorOfBooking(
      (text, params) => sql.query(text, params) as Promise<unknown[]>,
      body.doctor_id, 'booked', scheduledIso, inserted[0].id,
    );

    return res.status(200).json({ appointment: inserted[0] });
  } catch (error) {
    console.error('appointments/book error:', error);
    return res.status(500).json({ error: 'Failed to book appointment' });
  }
}

export default withSentry(handler);
