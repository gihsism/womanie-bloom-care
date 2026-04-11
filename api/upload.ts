import { put, del } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { IncomingForm } from 'formidable';
import fs from 'fs';

export const config = {
  api: { bodyParser: false },
};

function parseForm(req: VercelRequest): Promise<{ fields: any; files: any }> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ maxFileSize: 200 * 1024 * 1024 });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'DELETE') {
    // Read body for DELETE
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    try {
      const { url } = JSON.parse(Buffer.concat(chunks).toString());
      if (url) await del(url);
      return res.status(200).json({ success: true });
    } catch {
      return res.status(500).json({ error: 'Delete failed' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fields, files } = await parseForm(req);

    const uploadedFile = files.file?.[0] || files.file;
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const fileName = (fields.fileName?.[0] || fields.fileName || uploadedFile.originalFilename || `upload-${Date.now()}`);
    const userId = (fields.userId?.[0] || fields.userId || 'unknown');

    const fileBuffer = fs.readFileSync(uploadedFile.filepath);

    console.log(`Uploading ${fileName} for user ${userId}, size: ${fileBuffer.length}`);

    const blob = await put(`${userId}/${fileName}`, fileBuffer, {
      access: 'public',
    });

    // Clean up temp file
    fs.unlinkSync(uploadedFile.filepath);

    console.log(`Upload success: ${blob.url}`);
    return res.status(200).json({ url: blob.url, pathname: blob.pathname });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Upload failed' });
  }
}
