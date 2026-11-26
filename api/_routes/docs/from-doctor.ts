import { neon } from '@neondatabase/serverless';
import { head } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { isOwnBlobUrl } from '../../_lib/blob-url.js';
import {
  DOCUMENT_UPLOAD_TYPES,
  MAX_DOCTOR_NOTE_CHARS,
  MAX_DOCUMENT_BYTES,
  cleanFileName,
  doctorDisplayName,
  hasApprovedDoctorAccess,
  notifyPatientOfDocument,
} from '../../_lib/doctor-documents.js';

// /api/docs/from-doctor — documents a doctor sends into a patient's Records.
//
// POST (doctor) { patientId, url, fileName, mimeType, documentType?, note? }
//   The browser has already uploaded the file to Vercel Blob with a token
//   from /api/upload ({ forPatient } payload), into the PATIENT's folder.
//   This registers it as a health_documents row owned by the patient,
//   marked uploaded_by_doctor_id, and pushes "Dr X added a document" to her
//   devices. The caller then starts the analysis (/api/analyze-document
//   lets the sending doctor do that for this one document).
//   Allowed only for an account that still holds the doctor role AND has
//   an APPROVED connection to the patient; everyone else gets 403.
//
// GET (patient) -> { documents: [{ id, doctor_name, note, uploaded_at }] }
//   Her documents that a doctor sent, with the sender's name, for the
//   "From Dr X" label in Records and the Notifications page. Scoped to the
//   session user; never returns file_path.

type Query = (text: string, params: unknown[]) => Promise<unknown[]>;

const DOCUMENT_TYPES = new Set([
  'Lab Result', 'Imaging Report', 'Medical Record', 'Prescription', 'Test Result',
  'Referral Letter', 'Letter', 'Labour / Birth Report', 'Hospital Discharge Summary', 'Other',
]);

function missingColumn(err: unknown): boolean {
  return /uploaded_by_doctor_id/.test(String((err as Error)?.message ?? ''));
}

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const sql = neon(process.env.DATABASE_URL!);
  const query: Query = (text, params) => sql.query(text, params) as Promise<unknown[]>;

  if (req.method === 'GET') {
    try {
      const rows = await query(
        `SELECT h.id, h.notes, h.uploaded_at, dp.full_name
           FROM health_documents h
           LEFT JOIN doctor_profiles dp ON dp.user_id = h.uploaded_by_doctor_id
          WHERE h.user_id = $1 AND h.uploaded_by_doctor_id IS NOT NULL
          ORDER BY h.uploaded_at DESC
          LIMIT 200`,
        [user.id],
      ) as Array<{ id: string; notes: string | null; uploaded_at: string | null; full_name: string | null }>;
      return res.status(200).json({
        documents: rows.map(r => ({
          id: r.id,
          doctor_name: doctorDisplayName(r.full_name),
          note: r.notes ?? null,
          uploaded_at: r.uploaded_at ?? null,
        })),
      });
    } catch (err) {
      // Before migration 020 nothing can have been sent: an empty list.
      if (missingColumn(err)) return res.status(200).json({ documents: [] });
      console.error('docs/from-doctor GET failed:', (err as Error)?.message);
      return res.status(500).json({ error: 'Could not load documents' });
    }
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const patientId = typeof body.patientId === 'string' ? body.patientId.trim() : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!patientId || patientId.length > 100 || !url) {
    return res.status(400).json({ error: 'Missing patient or file' });
  }

  // Consent gate first, before anything about the file is looked at.
  if (!(await hasApprovedDoctorAccess(query, user.id, patientId))) {
    return res.status(403).json({ error: 'No approved connection to this patient' });
  }

  // The file must sit in the patient's own upload folder on Vercel Blob
  // (where /api/upload put it), so /api/docs/file will serve it to her and
  // to connected doctors and /api/docs/delete can erase it.
  if (!isOwnBlobUrl(url, patientId)) {
    return res.status(400).json({ error: 'Invalid file' });
  }

  const fileName = cleanFileName(body.fileName);
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const declared = String(body.mimeType ?? '').split(';')[0].trim().toLowerCase();

  // Same type and size limits as the patient's own upload, checked on the
  // stored blob itself (not only on what the browser says).
  let blobType = '';
  let blobSize = 0;
  try {
    const meta = await head(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    blobType = String(meta.contentType || '').split(';')[0].trim().toLowerCase();
    blobSize = Number(meta.size);
  } catch {
    return res.status(400).json({ error: 'File not found' });
  }
  const mimeType = DOCUMENT_UPLOAD_TYPES.includes(blobType) ? blobType : DOCUMENT_UPLOAD_TYPES.includes(declared) ? declared : '';
  if (!mimeType || !['pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)) {
    return res.status(400).json({ error: 'Please send a PDF, DOCX or image (JPG, PNG, WebP, HEIC).' });
  }
  if (!Number.isFinite(blobSize) || blobSize <= 0 || blobSize > MAX_DOCUMENT_BYTES) {
    return res.status(413).json({ error: 'File must be 200 MB or smaller' });
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_DOCTOR_NOTE_CHARS) : '';
  const documentType = typeof body.documentType === 'string' && DOCUMENT_TYPES.has(body.documentType)
    ? body.documentType
    : 'Medical Record';

  let doc: { id: string; file_name: string; mime_type: string; uploaded_at: string | null; document_type: string } | undefined;
  try {
    const rows = await query(
      `INSERT INTO health_documents
         (user_id, file_name, file_path, document_type, file_size, mime_type, notes, uploaded_by_doctor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, file_name, mime_type, uploaded_at, document_type`,
      [patientId, fileName, url, documentType, blobSize, mimeType, note || null, user.id],
    ) as Array<typeof doc>;
    doc = rows[0];
  } catch (err) {
    if (missingColumn(err)) {
      return res.status(503).json({ error: 'Sending documents is not available yet' });
    }
    console.error('docs/from-doctor insert failed:', (err as Error)?.message);
    return res.status(500).json({ error: 'Could not save the document' });
  }
  if (!doc) return res.status(500).json({ error: 'Could not save the document' });

  // Audit trail: a write into her chart, logged like every doctor read.
  try {
    await query(
      `INSERT INTO chart_access_log (doctor_id, patient_id, surface) VALUES ($1, $2, 'document_sent')`,
      [user.id, patientId],
    );
  } catch (logErr) {
    console.error('docs/from-doctor: chart_access_log insert failed (non-fatal):', (logErr as Error)?.message);
  }

  let doctorName = 'Your doctor';
  try {
    const nameRows = await query('SELECT full_name FROM doctor_profiles WHERE user_id = $1 LIMIT 1', [user.id]) as Array<{ full_name: string | null }>;
    doctorName = doctorDisplayName(nameRows[0]?.full_name);
  } catch { /* keep the generic name */ }
  await notifyPatientOfDocument(query, patientId, doctorName, doc.id);

  return res.status(200).json({
    document: {
      id: doc.id,
      file_name: doc.file_name,
      has_file: true,
      mime_type: doc.mime_type,
      document_type: doc.document_type,
      uploaded_at: doc.uploaded_at,
      notes: note || null,
      sent_by_me: true,
      ai_summary: null,
      ai_suggested_name: null,
      ai_suggested_category: null,
    },
  });
}

export default withSentry(handler);
