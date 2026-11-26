import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from './_lib/auth.js';
import { withSentry } from './_lib/sentry.js';
import { documentUploadAccess } from './_lib/blob-read.js';
import { DOCUMENT_UPLOAD_TYPES, MAX_DOCUMENT_BYTES, hasApprovedDoctorAccess } from './_lib/doctor-documents.js';

// A doctor sending a document into a patient's Records uploads into the
// PATIENT's folder (<patient id>/...), because /api/docs/file and
// /api/docs/delete only serve or erase a blob inside the owner's folder.
// She names the patient in the client payload; the token is only issued
// when she still holds the doctor role AND her connection is approved.
export function payloadPatientId(clientPayload: string | null | undefined): string | null {
  if (!clientPayload) return null;
  try {
    const p = JSON.parse(clientPayload) as { forPatient?: unknown };
    const id = typeof p?.forPatient === 'string' ? p.forPatient.trim() : '';
    return id && id.length <= 100 && !/[/\\]|\.\./.test(id) ? id : null;
  } catch {
    return null;
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};
const AVATAR_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-file-name, x-user-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Which access mode the browser should upload with ('private' once the
  // owner sets BLOB_DOCUMENT_ACCESS=private for a store that supports it).
  // The client picks the access mode in @vercel/blob's upload(), so it asks
  // here first instead of hard-coding it.
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ access: documentUploadAccess() });
  }

  // Handle client token generation for @vercel/blob client upload.
  // We also validate the requested pathname starts with the session user's
  // id — otherwise an authenticated Bob could ask for a token to upload
  // under Alice's prefix and later claim her storage quota or files.
  if (req.method === 'POST') {
    try {
      const { handleUpload } = await import('@vercel/blob/client');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());

      const jsonResponse = await handleUpload({
        body,
        request: req as unknown as Request,
        onBeforeGenerateToken: async (pathname: string, clientPayload: string | null) => {
          let ownerId = user.id;
          const forPatient = payloadPatientId(clientPayload);
          if (forPatient && forPatient !== user.id) {
            const { neon } = await import('@neondatabase/serverless');
            const sql = neon(process.env.DATABASE_URL!);
            const query = (text: string, params: unknown[]) => sql.query(text, params) as Promise<unknown[]>;
            if (!(await hasApprovedDoctorAccess(query, user.id, forPatient))) {
              throw new Error('Forbidden: no approved connection to this patient');
            }
            ownerId = forPatient;
          }
          if (!pathname.startsWith(`${ownerId}/`) || pathname.includes('/../')) {
            throw new Error('Forbidden: pathname must be scoped to session user');
          }
          return {
            // Same limits for a doctor's upload as for the patient's own.
            allowedContentTypes: DOCUMENT_UPLOAD_TYPES,
            maximumSizeInBytes: MAX_DOCUMENT_BYTES,
            // Older blobs are public (readable by anyone holding the URL),
            // so the URL must be unguessable: without a random suffix it was
            // <user id>/<ms timestamp>-<original file name>. The URL itself
            // never reaches a client again (reads go through /api/docs/file).
            addRandomSuffix: true,
            tokenPayload: JSON.stringify({ userId: user.id, ownerId }),
          };
        },
        onUploadCompleted: async ({ blob }) => {
          // No URL in the log: a public Blob URL is the file's only access key.
          console.log('Upload completed:', blob.contentType);
        },
      });

      return res.status(200).json(jsonResponse);
    } catch (error: unknown) {
      console.error('Upload handler error:', error);
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Upload failed' });
    }
  }

  // Legacy direct server-side upload via PUT. Kept for emergencies and to
  // avoid breaking any external caller, but also scoped to the session user.
  // Its only caller is the doctor avatar upload (JPG/PNG/WebP, max 5 MB),
  // and it hands back a public Blob URL, so it takes nothing else: no HTML,
  // SVG or scripts hosted on the store's domain, no unbounded sizes.
  if (req.method === 'PUT') {
    const requestedName = (req.query.filename as string) || '';
    const declaredType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = (requestedName.split('.').pop() || '').toLowerCase();
    if (!AVATAR_TYPES[declaredType] || !AVATAR_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: 'Only JPG, PNG or WebP images can be uploaded here' });
    }
    const length = Number(req.headers['content-length']);
    if (!req.headers['content-length'] || !Number.isFinite(length)) {
      return res.status(411).json({ error: 'Content-Length required' });
    }
    if (length > MAX_AVATAR_BYTES) {
      return res.status(413).json({ error: 'Image must be 5 MB or smaller' });
    }
    try {
      // Per-call UUID avoids collisions when two uploads land in the
      // same millisecond — `Date.now()` produced identical paths under
      // concurrency, which Vercel Blob would silently overwrite.
      const requested = (req.query.filename as string) || `upload-${crypto.randomUUID()}`;
      const filename = requested.startsWith(`${user.id}/`) ? requested : `${user.id}/${requested}`;

      const blob = await put(filename, req, {
        access: documentUploadAccess(),
        addRandomSuffix: true,
        contentType: AVATAR_TYPES[declaredType],
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      return res.status(200).json({ url: blob.url, pathname: blob.pathname });
    } catch (error) {
      console.error('PUT upload error:', error);
      return res.status(500).json({ error: 'Upload failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withSentry(handler);
