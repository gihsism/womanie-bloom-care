import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// Patient-side view of the chart access log: who opened my chart, and
// when. Read-only, scoped to the session user's own rows. Doctor
// identity comes from doctor_profiles so the patient sees a name, not
// an opaque user id.

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql.query(
      `SELECT l.id, l.viewed_at, l.surface,
              dp.full_name AS doctor_name,
              dp.specialty AS doctor_specialty,
              dp.avatar_url AS doctor_avatar_url
         FROM chart_access_log l
         LEFT JOIN doctor_profiles dp ON dp.user_id = l.doctor_id
        WHERE l.patient_id = $1
        ORDER BY l.viewed_at DESC
        LIMIT 100`,
      [user.id]
    );
    return res.status(200).json({ accesses: rows });
  } catch (error) {
    console.error('me/chart-access error:', error);
    return res.status(500).json({ error: 'Failed to load access log' });
  }
}

export default withSentry(handler);
