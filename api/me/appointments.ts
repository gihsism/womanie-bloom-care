import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// Patient-side appointments list. The patient can already book through
// FindDoctor but had nowhere to see them after — this endpoint backs an
// "Upcoming appointments" card on PatientDashboard plus the cancel flow.
//
// Returns appointments joined with the doctor's public-surface profile
// (name / title / specialty / avatar) so the UI doesn't need to chase
// doctor_profiles in a separate query. Patients can't read other
// doctors' rows via /api/db (single-owner ownership rule), so the join
// has to happen server-side.

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const sql = neon(process.env.DATABASE_URL!);

  // ?upcoming=true filters to future, non-cancelled appointments.
  // Default (no param) returns everything so the same endpoint can power
  // a "history" view later.
  const upcomingOnly = req.query.upcoming === 'true' || req.query.upcoming === '1';

  try {
    const rows = upcomingOnly
      ? await sql.query(
          `SELECT
              a.id, a.doctor_id, a.scheduled_at, a.status,
              a.consultation_type, a.duration, a.payment_status,
              p.full_name AS doctor_name,
              p.title AS doctor_title,
              p.specialties AS doctor_specialties,
              p.avatar_url AS doctor_avatar_url,
              p.is_verified AS doctor_verified
             FROM appointments a
             LEFT JOIN doctor_profiles p ON p.user_id = a.doctor_id
            WHERE a.patient_id = $1
              AND a.scheduled_at >= NOW()
              AND COALESCE(a.status, 'scheduled') <> 'cancelled'
            ORDER BY a.scheduled_at ASC`,
          [user.id]
        )
      : await sql.query(
          `SELECT
              a.id, a.doctor_id, a.scheduled_at, a.status,
              a.consultation_type, a.duration, a.payment_status,
              p.full_name AS doctor_name,
              p.title AS doctor_title,
              p.specialties AS doctor_specialties,
              p.avatar_url AS doctor_avatar_url,
              p.is_verified AS doctor_verified
             FROM appointments a
             LEFT JOIN doctor_profiles p ON p.user_id = a.doctor_id
            WHERE a.patient_id = $1
            ORDER BY a.scheduled_at DESC`,
          [user.id]
        );

    return res.status(200).json({ appointments: rows });
  } catch (error) {
    console.error('me/appointments error:', error);
    return res.status(500).json({ error: 'Failed to load appointments' });
  }
}

export default withSentry(handler);
