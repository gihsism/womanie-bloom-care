import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { getAuthUser } from '../../_lib/auth.js';
import { withSentry } from '../../_lib/sentry.js';
import { isOwnBlobUrl } from '../../_lib/blob-url.js';
import { readBlob } from '../../_lib/blob-read.js';

// GET /api/docs/file?id=<health_documents.id>
//
// The only way a browser reads an uploaded health document. The Blob URL
// (health_documents.file_path) stays on the server: it is looked up by
// document id, never taken from the request, and must point into the
// document owner's own upload folder on Vercel Blob. Allowed readers:
//   - the patient who owns the document;
//   - a doctor with an APPROVED connection to that patient (logged to
//     chart_access_log, like every other doctor read of the chart).
// Everyone else gets the same 404 as for a missing document, so ids can't
// be probed.

// What we are willing to label a response as. Anything else is served as
// an octet-stream download, so a stored or sniffed type can never make the
// browser render HTML/SVG/script from our origin.
const INLINE_TYPES: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/heic': 'image/heic',
  'image/heif': 'image/heif',
};
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', docx: DOCX,
};

export function resolveContentType(
  storedMime: string | null | undefined,
  blobMime: string | null | undefined,
  fileName: string | null | undefined,
): { type: string; inline: boolean } {
  for (const raw of [storedMime, blobMime]) {
    const m = (raw || '').split(';')[0].trim().toLowerCase();
    if (INLINE_TYPES[m]) return { type: INLINE_TYPES[m], inline: true };
    if (m === DOCX) return { type: DOCX, inline: false };
  }
  const ext = ((fileName || '').split('.').pop() || '').toLowerCase();
  const byExt = BY_EXTENSION[ext];
  if (byExt) return { type: byExt, inline: byExt !== DOCX };
  return { type: 'application/octet-stream', inline: false };
}

// RFC 6266 header with an ASCII fallback and a UTF-8 filename*. Strips
// control characters, quotes, slashes and backslashes so the name can't
// break out of the header or carry a path.
export function contentDisposition(fileName: string | null | undefined, inline: boolean): string {
  const cleaned = (fileName || '')
    // eslint-disable-next-line no-control-regex -- stripping control chars is the point
    .replace(/[\u0000-\u001f\u007f"\\/]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150) || 'document';
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, '_');
  const utf8 = encodeURIComponent(cleaned).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  if (!id || id.length > 100) return res.status(400).json({ error: 'Missing document id' });

  const notFound = () => res.status(404).json({ error: 'Document not found' });
  const sql = neon(process.env.DATABASE_URL!);

  let doc: { user_id: string; file_path: string | null; file_name: string | null; mime_type: string | null } | undefined;
  try {
    const rows = await sql.query(
      'SELECT user_id, file_path, file_name, mime_type FROM health_documents WHERE id = $1 LIMIT 1',
      [id],
    ) as Array<typeof doc>;
    doc = rows[0];
  } catch {
    // e.g. an id that isn't a valid uuid: same answer as a missing row.
    return notFound();
  }
  if (!doc) return notFound();

  const ownerId = String(doc.user_id);
  if (ownerId !== user.id) {
    const conn = await sql.query(
      `SELECT id FROM doctor_patient_connections
         WHERE doctor_id = $1 AND patient_id = $2 AND status = 'approved'
         LIMIT 1`,
      [user.id, ownerId],
    ) as unknown[];
    if (conn.length === 0) return notFound();
    // Best-effort audit row, same as /api/doctors/patient: a logging
    // failure must not block care.
    try {
      await sql.query(
        `INSERT INTO chart_access_log (doctor_id, patient_id, surface) VALUES ($1, $2, 'document_file')`,
        [user.id, ownerId],
      );
    } catch (logErr) {
      console.error('docs/file: chart_access_log insert failed (non-fatal):', logErr);
    }
  }

  // file_path must be a Vercel Blob URL inside the owner's upload folder:
  // that both pins the fetch to Blob hosts and stops a row that was pointed
  // at someone else's file from serving it.
  const filePath = doc.file_path || '';
  if (!isOwnBlobUrl(filePath, ownerId)) {
    return res.status(404).json({ error: 'File not available' });
  }

  let blob;
  try {
    blob = await readBlob(filePath);
  } catch (err) {
    console.error('docs/file: blob read failed:', err instanceof Error ? err.name : 'unknown');
    return res.status(502).json({ error: 'Could not load the file' });
  }
  if (!blob) return res.status(404).json({ error: 'File not available' });

  const { type, inline } = resolveContentType(doc.mime_type, blob.contentType, doc.file_name);
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', contentDisposition(doc.file_name, inline));
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (Number.isFinite(blob.size) && blob.size >= 0) res.setHeader('Content-Length', String(blob.size));
  res.status(200);
  try {
    await pipeline(Readable.fromWeb(blob.stream as unknown as NodeWebReadableStream<Uint8Array>), res);
  } catch (err) {
    // Client went away mid-download, or the Blob stream broke; headers are
    // already sent, so all we can do is log and close.
    console.error('docs/file: stream aborted:', err instanceof Error ? err.name : 'unknown');
    res.end();
  }
}

export default withSentry(handler);
