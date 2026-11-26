import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { dayWindowUtc } from '../../_lib/practice-time.js';

// Doctor availability for a single date: returns the start times (ISO)
// of every non-cancelled appointment that doctor has booked that day, so
// the patient-side booking flow can filter them out of the offered
// slots. Patients can't read other patients' appointments via /api/db
// (relational ownership requires matching patient_id OR doctor_id of the
// caller), so we need a dedicated server-side join.
//
// Only the START time and duration are exposed — no patient identity
// leaks across the wall.

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const doctorId = typeof req.query.doctor_id === 'string' ? req.query.doctor_id : null;
  const dateStr = typeof req.query.date === 'string' ? req.query.date : null;
  if (!doctorId) return res.status(400).json({ error: 'Missing doctor_id' });
  // The day is a calendar day in Swiss time (Europe/Zurich), the zone the
  // doctor's opening hours are in: [Zurich 00:00, next Zurich 00:00).
  // Until 2026-11-26 it was cut at UTC midnight, so a visit between 00:00
  // and 01:00/02:00 Zurich was missing from the busy list.
  const day = dateStr ? dayWindowUtc(dateStr) : null;
  if (!dateStr || !day) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const dayStart = day.start.toISOString();
    const dayEnd = day.end.toISOString();

    const rows = await sql.query(
      `SELECT scheduled_at, duration
         FROM appointments
        WHERE doctor_id = $1
          AND scheduled_at < $3
          AND scheduled_at > $2::timestamptz - INTERVAL '1 day'
          AND scheduled_at + (COALESCE(duration, 30) * INTERVAL '1 minute') > $2
          AND COALESCE(status, 'scheduled') <> 'cancelled'
        ORDER BY scheduled_at ASC`,
      [doctorId, dayStart, dayEnd]
    );

    return res.status(200).json({ busy: rows });
  } catch (error) {
    console.error('doctors/availability error:', error);
    return res.status(500).json({ error: 'Failed to load availability' });
  }
}

export default withSentry(handler);
