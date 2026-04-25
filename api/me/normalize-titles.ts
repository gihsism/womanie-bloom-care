import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { normalizeTestTitle } from '../_lib/normalize-test-title.js';
import { normalizeUnit } from '../_lib/normalize-unit.js';
import { withSentry } from '../_lib/sentry.js';

// Per-user title + unit backfill.
//
// Renormalizes every medical_extracted_data row keyed to the session
// user via the same alias maps analyze-document.ts uses on write.
// Idempotent: rows whose normalized form already matches the stored
// form are skipped, so re-running is harmless.
//
// Triggered manually from Settings; reports separate counts for
// titles changed and units changed so the user can see both passes
// landed.

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
      'SELECT id, title, unit FROM medical_extracted_data WHERE user_id = $1',
      [user.id]
    ) as Array<{ id: string; title: string; unit: string | null }>;

    let titlesUpdated = 0;
    let unitsUpdated = 0;
    for (const r of rows) {
      const nextTitle = normalizeTestTitle(r.title);
      const nextUnit = normalizeUnit(r.unit);
      const titleChanged = nextTitle && nextTitle !== r.title;
      const unitChanged = (nextUnit ?? null) !== (r.unit ?? null);
      if (titleChanged && unitChanged) {
        await sql.query(
          'UPDATE medical_extracted_data SET title = $1, unit = $2 WHERE id = $3 AND user_id = $4',
          [nextTitle, nextUnit, r.id, user.id]
        );
        titlesUpdated++;
        unitsUpdated++;
      } else if (titleChanged) {
        await sql.query(
          'UPDATE medical_extracted_data SET title = $1 WHERE id = $2 AND user_id = $3',
          [nextTitle, r.id, user.id]
        );
        titlesUpdated++;
      } else if (unitChanged) {
        await sql.query(
          'UPDATE medical_extracted_data SET unit = $1 WHERE id = $2 AND user_id = $3',
          [nextUnit, r.id, user.id]
        );
        unitsUpdated++;
      }
    }

    return res.status(200).json({
      scanned: rows.length,
      titlesUpdated,
      unitsUpdated,
      // Back-compat with the v1 Settings UI that read `updated`.
      updated: titlesUpdated + unitsUpdated,
    });
  } catch (error) {
    console.error('me/normalize-titles error:', error);
    return res.status(500).json({ error: 'Backfill failed' });
  }
}

export default withSentry(handler);
