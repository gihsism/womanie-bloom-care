import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const body = req.body as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // Allow all uploads — add auth check here if needed
        return {
          allowedContentTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
          maximumSizeInBytes: 200 * 1024 * 1024, // 200MB
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
