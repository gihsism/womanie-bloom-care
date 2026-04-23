import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// Patient accepts or rejects a pending doctor_patient_connection.
//
// The patient is the ONLY party who can do this — doctors can't
// auto-approve themselves. We verify the target connection belongs
// to the session user as patient_id, is still in 'pending', and then
// update (approve) or delete (reject) accordingly.

type Action = 'approve' | 'reject';

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { connectionId, action } = (req.body ?? {}) as { connectionId?: string; action?: Action };
  if (!connectionId || typeof connectionId !== 'string') {
    return res.status(400).json({ error: 'Missing connectionId' });
  }
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'action must be approve or reject' });
  }

  const sql = neon(process.env.DATABASE_URL!);

  // Confirm the connection is for this patient and still pending.
  const rows = await sql.query(
    `SELECT id FROM doctor_patient_connections
       WHERE id = $1 AND patient_id = $2 AND status = 'pending'`,
    [connectionId, user.id]
  ) as any[];
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Pending connection not found' });
  }

  try {
    if (action === 'approve') {
      await sql.query(
        `UPDATE doctor_patient_connections
            SET status = 'approved', approved_at = now()
          WHERE id = $1 AND patient_id = $2`,
        [connectionId, user.id]
      );
    } else {
      await sql.query(
        `DELETE FROM doctor_patient_connections WHERE id = $1 AND patient_id = $2`,
        [connectionId, user.id]
      );
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('connections/respond error:', error);
    return res.status(500).json({ error: 'Failed to update connection' });
  }
}

export default withSentry(handler);
