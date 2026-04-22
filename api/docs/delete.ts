import { neon } from '@neondatabase/serverless';
import { del } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// Atomic document deletion.
//
// The previous client-side flow fired three independent queries via the
// supabase shim (extracted data, document row, storage remove). The
// storage step was a no-op and the two DB deletes weren't in a
// transaction, so a failure in the middle left orphans behind. This
// endpoint owns the whole cascade server-side: all the DB writes run in
// one neon transaction, and the blob is deleted after commit so a failed
// DB delete never strands a blob-less DB row.

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { documentId } = (req.body ?? {}) as { documentId?: string };
  if (!documentId || typeof documentId !== 'string') {
    return res.status(400).json({ error: 'Missing documentId' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Verify the doc belongs to the session user and capture file_path
    // before the delete so we can clean up the blob afterwards.
    const rows = await sql.query(
      'SELECT file_path FROM health_documents WHERE id = $1 AND user_id = $2',
      [documentId, user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const filePath = rows[0].file_path as string | null;

    // Transactional cascade: extracted data, document analyses, the
    // document row itself. All keyed on both id + user_id defensively
    // even though we just verified ownership.
    await sql.transaction([
      sql`DELETE FROM medical_extracted_data WHERE document_id = ${documentId} AND user_id = ${user.id}`,
      sql`DELETE FROM document_analyses WHERE document_id = ${documentId} AND user_id = ${user.id}`,
      sql`DELETE FROM health_documents WHERE id = ${documentId} AND user_id = ${user.id}`,
    ]);

    // Best-effort blob cleanup. If the blob is already gone or the
    // token is mis-scoped we don't want to surface a 500 to the user —
    // the DB is already consistent.
    if (filePath && filePath.startsWith('http')) {
      try {
        await del(filePath, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch (e) {
        console.warn('Blob delete failed for', filePath, e);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Document delete error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Delete failed' });
  }
}

export default withSentry(handler);
