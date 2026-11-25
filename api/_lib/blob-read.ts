import { get, type BlobAccessType } from '@vercel/blob';
import { isBlobUrl } from './blob-url.js';

// Server-side reads of uploaded health documents.
//
// Documents uploaded before private storage are public blobs
// (<store>.public.blob.vercel-storage.com); new ones may be private
// (<store>.private.blob.vercel-storage.com), which only answer with the
// store's read-write token. `get` sends that token either way, so one
// helper reads both kinds. The URL always comes from health_documents
// (server-side), never from a request.

export function blobAccessFor(url: string): BlobAccessType {
  try {
    return /\.private\.blob\.vercel-storage\.com$/i.test(new URL(url).hostname) ? 'private' : 'public';
  } catch {
    return 'public';
  }
}

export type BlobRead = {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
};

// null when the URL is not a Blob URL or the blob is gone.
export async function readBlob(url: string): Promise<BlobRead | null> {
  if (!isBlobUrl(url)) return null;
  const result = await get(url, {
    access: blobAccessFor(url),
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!result || result.statusCode !== 200) return null;
  return { stream: result.stream, contentType: result.blob.contentType, size: result.blob.size };
}

export async function readBlobBuffer(url: string): Promise<Buffer | null> {
  const blob = await readBlob(url);
  if (!blob) return null;
  return Buffer.from(await new Response(blob.stream).arrayBuffer());
}

// Which access mode new uploads use. 'private' only when the owner has
// switched it on (BLOB_DOCUMENT_ACCESS=private) after confirming the Blob
// store accepts private blobs; until then uploads stay public-with-random-
// suffix, which is no longer exposed because file_path never reaches a
// client. Anything else falls back to 'public' so a typo can't break uploads.
export function documentUploadAccess(): BlobAccessType {
  return (process.env.BLOB_DOCUMENT_ACCESS || '').trim().toLowerCase() === 'private' ? 'private' : 'public';
}
