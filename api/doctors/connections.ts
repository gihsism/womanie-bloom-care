import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// Lists every doctor_patient_connections row for the calling doctor, joined
// against profiles so the UI can show the patient's actual name instead of
// "Patient #abc12345". The /api/db generic router can't join across tables
// and pins the visible profiles row to the session user, so doctors going
// through it see no names. This endpoint sits next to /api/doctors/patient
// and is consent-gated the same way: only rows where doctor_id matches the
// caller are returned.

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const doctor = await getAuthUser(req);
  if (!doctor) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    // Adds patient activity signal so the doctor's connected-patients list
    // can sort by recency and flag patients with new uploads:
    //   - last_upload_at: most recent health_documents row for the patient
    //   - recent_doc_count: count of docs uploaded in the last 14 days
    // These are LATERAL subqueries scoped to c.patient_id so they don't
    // leak data — a connection row only surfaces patient activity if the
    // doctor already has the connection.
    const rows = await sql.query(
      `SELECT
         c.id,
         c.patient_id,
         c.doctor_id,
         c.status,
         c.connection_type,
         c.created_at,
         p.full_name AS patient_full_name,
         p.life_stage AS patient_life_stage,
         u.last_upload_at,
         u.recent_doc_count
       FROM doctor_patient_connections c
       LEFT JOIN profiles p ON p.id = c.patient_id
       LEFT JOIN LATERAL (
         SELECT
           MAX(uploaded_at) AS last_upload_at,
           COUNT(*) FILTER (WHERE uploaded_at >= NOW() - INTERVAL '14 days') AS recent_doc_count
           FROM health_documents
          WHERE user_id = c.patient_id
       ) u ON TRUE
       WHERE c.doctor_id = $1
       ORDER BY c.created_at DESC`,
      [doctor.id]
    );

    return res.status(200).json({ connections: rows });
  } catch (error) {
    console.error('doctors/connections error:', error);
    return res.status(500).json({ error: 'Failed to load patient connections' });
  }
}

export default withSentry(handler);
