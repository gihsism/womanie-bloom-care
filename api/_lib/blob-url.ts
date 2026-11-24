// health_documents.file_path is written by the client, so before the server
// downloads it we require an https URL on Vercel Blob's storage domain.
// Anything else (internal hosts, metadata endpoints, other sites) is refused.
export function isBlobUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && /\.blob\.vercel-storage\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

// True only for a Blob URL inside the user's own upload folder
// (`<userId>/…`, the prefix /api/upload enforces). health_documents.file_path
// is client-writable through /api/db, so a server route that DELETES a blob
// by that URL must check it lands in the caller's folder; otherwise a user
// could point her own row at someone else's file and have it erased.
export function isOwnBlobUrl(raw: string, userId: string): boolean {
  if (!userId || !isBlobUrl(raw)) return false;
  try {
    const path = decodeURIComponent(new URL(raw).pathname);
    return path.startsWith(`/${userId}/`) && !path.includes('/../');
  } catch {
    return false;
  }
}
