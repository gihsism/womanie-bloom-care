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
export async function uploadDocumentBlob(pathname: string, file: File): Promise<{ url: string }> {
  const { upload } = await import('@vercel/blob/client');
  const opts = { handleUploadUrl: '/api/upload', contentType: file.type };
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
