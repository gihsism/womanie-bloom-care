import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// Lists every doctor_patient_connections row for the calling doctor, joined
// against profiles so the UI can show the patient's actual name instead of
// "Patient #abc12345". The /api/db generic router can't join across tables
// and pins the visible profiles row to the session user, so doctors going
// through it see no names.
//
// Consent: only the calling doctor's own connection rows are returned, and
// the patient's health-derived fields (life stage, document activity) are
// exposed ONLY once the connection is 'approved'. Pending rows still surface
// the name — the patient initiated contact by booking or sharing a code —
// but not their health data, matching the /api/doctors/patient gate.

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
    // Patient activity signal for the connected-patients list (sort by
    // recency, flag new uploads):
    //   - last_upload_at: most recent health_documents row for the patient
    //   - recent_doc_count: count of docs uploaded in the last 14 days
    // life_stage + these activity fields are health data, so they are gated
    // on status='approved' (NULL for pending) — a pending connection must
    // not reveal the patient's health information before they consent.
    const rows = await sql.query(
      `SELECT
         c.id,
         c.patient_id,
         c.doctor_id,
         c.status,
         c.connection_type,
         c.created_at,
         p.full_name AS patient_full_name,
         CASE WHEN c.status = 'approved' THEN p.life_stage END AS patient_life_stage,
         CASE WHEN c.status = 'approved' THEN u.last_upload_at END AS last_upload_at,
         CASE WHEN c.status = 'approved' THEN u.recent_doc_count END AS recent_doc_count
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
       ORDER BY c.created_at DESC
       LIMIT 500`,
      [doctor.id]
    );

    return res.status(200).json({ connections: rows });
  } catch (error) {
    console.error('doctors/connections error:', error);
    return res.status(500).json({ error: 'Failed to load patient connections' });
  }
}

export default withSentry(handler);
