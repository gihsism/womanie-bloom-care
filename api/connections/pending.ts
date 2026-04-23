import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// Pending-connection list for a patient.
//
// Doctors redeem an access code → `doctor_patient_connections` gets a
// row in status='pending'. The patient needs to see who's requesting
// access and approve or reject. Rendering that list means joining
// doctor_patient_connections (relational, visible to the patient
// through /api/db ownership enforcement) with doctor_profiles — which
// the patient CAN'T read through /api/db because owner_column is
// user_id and that's the doctor, not the patient. So this endpoint
// does the join server-side and returns only the doctor-surface
// fields.

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
    // Join pending connections for this patient with the requesting
    // doctor's public profile fields.
    const rows = await sql.query(
      `SELECT
          c.id, c.doctor_id, c.connection_type, c.created_at,
          p.full_name, p.title, p.specialties, p.years_experience,
          p.avatar_url, p.is_verified
         FROM doctor_patient_connections c
         LEFT JOIN doctor_profiles p ON p.user_id = c.doctor_id
        WHERE c.patient_id = $1 AND c.status = 'pending'
        ORDER BY c.created_at DESC`,
      [user.id]
    );

    return res.status(200).json({ pending: rows });
  } catch (error) {
    console.error('connections/pending error:', error);
    return res.status(500).json({ error: 'Failed to load pending connections' });
  }
}

export default withSentry(handler);
