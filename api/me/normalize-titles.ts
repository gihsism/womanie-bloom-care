import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { normalizeTestTitle } from '../_lib/normalize-test-title.js';
import { withSentry } from '../_lib/sentry.js';

// Per-user title backfill.
//
// Renormalizes every medical_extracted_data row keyed to the session
// user via the same alias map analyze-document.ts now uses on write.
// Idempotent: rows whose normalized title already matches the stored
// title are skipped, so re-running is harmless.
//
// Triggered manually from Settings — there's no schema or background
// job involved; just one POST when the user wants to clean up rows
// from before the normalizer existed.

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const rows = await sql.query(
      'SELECT id, title FROM medical_extracted_data WHERE user_id = $1',
      [user.id]
    ) as Array<{ id: string; title: string }>;

    let updated = 0;
    for (const r of rows) {
      const next = normalizeTestTitle(r.title);
      if (next && next !== r.title) {
        await sql.query(
          'UPDATE medical_extracted_data SET title = $1 WHERE id = $2 AND user_id = $3',
          [next, r.id, user.id]
        );
        updated++;
      }
    }

    return res.status(200).json({ scanned: rows.length, updated });
  } catch (error) {
    console.error('me/normalize-titles error:', error);
    return res.status(500).json({ error: 'Backfill failed' });
  }
}

export default withSentry(handler);
