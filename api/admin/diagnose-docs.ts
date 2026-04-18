import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const sql = neon(process.env.DATABASE_URL!);

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

    const userIds = docGroups.map((g: any) => g.user_id);
    const knownUsers = userIds.length
      ? await sql.query(
          `SELECT id, email FROM auth_users WHERE id = ANY($1::text[])`,
          [userIds]
        )
      : [];
    const knownById = new Map<string, { id: string; email: string }>();
    for (const u of knownUsers) knownById.set(u.id, u);

    const groups = docGroups.map((g: any) => {
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
  } catch (error) {
    console.error('diagnose-docs error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
  }
}
