import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// audit #18 — recover document analyses whose fire-and-forget dispatch was lost.
//
// Analysis is kicked off from the browser (DocumentUpload → POST
// /api/analyze-document, keepalive) and is not observable: if that request
// never reaches Vercel, the document sits un-analyzed forever. This endpoint,
// called by the owner when they open Health Records, finds their own
// un-analyzed documents and hands them back so the client can re-dispatch under
// the same session — no server-to-server auth path required.
//
// pending_jobs is the attempt ledger: it caps retries (so a genuinely
// unparseable document stops retrying instead of re-firing on every page load)
// and records the last error for observability. "Done" is implicit — once a
// document has an analysis, it drops out of the scan below.

const MAX_ATTEMPTS = 3;
// Give an in-flight analysis room to finish before we consider it lost, and
// rate-limit repeated retries of the same doc.
const GRACE_MINUTES = 2;
// Bound the scan and the work handed back per call.
const LOOKBACK_DAYS = 14;
const BATCH = 5;

interface RetryItem {
  documentId: string;
  filePath: string | null;
  fileName: string | null;
  mimeType: string | null;
}

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Candidate = this user's documents with no analysis (ai_summary never
    // filled and no current document_analyses row), old enough that an
    // in-flight run would have finished, and recent enough to still matter.
    const candidates = await sql.query(
      `SELECT h.id, h.file_path, h.file_name, h.mime_type
         FROM health_documents h
        WHERE h.user_id = $1
          AND h.ai_summary IS NULL
          AND h.created_at < now() - ($2 || ' minutes')::interval
          AND h.created_at > now() - ($3 || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM document_analyses a
             WHERE a.document_id = h.id AND a.is_current = TRUE
          )
        ORDER BY h.created_at DESC
        LIMIT 50`,
      [user.id, String(GRACE_MINUTES), String(LOOKBACK_DAYS)],
    );

    const retries: RetryItem[] = [];

    for (const doc of candidates) {
      if (retries.length >= BATCH) break;
      const documentId = doc.id as string;

      const existing = await sql.query(
        'SELECT status, attempts, updated_at FROM pending_jobs WHERE document_id = $1',
        [documentId],
      );

      if (existing.length === 0) {
        // First retry for this doc.
        await sql.query(
          `INSERT INTO pending_jobs (document_id, user_id, status, attempts)
           VALUES ($1, $2, 'pending', 1)
           ON CONFLICT (document_id) DO NOTHING`,
          [documentId, user.id],
        );
        retries.push({
          documentId,
          filePath: doc.file_path ?? null,
          fileName: doc.file_name ?? null,
          mimeType: doc.mime_type ?? null,
        });
        continue;
      }

      const job = existing[0];
      const status = job.status as string;
      const attempts = Number(job.attempts) || 0;
      const updatedAt = new Date(job.updated_at as string).getTime();
      const recentlyTouched = Date.now() - updatedAt < GRACE_MINUTES * 60_000;

      if (status !== 'pending') continue; // already done or given up
      if (recentlyTouched) continue; // a retry is likely still in flight

      if (attempts >= MAX_ATTEMPTS) {
        // Give up — stop re-dispatching on every visit.
        await sql.query(
          `UPDATE pending_jobs
              SET status = 'failed',
                  last_error = COALESCE(last_error, 'Max retry attempts reached'),
                  updated_at = now()
            WHERE document_id = $1`,
          [documentId],
        );
        continue;
      }

      await sql.query(
        `UPDATE pending_jobs SET attempts = attempts + 1, updated_at = now() WHERE document_id = $1`,
        [documentId],
      );
      retries.push({
        documentId,
        filePath: doc.file_path ?? null,
        fileName: doc.file_name ?? null,
        mimeType: doc.mime_type ?? null,
      });
    }

    return res.status(200).json({ retries });
  } catch (error) {
    console.error('pending-retries error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}

export default withSentry(handler);
