import { neon } from '@neondatabase/serverless';
import { del, list } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// GDPR right-to-erasure.
//
// Deletes everything Womanie holds on the session user in one neon
// transaction, then best-effort removes their blob storage, then
// clears the session cookie. The client is expected to redirect to /
// on success — there's nothing left to render on authenticated pages.
//
// Irrevocable. To guard against an accidental POST (e.g. a misclicked
// button) we require the caller to send `confirm: "DELETE MY
// ACCOUNT"` as an explicit string in the body.

const CONFIRM_PHRASE = 'DELETE MY ACCOUNT';

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { confirm } = (req.body ?? {}) as { confirm?: string };
  if (confirm !== CONFIRM_PHRASE) {
    return res.status(400).json({
      error: `Confirmation required. Send { "confirm": "${CONFIRM_PHRASE}" } to proceed.`,
    });
  }

  const sql = neon(process.env.DATABASE_URL!);

  try {
    // Tables to wipe, in dependency order: children first, parents
    // last. The transaction commits atomically so we never leave a
    // half-deleted user behind.
    await sql.transaction([
      sql`DELETE FROM medical_extracted_data WHERE user_id = ${user.id}`,
      sql`DELETE FROM document_analyses WHERE user_id = ${user.id}`,
      sql`DELETE FROM health_documents WHERE user_id = ${user.id}`,
      sql`DELETE FROM daily_health_signals WHERE user_id = ${user.id}`,
      sql`DELETE FROM period_tracking WHERE user_id = ${user.id}`,
      sql`DELETE FROM ivf_events WHERE user_id = ${user.id}`,
      sql`DELETE FROM chat_messages WHERE user_id = ${user.id}`,
      sql`DELETE FROM patient_access_codes WHERE patient_id = ${user.id}`,
      sql`DELETE FROM doctor_patient_connections WHERE patient_id = ${user.id} OR doctor_id = ${user.id}`,
      sql`DELETE FROM doctor_notes WHERE doctor_id = ${user.id} OR patient_id = ${user.id}`,
      sql`DELETE FROM appointments WHERE patient_id = ${user.id} OR doctor_id = ${user.id}`,
      sql`DELETE FROM doctor_schedule WHERE doctor_id = ${user.id}`,
      sql`DELETE FROM consultation_settings WHERE doctor_id = ${user.id}`,
      sql`DELETE FROM doctor_profiles WHERE user_id = ${user.id}`,
      sql`DELETE FROM user_roles WHERE user_id = ${user.id}`,
      sql`DELETE FROM profiles WHERE id = ${user.id}`,
      sql`DELETE FROM auth_sessions WHERE user_id = ${user.id}`,
      sql`DELETE FROM auth_users WHERE id = ${user.id}`,
    ]);

    // Best-effort blob cleanup. We use @vercel/blob's `list` prefix to
    // find everything under the user's namespace and delete in a
    // batch. Swallow errors: the DB is already consistent, and an
    // orphaned blob is not user-impacting.
    try {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (token) {
        const result = await list({ prefix: `${user.id}/`, token });
        const urls = result.blobs.map(b => b.url);
        if (urls.length > 0) {
          await del(urls, { token });
        }
      }
    } catch (e) {
      console.warn('Blob cleanup after account delete failed:', e);
    }

    // Clear the session cookie so the client can't keep acting on a
    // now-deleted user.
    res.setHeader(
      'Set-Cookie',
      'womanie_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('me/delete-account error:', error);
    return res.status(500).json({ error: 'Delete failed. No data has been removed.' });
  }
}

export default withSentry(handler);
