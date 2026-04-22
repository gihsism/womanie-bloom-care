import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from './_lib/auth.js';
import { withSentry } from './_lib/sentry.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-file-name, x-user-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

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
        request: req as any,
        onBeforeGenerateToken: async (pathname: string) => {
          if (!pathname.startsWith(`${user.id}/`)) {
            throw new Error('Forbidden: pathname must be scoped to session user');
          }
          return {
            allowedContentTypes: [
              'application/pdf',
              'image/jpeg',
              'image/png',
              'image/jpg',
              'image/webp',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            ],
            maximumSizeInBytes: 200 * 1024 * 1024,
            tokenPayload: JSON.stringify({ userId: user.id }),
          };
        },
        onUploadCompleted: async ({ blob }) => {
          console.log('Upload completed:', blob.url);
        },
      });

      return res.status(200).json(jsonResponse);
    } catch (error) {
      console.error('Upload handler error:', error);
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Upload failed' });
    }
  }

  // Legacy direct server-side upload via PUT. Kept for emergencies and to
  // avoid breaking any external caller, but also scoped to the session user.
  if (req.method === 'PUT') {
    try {
      const requested = (req.query.filename as string) || `upload-${Date.now()}`;
      const filename = requested.startsWith(`${user.id}/`) ? requested : `${user.id}/${requested}`;

      const blob = await put(filename, req, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      return res.status(200).json({ url: blob.url, pathname: blob.pathname });
    } catch (error) {
      console.error('PUT upload error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Upload failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withSentry(handler);
