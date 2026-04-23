import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// Combined admin-docs endpoint (fits the Hobby-plan function cap):
//   GET  /api/admin/docs  → diagnose user_id groupings in health_documents
//   POST /api/admin/docs  { oldUserId } → claim rows from an orphan id
async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const sql = neon(process.env.DATABASE_URL!);

  if (req.method === 'GET') {
    const docGroups = await sql.query(
      `SELECT user_id, COUNT(*)::int AS doc_count, MIN(uploaded_at) AS first_upload, MAX(uploaded_at) AS last_upload
       FROM health_documents
       GROUP BY user_id
       ORDER BY doc_count DESC`
    );

    const dataGroups = await sql.query(
      `SELECT user_id, COUNT(*)::int AS data_count
       FROM medical_extracted_data
       GROUP BY user_id`
    );
    const dataByUser = new Map<string, number>();
    for (const row of dataGroups) dataByUser.set(row.user_id, row.data_count);

    const userIds = (docGroups as Array<{ user_id: string; doc_count: number; first_upload: string; last_upload: string }>).map(g => g.user_id);
    const knownUsers = userIds.length
      ? await sql.query(`SELECT id, email FROM auth_users WHERE id = ANY($1::text[])`, [userIds])
      : [];
    const knownById = new Map<string, { id: string; email: string }>();
    for (const u of knownUsers as Array<{ id: string; email: string }>) knownById.set(u.id, u);

    const groups = (docGroups as Array<{ user_id: string; doc_count: number; first_upload: string; last_upload: string }>).map(g => {
      const known = knownById.get(g.user_id);
      return {
        user_id: g.user_id,
        doc_count: g.doc_count,
        data_count: dataByUser.get(g.user_id) || 0,
        first_upload: g.first_upload,
        last_upload: g.last_upload,
        is_current_user: g.user_id === user.id,
        known_auth_user: known ? { id: known.id, email: known.email } : null,
        claimable: !known || known.email?.toLowerCase() === (user.email || '').toLowerCase(),
      };
    });

    return res.status(200).json({
      current_user: { id: user.id, email: user.email },
      total_groups: groups.length,
      groups,
    });
  }

  if (req.method === 'POST') {
    const { oldUserId } = req.body || {};
    if (!oldUserId || typeof oldUserId !== 'string') {
      return res.status(400).json({ error: 'oldUserId required' });
    }
    if (oldUserId === user.id) {
      return res.status(400).json({ error: 'Already owned by current user' });
    }

    const existing = await sql.query('SELECT id, email FROM auth_users WHERE id = $1', [oldUserId]);
    if (existing.length > 0) {
      const ownerEmail = ((existing[0].email as string) || '').toLowerCase();
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
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withSentry(handler);
