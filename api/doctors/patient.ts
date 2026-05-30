import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';

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
  // connection to the target patient.
  const conn = await sql.query(
    `SELECT id FROM doctor_patient_connections
       WHERE doctor_id = $1 AND patient_id = $2 AND status = 'approved'
       LIMIT 1`,
    [doctor.id, patientId]
  ) as unknown[];
  if (conn.length === 0) {
    return res.status(403).json({ error: 'No approved connection to this patient' });
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
           ORDER BY signal_date DESC`,
        [patientId, signalCutoff]
      ),
      sql.query(
        `SELECT id, file_name, mime_type, ai_suggested_name, ai_summary,
                ai_suggested_category, uploaded_at, document_type
           FROM health_documents
          WHERE user_id = $1
          ORDER BY uploaded_at DESC`,
        [patientId]
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
           ORDER BY created_at DESC`,
        [doctor.id, patientId]
      ),
      sql.query(
        `SELECT * FROM appointments
           WHERE doctor_id = $1 AND patient_id = $2
           ORDER BY scheduled_at DESC`,
        [doctor.id, patientId]
      ),
      // Period records — used by the doctor's lab view to tag each
      // cycle-hormone reading with the cycle phase it was drawn in.
      // Limited to the last 2 years; older history isn't useful for
      // mapping recent labs and keeps the payload tight.
      sql.query(
        `SELECT period_start_date, cycle_length FROM period_tracking
          WHERE user_id = $1 AND period_start_date >= NOW() - INTERVAL '2 years'
          ORDER BY period_start_date ASC`,
        [patientId]
      ),
    ]) as [unknown[], unknown[], unknown[], unknown[], unknown[], unknown[], unknown[]];

    return res.status(200).json({
      profile: profileRows[0] ?? null,
      healthSignals: signalRows,
      documents: docRows,
      medicalData: extractedRows,
      notes: noteRows,
      appointments: apptRows,
      periodRecords: periodRows,
    });
  } catch (error) {
    console.error('doctors/patient error:', error);
    return res.status(500).json({ error: 'Failed to load patient data' });
  }
}

export default withSentry(handler);
