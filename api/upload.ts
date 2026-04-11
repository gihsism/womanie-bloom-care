import { put, del } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Allow large file uploads (up to 100MB)
export const config = {
  api: { bodyParser: { sizeLimit: '100mb' } },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'DELETE') {
    try {
      const { url } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (url) await del(url);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Delete error:', error);
      return res.status(500).json({ error: 'Delete failed' });
    }
  }

  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const filename = req.query.filename as string;
    if (!filename) return res.status(400).json({ error: 'Missing filename' });

    const blob = await put(filename, req, {
      access: 'public',
    });

    return res.status(200).json({ url: blob.url, pathname: blob.pathname });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Upload failed' });
  }
}
