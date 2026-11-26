import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { POLICY_VERSIONS, isConsentDocument } from '../../_lib/policy-versions.js';

// Consent log (migration 024), shown in Me -> Privacy.
//
//   GET  /api/me/consents  -> { current, history, available }
//        current: the versions in force (api/_lib/policy-versions.ts)
//        history: her acceptances, newest first
//   POST /api/me/consents  { document: 'privacy_policy' }
//        records that she accepted the CURRENT version of that document.
//        The version is taken from the server, never from the body, so a
//        client can't record acceptance of a version that doesn't exist.
//        Optional `version`: what the app showed her. When sent and not
//        the current version -> 409 policy_outdated (stale app).
//        Optional `context: 'gate'`: accepted on the one-time consent
//        screen after login (src/components/ConsentGate.tsx); recorded
//        as source 'consent_gate' instead of 'me_privacy'.
//
// Rows are append-only from the app and always bound to the session user.

function missingTable(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === '42P01';
}

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const sql = neon(process.env.DATABASE_URL!);

  if (req.method === 'POST') {
    const { document, version, context } = (req.body ?? {}) as { document?: unknown; version?: unknown; context?: unknown };
    if (!isConsentDocument(document)) return res.status(400).json({ error: 'Unknown document' });
    const current = POLICY_VERSIONS[document];
    if (!current) return res.status(400).json({ error: 'This document is not published yet' });
    if (version !== undefined && version !== current.version) {
      return res.status(409).json({
        error: 'The policy was updated. Please reload the page and review it.',
        code: 'policy_outdated',
        currentVersion: current.version,
      });
    }
    const source = context === 'gate' ? 'consent_gate' : 'me_privacy';
    try {
      const rows = await sql.query(
        `INSERT INTO consent_log (user_id, document, version, source)
         VALUES ($1, $2, $3, $4)
         RETURNING document, version, accepted_at, source`,
        [user.id, document, current.version, source],
      );
      return res.status(200).json({ consent: rows[0] ?? null });
    } catch (err) {
      if (missingTable(err)) return res.status(503).json({ error: 'not available yet' });
      console.error('me/consents insert failed:', (err as Error)?.message);
      return res.status(500).json({ error: 'Could not record your acceptance' });
    }
  }

  try {
    const history = await sql.query(
      `SELECT document, version, accepted_at, source FROM consent_log
        WHERE user_id = $1 ORDER BY accepted_at DESC LIMIT 50`,
      [user.id],
    );
    return res.status(200).json({ current: POLICY_VERSIONS, history, available: true });
  } catch (err) {
    if (missingTable(err)) return res.status(200).json({ current: POLICY_VERSIONS, history: [], available: false });
    console.error('me/consents read failed:', (err as Error)?.message);
    return res.status(500).json({ error: 'Failed to load consents' });
  }
}

export default withSentry(handler);
