import { useEffect } from 'react';

// Keeps the screen on while `active` (e.g. contractions are being timed),
// where the browser supports the Screen Wake Lock API. The browser drops
// the lock when the tab is hidden, so it is re-requested when the app
// comes back to the front. Silently does nothing elsewhere.

interface WakeLockSentinelLike { release(): Promise<void>; released?: boolean }
interface WakeLockLike { request(type: 'screen'): Promise<WakeLockSentinelLike> }

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!active || !wl) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const s = await wl.request('screen');
        if (cancelled) void s.release().catch(() => undefined);
        else sentinel = s;
      } catch {
        // Denied (battery saver, tab hidden): the timer still works.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel) void sentinel.release().catch(() => undefined);
    };
  }, [active]);
}
