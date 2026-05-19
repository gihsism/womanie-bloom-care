import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// Doctor-authored notes the patient is allowed to see.
//
// doctor_notes is owned-by-doctor in /api/db's ownership map, so a
// patient can't reach their own notes through the generic router.
// This endpoint flips the perspective: filter by patient_id = session
// user, AND is_visible_to_patient = TRUE so notes the doctor wrote
// for internal-only use never leak to the patient. Joins doctor_profiles
// so the UI can show "Dr. Alice Smith, Endocrinology" alongside each
// note without a follow-up lookup.

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const rows = await sql.query(
      `SELECT
          n.id, n.doctor_id, n.title, n.content, n.note_type, n.created_at,
          p.full_name AS doctor_name,
          p.title AS doctor_title,
          p.specialties AS doctor_specialties,
          p.avatar_url AS doctor_avatar_url,
          p.is_verified AS doctor_verified
         FROM doctor_notes n
         LEFT JOIN doctor_profiles p ON p.user_id = n.doctor_id
        WHERE n.patient_id = $1
          AND n.is_visible_to_patient = TRUE
        ORDER BY n.created_at DESC`,
      [user.id]
    );
    return res.status(200).json({ notes: rows });
  } catch (error) {
    console.error('me/doctor-notes error:', error);
    return res.status(500).json({ error: 'Failed to load notes' });
  }
}

export default withSentry(handler);
