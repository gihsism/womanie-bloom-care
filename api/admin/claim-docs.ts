import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const { oldUserId } = req.body || {};
  if (!oldUserId || typeof oldUserId !== 'string') {
    return res.status(400).json({ error: 'oldUserId required' });
  }
  if (oldUserId === user.id) {
    return res.status(400).json({ error: 'Already owned by current user' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Authorize: allow only if oldUserId is orphaned (no auth_users row)
    // OR that auth_users row shares the current user's email.
    const existing = await sql.query('SELECT id, email FROM auth_users WHERE id = $1', [oldUserId]);
    if (existing.length > 0) {
      const ownerEmail = (existing[0].email || '').toLowerCase();
      const currentEmail = (user.email || '').toLowerCase();
      if (!currentEmail || ownerEmail !== currentEmail) {
        return res.status(403).json({ error: 'Cannot claim: oldUserId belongs to a different account' });
      }
    }

    const docs = await sql.query(
      'UPDATE health_documents SET user_id = $1 WHERE user_id = $2 RETURNING id',
      [user.id, oldUserId]
    );
    const data = await sql.query(
      'UPDATE medical_extracted_data SET user_id = $1 WHERE user_id = $2 RETURNING id',
      [user.id, oldUserId]
    );

    return res.status(200).json({
      success: true,
      claimed_documents: docs.length,
      claimed_extracted_data: data.length,
      from: oldUserId,
      to: user.id,
    });
  } catch (error) {
    console.error('claim-docs error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
  }
}
