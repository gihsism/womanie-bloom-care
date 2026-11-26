import { sendPush, vapidConfig } from './push-send.js';
import { parsePrefs, type SubscriptionRow } from './push-schedule.js';

// Shared rules for documents a doctor sends into a patient's Records
// (lab report, referral letter, image). Used by /api/upload (the Blob
// upload token), /api/docs/from-doctor (registering the file as her
// health_document) and /api/analyze-document (analysing it).

type Query = (text: string, params: unknown[]) => Promise<unknown[]>;

// The same limits as the patient's own upload (DocumentUpload.tsx and the
// token in /api/upload): one list so the two can never drift apart.
export const DOCUMENT_UPLOAD_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
export const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024;
export const MAX_DOCTOR_NOTE_CHARS = 500;

/**
 * True only when this account still holds the doctor role AND has an
 * APPROVED connection to the patient. A revoked doctor keeps her old
 * connection rows (the admin revoke deletes only the role), and a pending
 * connection is not consent yet, so both are refused.
 */
export async function hasApprovedDoctorAccess(query: Query, doctorId: string, patientId: string): Promise<boolean> {
  if (!doctorId || !patientId || doctorId === patientId) return false;
  const rows = await query(
    `SELECT c.id FROM doctor_patient_connections c
       JOIN user_roles r ON r.user_id = c.doctor_id AND r.role = 'doctor'
      WHERE c.doctor_id = $1 AND c.patient_id = $2 AND c.status = 'approved'
      LIMIT 1`,
    [doctorId, patientId],
  );
  return rows.length > 0;
}

/** Display name for "Dr X added a document" (never the patient-facing file name). */
export function doctorDisplayName(fullName: string | null | undefined): string {
  const name = (fullName || '').trim();
  if (!name) return 'Your doctor';
  return /^dr\.?\s/i.test(name) ? name : `Dr ${name}`;
}

/** Strips path parts and control characters from a client-sent file name. */
export function cleanFileName(raw: unknown): string {
  const base = String(raw ?? '').split(/[\\/]/).pop() || '';
  // eslint-disable-next-line no-control-regex -- stripping control chars is the point
  return base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'document';
}

// Lock-screen wording stays discreet: the doctor's name only, never the
// document's name or type.
export function doctorDocumentPayload(doctorName: string, documentId: string) {
  return {
    title: 'Womanie',
    body: `${doctorName} added a document`,
    url: '/dashboard/notifications',
    tag: `doctor-doc-${documentId}`,
  };
}

/**
 * Push to the patient's OWN devices that keep "documents" on. Best effort:
 * never throws, so a push failure can't fail the upload. With no VAPID keys
 * (push off) it returns at once without touching the database.
 */
export async function notifyPatientOfDocument(
  query: Query,
  patientId: string,
  doctorName: string,
  documentId: string,
): Promise<number> {
  try {
    const cfg = vapidConfig();
    if (!cfg || !patientId) return 0;
    const subs = (await query(
      'SELECT id, user_id, endpoint, p256dh, auth, timezone, prefs FROM push_subscriptions WHERE user_id = $1',
      [patientId],
    )) as SubscriptionRow[];
    const payload = doctorDocumentPayload(doctorName, documentId);
    let sent = 0;
    for (const s of subs) {
      if (s.user_id !== patientId) continue;
      if (!parsePrefs(s.prefs).documents) continue;
      const r = await sendPush(cfg, s, payload);
      if (r === 'sent') sent++;
      if (r === 'gone') {
        await query('DELETE FROM push_subscriptions WHERE id = $1 AND user_id = $2', [s.id, patientId]).catch(() => undefined);
      }
    }
    return sent;
  } catch (err) {
    console.error('doctor-documents push failed:', (err as Error)?.message);
    return 0;
  }
}
