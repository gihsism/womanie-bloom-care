import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

// GDPR data-portability export.
//
// Returns a JSON document containing everything Womanie has stored on
// the session user — their profile, every uploaded document (with
// analyses), every extracted value, period / cycle / IVF records, and
// any doctor connections. Document file URLs are included so the
// caller can download the raw uploads alongside; we don't inline the
// bytes because PDF analyses can be tens of MB each.

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
    ] = await Promise.all([
      sql.query('SELECT * FROM profiles WHERE id = $1', [user.id]),
      sql.query('SELECT id, email, name, created_at FROM auth_users WHERE id = $1', [user.id]),
      sql.query(
        `SELECT id, file_name, file_path, mime_type, document_type,
                ai_suggested_name, ai_suggested_category, ai_summary,
                uploaded_at, file_size
           FROM health_documents WHERE user_id = $1
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
      sql.query(
        `SELECT role, content, model, created_at FROM chat_messages
           WHERE user_id = $1 ORDER BY created_at ASC`,
        [user.id]
      ),
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
    ]) as Row[][];

    const payload = {
      exported_at: new Date().toISOString(),
      user: {
        ...(authUser[0] ?? {}),
        session_user_id: user.id,
      },
      profile: profile[0] ?? null,
      documents,
      document_analyses: analyses,
      medical_extracted_data: extracted,
      period_tracking: periods,
      daily_health_signals: signals,
      ivf_events: ivfEvents,
      doctor_patient_connections: connections,
      chat_messages: chatMessages,
      patient_access_codes: accessCodes,
      appointments,
      visible_doctor_notes: visibleDoctorNotes,
      notes: {
        documents_note:
          'The file_path field on each document is a Vercel Blob URL — fetch those separately to download the original upload.',
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
