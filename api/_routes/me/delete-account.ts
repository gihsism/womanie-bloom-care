import { neon } from '@neondatabase/serverless';
import { del, list } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { hashSubject } from '../../_lib/ratelimit.js';

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
    // Resolve the canonical email before the transaction erases auth_users,
    // so we can also unsubscribe from the newsletter (keyed by email, not
    // user_id — otherwise deleting the account silently leaves the email on
    // the mailing list, violating GDPR right to erasure).
    const emailRows = await sql.query(
      'SELECT email FROM auth_users WHERE id = $1',
      [user.id]
    ) as Array<{ email: string }>;
    const canonicalEmail = emailRows[0]?.email ?? null;

    // user_app_data arrives with migration 011. Only include it once the
    // table exists, so a deploy that lands before the migration can't make
    // the whole deletion transaction fail.
    // Same for visit_questions (migration 012).
    // Same for pending_jobs (005; also cascades from health_documents) and
    // rate_limit_counters (014).
    const appDataRows = await sql.query(
      "SELECT to_regclass('public.user_app_data') IS NOT NULL AS present, to_regclass('public.visit_questions') IS NOT NULL AS visit_questions, to_regclass('public.pending_jobs') IS NOT NULL AS pending_jobs, to_regclass('public.rate_limit_counters') IS NOT NULL AS rate_limit_counters, to_regclass('public.push_subscriptions') IS NOT NULL AS push_subscriptions, to_regclass('public.birth_plans') IS NOT NULL AS birth_plans, to_regclass('public.admin_audit_log') IS NOT NULL AS admin_audit_log, to_regclass('public.doctor_invites') IS NOT NULL AS doctor_invites, to_regclass('public.consent_log') IS NOT NULL AS consent_log"
    ) as Array<{ present?: boolean; visit_questions?: boolean; pending_jobs?: boolean; rate_limit_counters?: boolean; push_subscriptions?: boolean; birth_plans?: boolean; admin_audit_log?: boolean; doctor_invites?: boolean; consent_log?: boolean }>;
    const hasAppData = appDataRows[0]?.present === true;
    const hasVisitQuestions = appDataRows[0]?.visit_questions === true;
    const hasPendingJobs = appDataRows[0]?.pending_jobs === true;
    const hasRateLimits = appDataRows[0]?.rate_limit_counters === true;
    const hasPush = appDataRows[0]?.push_subscriptions === true; // migration 015
    const hasBirthPlans = appDataRows[0]?.birth_plans === true; // migration 020
    const hasAdminAudit = appDataRows[0]?.admin_audit_log === true; // migration 023
    const hasDoctorInvites = appDataRows[0]?.doctor_invites === true; // migration 023
    const hasConsentLog = appDataRows[0]?.consent_log === true; // migration 024
    const lowerEmail = canonicalEmail ? canonicalEmail.toLowerCase() : null;
    // admin_audit_log rows about her are KEPT (proof of which doctor licence
    // an admin approved or rejected, and when, must outlive the account) but
    // pseudonymised: her id becomes a one-way hash, and her email, licence
    // number and free-text reasons / notes are removed. Rows where she was
    // the acting admin keep the admin id and lose only the email.
    const erasedSubject = 'erased:' + hashSubject(user.id);
    // Rate-limit rows are keyed by hashed user id / sign-in email.
    const rateLimitSubjects = [user.id, ...(canonicalEmail ? [canonicalEmail.toLowerCase()] : [])].map(hashSubject);

    // Tables to wipe, in dependency order: children first, parents
    // last. The transaction commits atomically so we never leave a
    // half-deleted user behind.
    await sql.transaction([
      ...(hasPendingJobs ? [sql`DELETE FROM pending_jobs WHERE user_id = ${user.id}`] : []),
      sql`DELETE FROM medical_extracted_data WHERE user_id = ${user.id}`,
      sql`DELETE FROM document_analyses WHERE user_id = ${user.id}`,
      sql`DELETE FROM health_documents WHERE user_id = ${user.id}`,
      sql`DELETE FROM daily_health_signals WHERE user_id = ${user.id}`,
      sql`DELETE FROM period_tracking WHERE user_id = ${user.id}`,
      sql`DELETE FROM ivf_events WHERE user_id = ${user.id}`,
      sql`DELETE FROM life_events WHERE user_id = ${user.id}`,
      sql`DELETE FROM medications WHERE user_id = ${user.id}`,
      sql`DELETE FROM birth_records WHERE user_id = ${user.id}`,
      sql`DELETE FROM babies WHERE user_id = ${user.id}`,
      ...(hasAppData ? [sql`DELETE FROM user_app_data WHERE user_id = ${user.id}`] : []),
      ...(hasVisitQuestions ? [sql`DELETE FROM visit_questions WHERE user_id = ${user.id}`] : []),
      ...(hasBirthPlans ? [sql`DELETE FROM birth_plans WHERE user_id = ${user.id}`] : []),
      ...(hasPush ? [sql`DELETE FROM push_subscriptions WHERE user_id = ${user.id}`, sql`DELETE FROM push_sent_log WHERE user_id = ${user.id}`] : []),
      ...(hasConsentLog ? [sql`DELETE FROM consent_log WHERE user_id = ${user.id}`] : []),
      ...(hasDoctorInvites ? [sql`DELETE FROM doctor_invites WHERE used_by_user_id = ${user.id} OR lower(email) = ${lowerEmail}`] : []),
      ...(hasAdminAudit ? [
        sql`UPDATE admin_audit_log
               SET target_user_id = ${erasedSubject},
                   target_email = NULL,
                   detail = CASE WHEN detail IS NULL THEN NULL
                                 ELSE detail - 'license_number' - 'reason' - 'note' - 'email' - 'name' END
             WHERE target_user_id = ${user.id} OR lower(target_email) = ${lowerEmail}`,
        sql`UPDATE admin_audit_log SET admin_email = NULL WHERE admin_user_id = ${user.id}`,
      ] : []),
      sql`DELETE FROM chat_messages WHERE user_id = ${user.id}`,
      sql`DELETE FROM patient_access_codes WHERE patient_id = ${user.id}`,
      sql`DELETE FROM doctor_patient_connections WHERE patient_id = ${user.id} OR doctor_id = ${user.id}`,
      sql`DELETE FROM doctor_notes WHERE doctor_id = ${user.id} OR patient_id = ${user.id}`,
      sql`DELETE FROM appointments WHERE patient_id = ${user.id} OR doctor_id = ${user.id}`,
      sql`DELETE FROM chart_access_log WHERE patient_id = ${user.id} OR doctor_id = ${user.id}`,
      sql`DELETE FROM doctor_schedule WHERE doctor_id = ${user.id}`,
      sql`DELETE FROM consultation_settings WHERE doctor_id = ${user.id}`,
      sql`DELETE FROM doctor_profiles WHERE user_id = ${user.id}`,
      sql`DELETE FROM user_roles WHERE user_id = ${user.id}`,
      sql`DELETE FROM profiles WHERE id = ${user.id}`,
      sql`DELETE FROM auth_sessions WHERE user_id = ${user.id}`,
      ...(canonicalEmail ? [sql`DELETE FROM newsletter_subscribers WHERE email = ${canonicalEmail}`] : []),
      // llm_cache has no user_id column; summary and panel-summary entries
      // are keyed by a prefix that embeds the user id, so we wipe them with
      // LIKE. analyze-document entries are content-addressed with no user id
      // in the key and may be shared with other users, so we leave them.
      sql`DELETE FROM llm_cache WHERE request_hash LIKE ${'summary_v1:' + user.id + ':%'}`,
      sql`DELETE FROM llm_cache WHERE request_hash LIKE ${'panel_summary_v1:' + user.id + ':%'}`,
      ...(hasRateLimits ? [sql`DELETE FROM rate_limit_counters WHERE subject_hash = ANY(${rateLimitSubjects})`] : []),
      sql`DELETE FROM auth_users WHERE id = ${user.id}`,
    ]);

    // Best-effort blob cleanup. We use @vercel/blob's `list` prefix to
    // find everything under the user's namespace and delete in a
    // batch. Swallow errors: the DB is already consistent, and an
    // orphaned blob is not user-impacting.
    try {
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      if (token) {
        // list() returns one page (up to 1000 blobs); walk every page so a
        // heavy uploader's older files don't outlive her account.
        let cursor: string | undefined;
        for (let page = 0; page < 100; page++) {
          const result = await list({ prefix: `${user.id}/`, token, cursor });
          const urls = result.blobs.map(b => b.url);
          if (urls.length > 0) {
            await del(urls, { token });
          }
          if (!result.hasMore || !result.cursor) break;
          cursor = result.cursor;
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
