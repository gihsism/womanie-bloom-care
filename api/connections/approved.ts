import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// List of already-approved doctors for the session patient, with
// public-surface doctor profile fields so the UI can name and picture
// them next to a Revoke button. Same join / privacy reasoning as
// /api/connections/pending.

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
          c.id, c.doctor_id, c.approved_at,
          p.full_name, p.title, p.specialties, p.years_experience,
          p.avatar_url, p.is_verified
         FROM doctor_patient_connections c
         LEFT JOIN doctor_profiles p ON p.user_id = c.doctor_id
        WHERE c.patient_id = $1 AND c.status = 'approved'
        ORDER BY c.approved_at DESC NULLS LAST`,
      [user.id]
    );
    return res.status(200).json({ approved: rows });
  } catch (error) {
    console.error('connections/approved error:', error);
    return res.status(500).json({ error: 'Failed to load connections' });
  }
}

export default withSentry(handler);
