import { put, del } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'DELETE') {
    try {
      const { url } = req.body || {};
      if (url) await del(url);
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Delete failed' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Read raw body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);

    const fileName = req.headers['x-file-name'] as string || `upload-${Date.now()}`;
    const userId = req.headers['x-user-id'] as string || 'unknown';

    const blob = await put(`${userId}/${fileName}`, body, {
      access: 'public',
    });

    return res.status(200).json({ url: blob.url, pathname: blob.pathname });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
}
