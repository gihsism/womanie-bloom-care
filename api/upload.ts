import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
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

  // Handle client token generation for @vercel/blob client upload
  if (req.method === 'POST') {
    try {
      const { handleUpload } = await import('@vercel/blob/client');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());

      const jsonResponse = await handleUpload({
        body,
        request: req as any,
        onBeforeGenerateToken: async () => ({
          allowedContentTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
          maximumSizeInBytes: 200 * 1024 * 1024,
        }),
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

  // Direct server-side upload via PUT
  if (req.method === 'PUT') {
    try {
      const filename = (req.query.filename as string) || `upload-${Date.now()}`;

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
