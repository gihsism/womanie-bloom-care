import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets scroll to the top whenever the route path changes. Without this,
 * react-router keeps the previous page's scroll offset, so tapping a nav
 * item while scrolled down lands you mid-page on the new screen — which
 * feels especially broken on a phone.
 *
 * Deliberately keyed on pathname only:
 * - ignores hash changes, so in-page anchor scrolls (GettingStarted's
 *   #name-banner, MedicalHistory section jumps) still work; and
 * - when a path is opened *with* a hash, we leave scrolling to the anchor
 *   target rather than fighting it.
 * Mounted once inside the router. Renders nothing.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, hash]);

  return null;
}

export default ScrollToTop;
