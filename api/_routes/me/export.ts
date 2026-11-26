import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';

// GDPR data-portability export.
//
// Returns a JSON document containing everything Womanie has stored on
// the session user — their profile, every uploaded document (with
// analyses), every extracted value, period / cycle / IVF records, and
// any doctor connections. Document file URLs are included so the
// caller can download the raw uploads alongside; we don't inline the
// bytes because PDF analyses can be tens of MB each.
//
// Doctor users also receive their professional data: doctor_profiles,
// authored doctor_notes, schedule, consultation settings, and
// chart_access_log entries. These are erased by delete-account; not
// exporting them would create an erasure-complete / portability-
// incomplete asymmetry that violates GDPR Article 20.

type Row = Record<string, unknown>;

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const [
      profile, authUser, documents, analyses, extracted,
      periods, signals, ivfEvents, connections, chatMessages,
      accessCodes, appointments, visibleDoctorNotes,
      doctorProfile, doctorNotes, doctorSchedule,
      consultationSettings, chartAccessLog,
      lifeEvents, medications, babies, birthRecords, appData, visitQuestions,
      roles, newsletter, analysisJobs, birthPlans, ivfPlan,
      sessions, pushSubscriptions, pushSentLog, consents, aiSummaries,
      documentsSentAsDoctor, adminAuditAboutMe, doctorInvites,
    ] = await Promise.all([
      sql.query('SELECT * FROM profiles WHERE id = $1', [user.id]),
      sql.query('SELECT id, email, name, created_at FROM auth_users WHERE id = $1', [user.id]),
      sql.query(
        `SELECT id, file_name, '/api/docs/file?id=' || id AS file_url, mime_type, document_type,
                ai_suggested_name, ai_suggested_category, ai_summary,
                uploaded_at, file_size,
                -- set when a connected doctor sent it (migration 021)
                to_jsonb(h)->>'uploaded_by_doctor_id' AS uploaded_by_doctor_id
           FROM health_documents h WHERE user_id = $1
           ORDER BY uploaded_at DESC`,
        [user.id]
      ),
      sql.query(
        `SELECT * FROM document_analyses WHERE user_id = $1
          ORDER BY created_at DESC`,
        [user.id]
      ),
      sql.query(
        `SELECT * FROM medical_extracted_data WHERE user_id = $1
          ORDER BY date_recorded DESC NULLS LAST, created_at DESC`,
        [user.id]
      ),
      sql.query(
        `SELECT * FROM period_tracking WHERE user_id = $1
          ORDER BY period_start_date DESC`,
        [user.id]
      ),
      sql.query(
        `SELECT * FROM daily_health_signals WHERE user_id = $1
          ORDER BY signal_date DESC`,
        [user.id]
      ),
      sql.query(
        `SELECT * FROM ivf_events WHERE user_id = $1 ORDER BY event_date DESC`,
        [user.id]
      ),
      sql.query(
        `SELECT * FROM doctor_patient_connections
           WHERE patient_id = $1 OR doctor_id = $1
           ORDER BY created_at DESC`,
        [user.id]
      ),
      // conversation_id groups turns into chats (migration 013); before
      // it is applied the export falls back to the columns that exist.
      Promise.resolve(sql.query(
        `SELECT role, content, model, conversation_id, created_at FROM chat_messages
           WHERE user_id = $1 ORDER BY created_at ASC`,
        [user.id]
      )).catch(() => sql.query(
        `SELECT role, content, model, created_at FROM chat_messages
           WHERE user_id = $1 ORDER BY created_at ASC`,
        [user.id]
      )),
      sql.query(
        `SELECT id, code, is_used, expires_at, created_at FROM patient_access_codes
           WHERE patient_id = $1 ORDER BY created_at DESC`,
        [user.id]
      ),
      sql.query(
        `SELECT id, doctor_id, scheduled_at, duration, consultation_type,
                status, payment_status, notes, created_at
           FROM appointments
           WHERE patient_id = $1
           ORDER BY scheduled_at DESC`,
        [user.id]
      ),
      // Only the doctor-authored notes the patient was meant to see.
      // Internal-only notes (is_visible_to_patient = FALSE) are
      // explicitly excluded — they belong to the doctor.
      sql.query(
        `SELECT id, doctor_id, title, content, note_type, created_at
           FROM doctor_notes
           WHERE patient_id = $1 AND is_visible_to_patient = TRUE
           ORDER BY created_at DESC`,
        [user.id]
      ),
      // Doctor-specific data. These return empty for patient-only accounts.
      sql.query('SELECT * FROM doctor_profiles WHERE user_id = $1', [user.id]),
      sql.query(
        `SELECT id, patient_id, title, content, note_type, is_visible_to_patient, created_at
           FROM doctor_notes WHERE doctor_id = $1 ORDER BY created_at DESC`,
        [user.id]
      ),
      sql.query(
        `SELECT * FROM doctor_schedule WHERE doctor_id = $1
           ORDER BY day_of_week, start_time`,
        [user.id]
      ),
      sql.query('SELECT * FROM consultation_settings WHERE doctor_id = $1', [user.id]),
      sql.query(
        `SELECT * FROM chart_access_log
           WHERE patient_id = $1 OR doctor_id = $1
           ORDER BY viewed_at DESC`,
        [user.id]
      ),
      sql.query('SELECT * FROM life_events WHERE user_id = $1 ORDER BY occurred_at DESC', [user.id]),
      sql.query('SELECT * FROM medications WHERE user_id = $1 ORDER BY created_at DESC', [user.id]),
      sql.query('SELECT * FROM babies WHERE user_id = $1 ORDER BY created_at', [user.id]),
      sql.query('SELECT * FROM birth_records WHERE user_id = $1 ORDER BY birth_at DESC NULLS LAST', [user.id]),
      // Migration 011; empty until it is applied rather than failing the export.
      Promise.resolve(sql.query('SELECT key, value, created_at, updated_at FROM user_app_data WHERE user_id = $1 ORDER BY key', [user.id]))
        .catch(() => []),
      // Migration 012; same fallback.
      Promise.resolve(sql.query('SELECT * FROM visit_questions WHERE user_id = $1 ORDER BY updated_at DESC', [user.id]))
        .catch(() => []),
      sql.query('SELECT role, created_at FROM user_roles WHERE user_id = $1 ORDER BY created_at', [user.id]),
      // Newsletter rows are keyed by email; join through the account so the
      // query is still bound to the session user.
      sql.query(
        `SELECT n.email, n.source, n.created_at, n.unsubscribed_at
           FROM newsletter_subscribers n JOIN auth_users u ON u.email = n.email
          WHERE u.id = $1`,
        [user.id]
      ),
      // Document-analysis retry ledger (migration 005).
      Promise.resolve(sql.query(
        'SELECT document_id, status, attempts, created_at, updated_at FROM pending_jobs WHERE user_id = $1 ORDER BY created_at DESC',
        [user.id]
      )).catch(() => []),
      // Birth plan (migration 020); empty until it is applied.
      Promise.resolve(sql.query('SELECT plan, shared_with_doctor, created_at, updated_at FROM birth_plans WHERE user_id = $1', [user.id]))
        .catch(() => []),
      // IVF treatment dates and trigger time (migration 022); empty until applied.
      Promise.resolve(sql.query('SELECT plan, trigger_at, trigger_timezone, created_at, updated_at FROM ivf_plans WHERE user_id = $1', [user.id]))
        .catch(() => []),
      // Sign-in sessions, without the session id (it identifies a live session).
      sql.query(
        `SELECT to_jsonb(s) - 'id' - 'user_id' AS session FROM auth_sessions s
          WHERE user_id = $1`,
        [user.id]
      ),
      // Phone-notification devices (migration 015). The endpoint URL and the
      // p256dh/auth keys are secrets that let anyone push to her phone, so
      // only the settings and the push service's host are exported.
      Promise.resolve(sql.query(
        `SELECT substring(endpoint from '^https?://([^/]+)') AS push_service, timezone, prefs,
                user_agent, created_at, updated_at, last_sent_at
           FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at`,
        [user.id]
      )).catch(() => []),
      Promise.resolve(sql.query(
        'SELECT key, sent_at FROM push_sent_log WHERE user_id = $1 ORDER BY sent_at DESC',
        [user.id]
      )).catch(() => []),
      // Privacy policy / terms acceptances (migration 024).
      Promise.resolve(sql.query(
        'SELECT document, version, accepted_at, source FROM consent_log WHERE user_id = $1 ORDER BY accepted_at',
        [user.id]
      )).catch(() => []),
      // AI summaries of her records cached under a key that embeds her id.
      Promise.resolve(sql.query(
        `SELECT split_part(request_hash, ':', 1) AS kind, response_text, model, created_at
           FROM llm_cache
          WHERE request_hash LIKE 'summary_v1:' || $1 || ':%'
             OR request_hash LIKE 'panel_summary_v1:' || $1 || ':%'
          ORDER BY created_at DESC`,
        [user.id]
      )).catch(() => []),
      // Doctor accounts: documents she sent into a patient's Records
      // (migration 021). The document itself belongs to the patient, so
      // only what she sent and when is listed.
      Promise.resolve(sql.query(
        `SELECT id, user_id AS patient_id, file_name, uploaded_at
           FROM health_documents WHERE uploaded_by_doctor_id = $1
          ORDER BY uploaded_at DESC`,
        [user.id]
      )).catch(() => []),
      // Admin decisions about her (doctor licence approved / rejected,
      // invite created or redeemed; migration 023). The deciding admin's
      // identity is not hers to export.
      Promise.resolve(sql.query(
        `SELECT action, target_email, detail, created_at FROM admin_audit_log
          WHERE target_user_id = $1
             OR lower(target_email) = (SELECT lower(email) FROM auth_users WHERE id = $1)
          ORDER BY created_at DESC`,
        [user.id]
      )).catch(() => []),
      // Doctor invitation links addressed to her (never the token hash).
      Promise.resolve(sql.query(
        `SELECT email, note, created_at, expires_at, used_at, revoked_at FROM doctor_invites
          WHERE used_by_user_id = $1
             OR lower(email) = (SELECT lower(email) FROM auth_users WHERE id = $1)
          ORDER BY created_at DESC`,
        [user.id]
      )).catch(() => []),
    ]) as Row[][];

    const payload = {
      exported_at: new Date().toISOString(),
      user: {
        ...(authUser[0] ?? {}),
        session_user_id: user.id,
      },
      profile: profile[0] ?? null,
      // Account roles ('patient' / 'doctor' / 'admin').
      user_roles: roles,
      newsletter_subscription: newsletter[0] ?? null,
      document_analysis_jobs: analysisJobs,
      documents,
      document_analyses: analyses,
      medical_extracted_data: extracted,
      period_tracking: periods,
      daily_health_signals: signals,
      ivf_events: ivfEvents,
      ivf_plan: ivfPlan[0] ?? null,
      doctor_patient_connections: connections,
      chat_messages: chatMessages,
      patient_access_codes: accessCodes,
      appointments,
      visible_doctor_notes: visibleDoctorNotes,
      chart_access_log: chartAccessLog,
      life_events: lifeEvents,
      medications,
      babies,
      birth_records: birthRecords,
      // Profile details, checklists and logs saved from the dashboard
      // (date of birth, hospital bag, weight and blood-pressure logs, ...).
      app_data: appData,
      // Questions saved for upcoming visits (shared with that visit's doctor).
      visit_questions: visitQuestions,
      // Birth plan wishes (shared with a connected doctor only if she chose to).
      birth_plan: birthPlans[0] ?? null,
      // Sign-in sessions (expiry), phone-notification devices and the
      // reminders already sent to them.
      sessions: sessions.map(r => r.session),
      push_subscriptions: pushSubscriptions,
      push_sent_log: pushSentLog,
      // When she accepted which version of the privacy policy / terms.
      consents,
      // AI-written summaries of her records, cached so they are not regenerated.
      ai_summaries: aiSummaries,
      // Admin decisions about her account and invitation links sent to her.
      admin_actions_about_me: adminAuditAboutMe,
      doctor_invites: doctorInvites,
      // Doctor-specific sections; empty arrays for patient-only accounts.
      doctor_profile: doctorProfile[0] ?? null,
      doctor_authored_notes: doctorNotes,
      doctor_schedule: doctorSchedule,
      consultation_settings: consultationSettings[0] ?? null,
      documents_sent_to_patients: documentsSentAsDoctor,
      notes: {
        documents_note:
          'The file_url field on each document downloads the original upload from Womanie while you are signed in (open https://womanie.info followed by that path).',
        retention_note:
          'To delete your account and erase this data from Womanie, use the Delete account action in Settings.',
      },
    };

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="womanie-export-${new Date().toISOString().split('T')[0]}.json"`
    );
    return res.status(200).json(payload);
  } catch (error) {
    console.error('me/export error:', error);
    return res.status(500).json({ error: 'Export failed' });
  }
}

export default withSentry(handler);
