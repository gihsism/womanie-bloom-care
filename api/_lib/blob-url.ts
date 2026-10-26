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
