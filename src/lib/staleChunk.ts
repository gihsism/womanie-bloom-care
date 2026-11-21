// After a deploy, a page that was already open (or an old copy of the page
// kept by the offline cache / service worker) can ask for a code chunk from
// the previous version that no longer exists. The import fails and the error
// screen shows. The fix is to reload so the page picks up the new version.
// A plain reload is not enough when the service worker keeps serving the old
// page, so the recovery also drops the offline cache first. The guard stops
// a reload loop if the chunk is genuinely unreachable (offline, outage).

const KEY = 'womanie_stale_chunk_reload';
const WINDOW_MS = 60_000;

export function isStaleChunkError(err: unknown): boolean {
  const msg = String((err as { message?: string } | null)?.message ?? err ?? '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed|'[\w$]+\._result\.default'|reading 'default'\)/i.test(msg);
}

/** Drop the service worker and its caches, then reload from the network. */
export async function hardReload(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(() => false)));
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k).catch(() => false)));
    }
  } catch {
    // best effort: reload anyway
  }
  window.location.reload();
}

/** Recover once; returns false (and does nothing) if we already tried within the last minute. */
export function reloadOnceForStaleChunk(now = Date.now(), reload: () => void = () => { void hardReload(); }): boolean {
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
