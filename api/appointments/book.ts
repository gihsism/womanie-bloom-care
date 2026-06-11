import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// Server-side booking with conflict check. The /api/db generic router
// can insert into appointments, but it can't run a "WHERE NOT EXISTS
// overlapping" guard atomically — so two patients clicking the same
// slot inside the FindDoctor round-trip both succeed. This endpoint
// inserts inside an INSERT ... SELECT ... WHERE NOT EXISTS so the
// second submitter gets a clean 409 instead of a double-booked row.

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
    return res.status(400).json({ error: 'Cannot book in the past' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Confirm doctor exists + is verified + has bookable settings.
    const docRows = await sql.query(
      `SELECT dp.user_id, dp.is_verified, cs.is_available
         FROM doctor_profiles dp
         LEFT JOIN consultation_settings cs ON cs.doctor_id = dp.user_id
        WHERE dp.user_id = $1`,
      [body.doctor_id]
    ) as Array<{ user_id: string; is_verified: boolean; is_available: boolean | null }>;
    if (docRows.length === 0) {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    if (!docRows[0].is_verified) {
      return res.status(400).json({ error: 'This doctor is not currently bookable' });
    }
    if (docRows[0].is_available === false) {
      return res.status(400).json({ error: 'This doctor is not currently available for bookings' });
    }

    // Conflict-guarded insert: only writes if no existing appointment
    // for the same doctor overlaps the requested window. Postgres
    // computes both `scheduled_at + (duration||30) * INTERVAL '1 minute'`
    // and the candidate's end so the overlap math is correct even when
    // the new slot is partially inside another.
    const windowEnd = new Date(scheduledAt.getTime() + duration * 60000).toISOString();
    const scheduledIso = scheduledAt.toISOString();

    const inserted = await sql.query(
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
      [body.doctor_id, user.id, scheduledIso, duration, consultationType, windowEnd]
    ) as Array<{ id: string; scheduled_at: string }>;

    if (inserted.length === 0) {
      return res.status(409).json({
        error: 'This slot was just taken by another patient. Pick a different time.',
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

    return res.status(200).json({ appointment: inserted[0] });
  } catch (error) {
    console.error('appointments/book error:', error);
    return res.status(500).json({ error: 'Failed to book appointment' });
  }
}

export default withSentry(handler);
