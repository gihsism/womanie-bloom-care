import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';

// Scoped patient-data endpoint for doctors.
//
// A doctor can't fetch a patient's `profiles`, `daily_health_signals`,
// `health_documents` or `medical_extracted_data` rows through /api/db
// because the ownership enforcement pins user_id/id to the session
// user (the doctor), not the patient. This endpoint bridges that gap
// under strict consent: the doctor must have an approved row in
// doctor_patient_connections with the target patient before anything
// is returned.

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const doctor = await getAuthUser(req);
  if (!doctor) return res.status(401).json({ error: 'Unauthorized' });

  const patientId = typeof req.query.id === 'string' ? req.query.id : null;
  if (!patientId) return res.status(400).json({ error: 'Missing patient id' });

  const sql = neon(process.env.DATABASE_URL!);

  // Consent gate. Only proceed if this doctor has an approved
  // connection to the target patient AND still holds the doctor role:
  // an admin revoke deletes the role but leaves the connection rows, and
  // the patient consented to a verified doctor, not to the account.
  const conn = await sql.query(
    `SELECT c.id FROM doctor_patient_connections c
       JOIN user_roles r ON r.user_id = c.doctor_id AND r.role = 'doctor'
       WHERE c.doctor_id = $1 AND c.patient_id = $2 AND c.status = 'approved'
       LIMIT 1`,
    [doctor.id, patientId]
  ) as unknown[];
  if (conn.length === 0) {
    return res.status(403).json({ error: 'No approved connection to this patient' });
  }

  // Audit trail: one row per chart fetch, written server-side at the
  // single consent-gated chokepoint so it can't be skipped. The patient
  // reviews these from Settings (/api/me/chart-access). Best-effort —
  // a logging failure must not block care.
  try {
    await sql.query(
      `INSERT INTO chart_access_log (doctor_id, patient_id, surface) VALUES ($1, $2, 'patient_chart')`,
      [doctor.id, patientId]
    );
  } catch (logErr) {
    console.error('doctors/patient: chart_access_log insert failed (non-fatal):', logErr);
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const signalCutoff = thirtyDaysAgo.toISOString().split('T')[0];

  try {
    const [profileRows, signalRows, docRows, extractedRows, noteRows, apptRows, periodRows] = await Promise.all([
      sql.query('SELECT id, full_name, life_stage, pregnancy_due_date, ivf_phase FROM profiles WHERE id = $1', [patientId]),
      sql.query(
        `SELECT * FROM daily_health_signals
           WHERE user_id = $1 AND signal_date >= $2
           ORDER BY signal_date DESC
           LIMIT 200`,
        [patientId, signalCutoff]
      ),
      // The Blob URL (file_path) stays server-side: the chart's "Open"
      // button reads the file through /api/docs/file?id=, which re-checks
      // the approved connection and logs the read. has_file only says
      // whether there is anything to open. sent_by_me marks a document
      // this doctor sent into her Records ("Sent by you"); read through
      // to_jsonb so the chart works before migration 021 adds the column,
      // and other doctors' ids never leave the server.
      sql.query(
        `SELECT h.id, h.file_name, (h.file_path IS NOT NULL AND h.file_path <> '') AS has_file,
                h.mime_type, h.ai_suggested_name, h.ai_summary,
                h.ai_suggested_category, h.uploaded_at, h.document_type,
                COALESCE((to_jsonb(h) ->> 'uploaded_by_doctor_id') = $2, false) AS sent_by_me,
                CASE WHEN (to_jsonb(h) ->> 'uploaded_by_doctor_id') = $2 THEN h.notes END AS sent_note
           FROM health_documents h
          WHERE h.user_id = $1
          ORDER BY h.uploaded_at DESC
          LIMIT 500`,
        [patientId, doctor.id]
      ),
      sql.query(
        `SELECT id, document_id, title, value, unit, reference_range, status,
                data_type, date_recorded, notes, raw_data
           FROM current_extracted_data
          WHERE user_id = $1
          ORDER BY date_recorded DESC NULLS LAST
          LIMIT 500`,
        [patientId]
      ),
      sql.query(
        `SELECT * FROM doctor_notes
           WHERE doctor_id = $1 AND patient_id = $2
           ORDER BY created_at DESC
           LIMIT 500`,
        [doctor.id, patientId]
      ),
      sql.query(
        `SELECT * FROM appointments
           WHERE doctor_id = $1 AND patient_id = $2
           ORDER BY scheduled_at DESC
           LIMIT 500`,
        [doctor.id, patientId]
      ),
      // Period records — used by the doctor's lab view to tag each
      // cycle-hormone reading with the cycle phase it was drawn in.
      // Limited to the last 2 years; older history isn't useful for
      // mapping recent labs and keeps the payload tight.
      sql.query(
        `SELECT period_start_date, cycle_length FROM period_tracking
          WHERE user_id = $1 AND period_start_date >= NOW() - INTERVAL '2 years'
          ORDER BY period_start_date ASC
          LIMIT 100`,
        [patientId]
      ),
    ]) as [unknown[], unknown[], unknown[], unknown[], unknown[], unknown[], unknown[]];

    // Questions the patient saved for her upcoming visits with THIS doctor
    // (read-only here). Joined on the doctor's own appointments with this
    // patient, so a row the patient attached to some other visit never
    // shows. Best-effort: until migration 012 is applied the table does
    // not exist, and that must not break the chart.
    let visitQuestions: unknown[] = [];
    try {
      visitQuestions = await sql.query(
        `SELECT vq.appointment_id, vq.questions, vq.updated_at, a.scheduled_at
           FROM visit_questions vq
           JOIN appointments a ON a.id::text = vq.appointment_id AND a.patient_id = vq.user_id
          WHERE vq.user_id = $1 AND a.doctor_id = $2
            AND COALESCE(a.status, 'scheduled') <> 'cancelled'
            AND a.scheduled_at >= NOW() - INTERVAL '1 day'
          ORDER BY a.scheduled_at ASC
          LIMIT 50`,
        [patientId, doctor.id]
      ) as unknown[];
    } catch (vqErr) {
      console.error('doctors/patient: visit_questions read failed (non-fatal):', vqErr);
    }

    // Medicines she is currently taking (her own Medicine log, active rows
    // only). Read-only, scoped to the patient that passed the consent gate.
    // Best-effort like visit_questions: a read failure leaves the list
    // empty rather than blocking the chart.
    let medicines: unknown[] = [];
    try {
      medicines = await sql.query(
        `SELECT id, name, dose, times_per_day, started_on
           FROM medications
          WHERE user_id = $1 AND active IS NOT FALSE
          ORDER BY created_at ASC
          LIMIT 50`,
        [patientId]
      ) as unknown[];
    } catch (medErr) {
      console.error('doctors/patient: medications read failed (non-fatal):', medErr);
    }

    // Her birth plan (migration 020), read-only, and only when she ticked
    // "Show in my doctor's chart". Best-effort like visit_questions: until
    // the migration is applied the table does not exist.
    let birthPlan: unknown = null;
    try {
      const bp = await sql.query(
        `SELECT plan, updated_at FROM birth_plans
          WHERE user_id = $1 AND shared_with_doctor = true
          LIMIT 1`,
        [patientId]
      ) as unknown[];
      birthPlan = bp[0] ?? null;
    } catch (bpErr) {
      console.error('doctors/patient: birth_plans read failed (non-fatal):', bpErr);
    }

    return res.status(200).json({
      profile: profileRows[0] ?? null,
      healthSignals: signalRows,
      documents: docRows,
      medicalData: extractedRows,
      notes: noteRows,
      appointments: apptRows,
      periodRecords: periodRows,
      visitQuestions,
      medicines,
      birthPlan,
    });
  } catch (error) {
    console.error('doctors/patient error:', error);
    return res.status(500).json({ error: 'Failed to load patient data' });
  }
}

export default withSentry(handler);
