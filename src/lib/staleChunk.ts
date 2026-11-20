// After a deploy, a page that was already open (or an old cached index)
// can ask for a code chunk from the previous version that no longer
// exists. The import fails and the error screen shows. The fix is simply
// to reload once so the page picks up the new version. The guard stops a
// reload loop if the chunk is genuinely unreachable (offline, outage).

const KEY = 'womanie_stale_chunk_reload';
const WINDOW_MS = 60_000;

export function isStaleChunkError(err: unknown): boolean {
  const msg = String((err as { message?: string } | null)?.message ?? err ?? '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed/i.test(msg);
}

/** Reload once; returns false (and does nothing) if we already reloaded within the last minute. */
export function reloadOnceForStaleChunk(now = Date.now(), reload: () => void = () => window.location.reload()): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (last && now - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch {
    return false; // no storage: don't risk a loop
  }
  reload();
  return true;
}
