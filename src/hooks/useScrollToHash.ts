import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Scroll to the #anchor once the section exists, and keep it in place while
// the page settles. The trackers above an anchor load their data after the
// page renders and grow, which pushed a #medicines / #guides section back
// down the page after the first scroll (live: Period tracking "Medicines"
// landed at the top of the page, the section ~2,900 px below). So for a few
// seconds we re-align whenever the section drifts — and stop as soon as the
// person scrolls, taps or types themselves.
export const SETTLE_MS = 3000;
const TICK_MS = 150;
const DRIFT_PX = 40;

export function useScrollToHash(ready: boolean) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    const id = decodeURIComponent(hash.slice(1));
    let stopped = false;
    let aligned = false;
    let target = 0; // the element's top right after we scrolled to it
    const started = Date.now();
    const stop = () => { stopped = true; };
    const userEvents = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
    userEvents.forEach(e => window.addEventListener(e, stop, { passive: true }));

    const t = window.setInterval(() => {
      const el = document.getElementById(id);
      const elapsed = Date.now() - started;
      if (stopped || elapsed > SETTLE_MS || (!el && elapsed > 2000)) {
        window.clearInterval(t);
        return;
      }
      if (!el) return;
      if (!aligned) {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
        target = el.getBoundingClientRect().top;
        aligned = true;
      } else if (Math.abs(el.getBoundingClientRect().top - target) > DRIFT_PX) {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
        target = el.getBoundingClientRect().top;
      }
    }, TICK_MS);

    return () => {
      window.clearInterval(t);
      userEvents.forEach(e => window.removeEventListener(e, stop));
    };
  }, [hash, ready]);
}
