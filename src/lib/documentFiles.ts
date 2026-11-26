// Uploaded health documents: how the browser stores and opens them.
//
// The browser never holds a document's storage (Blob) URL after upload.
// Every open/download/preview goes through /api/docs/file by document id,
// which checks the session (owner, or a doctor with an approved
// connection) and streams the file.

/** Same-origin URL that serves a document's original file to an authorised session. */
export function documentFileUrl(documentId: string): string {
  return `/api/docs/file?id=${encodeURIComponent(documentId)}`;
}

/** Opens a document's original file in a new tab through the authorised proxy. */
export function openDocumentFile(documentId: string): void {
  window.open(documentFileUrl(documentId), '_blank', 'noopener,noreferrer');
}

type BlobAccess = 'public' | 'private';

// The server decides the access mode (GET /api/upload): 'private' once the
// store supports it, 'public' (random, never-exposed URL) until then.
async function uploadAccess(): Promise<BlobAccess> {
  try {
    const r = await fetch('/api/upload', { method: 'GET', credentials: 'same-origin' });
    if (r.ok) {
      const { access } = await r.json();
      if (access === 'private') return 'private';
    }
  } catch { /* fall through */ }
  return 'public';
}

/**
 * Uploads a document straight from the browser to Vercel Blob (bypasses the
 * 4.5 MB serverless body cap). If a private upload is refused (store not
 * set up for private blobs) it retries once as public so the patient's
 * upload never fails on configuration. Returns the Blob result; its URL
 * is written once to health_documents.file_path and never read back.
 */
export async function uploadDocumentBlob(pathname: string, file: File, clientPayload?: string): Promise<{ url: string }> {
  const { upload } = await import('@vercel/blob/client');
  const opts = { handleUploadUrl: '/api/upload', contentType: file.type, ...(clientPayload ? { clientPayload } : {}) };
  const access = await uploadAccess();
  if (access === 'private') {
    try {
      return await upload(pathname, file, { ...opts, access: 'private' });
    } catch (err) {
      console.warn('Private upload refused, retrying as public:', err instanceof Error ? err.name : err);
    }
  }
  return upload(pathname, file, { ...opts, access: 'public' });
}

// Upload limits shared by the patient's own upload and a doctor sending a
// document (the server enforces the same list and size in /api/upload).
export const DOCUMENT_MAX_BYTES = 200 * 1024 * 1024;
const DOCUMENT_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
];
const DOCUMENT_EXTS = ['pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

/** null when the file can be uploaded, else what to tell the user. */
export function documentFileProblem(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  if (file.size > DOCUMENT_MAX_BYTES) return 'Please select a file smaller than 200 MB.';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!DOCUMENT_EXTS.includes(ext) || (file.type && !DOCUMENT_MIMES.includes(file.type))) {
    return 'Please choose a PDF, DOCX or image (JPG, PNG, WebP, HEIC).';
  }
  return null;
}

export interface SentDocument {
  id: string;
  file_name: string;
  has_file: boolean;
  document_type: string;
  uploaded_at: string | null;
  notes: string | null;
  sent_by_me: true;
  ai_summary: null;
  ai_suggested_name: null;
}

/**
 * Doctor side: uploads a file into the patient's Records. The file goes to
 * the patient's own folder (the server checks the approved connection
 * before issuing the upload token), is registered as her document, and
 * its analysis is started like one of her own uploads.
 */
export async function sendDocumentToPatient(
  patientId: string,
  file: File,
  opts: { note?: string; documentType?: string } = {},
): Promise<SentDocument> {
  const safeName = file.name.replace(/[\\/]/g, '_');
  const blob = await uploadDocumentBlob(
    `${patientId}/${Date.now()}-${safeName}`,
    file,
    JSON.stringify({ forPatient: patientId }),
  );
  const r = await fetch('/api/docs/from-doctor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patientId,
      url: blob.url,
      fileName: file.name,
      mimeType: file.type,
      documentType: opts.documentType,
      note: opts.note,
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body?.document) throw new Error(body?.error || 'Could not send the document');
  const doc = body.document as SentDocument;
  // Fire-and-forget, same as the patient's own upload: the server reads the
  // file from the document row, and the patient's Records re-dispatch it
  // later (pending-retries) if this request is lost.
  fetch('/api/analyze-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentId: doc.id,
      userId: patientId,
      fileName: file.name,
      mimeType: file.type,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    keepalive: true,
  }).catch(() => undefined);
  return doc;
}

/** One of her documents a connected doctor sent (GET /api/docs/from-doctor). */
export interface DoctorSentDocument {
  id: string;
  doctor_name: string;
  note: string | null;
  uploaded_at: string | null;
}

export const DOCTOR_DOC_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Doctor-sent documents from the last 14 days, newest first: the in-app notice. */
export function recentDoctorDocuments(docs: DoctorSentDocument[], now = Date.now()): DoctorSentDocument[] {
  const cutoff = now - DOCTOR_DOC_WINDOW_MS;
  return docs
    .filter(d => d.uploaded_at && Date.parse(d.uploaded_at) >= cutoff)
    .sort((a, b) => Date.parse(b.uploaded_at!) - Date.parse(a.uploaded_at!));
}

/** Her doctor-sent documents; empty on any failure (labels are best effort). */
export async function fetchDoctorSentDocuments(): Promise<DoctorSentDocument[]> {
  try {
    const r = await fetch('/api/docs/from-doctor');
    if (!r.ok) return [];
    const body = await r.json();
    return Array.isArray(body?.documents) ? body.documents as DoctorSentDocument[] : [];
  } catch {
    return [];
  }
}
