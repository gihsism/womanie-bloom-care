import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/lib/platform";

// Captures the Chromium "you can install this" event so we can trigger
// the native prompt from our own button instead of relying on the
// browser's mini-infobar (which iOS never shows and Chrome often hides).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "womanie-install-dismissed";
// Re-surface the hint a couple of weeks after a dismissal rather than
// nagging on every visit or hiding it forever.
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
// Don't pop the banner over the very first paint — let the page settle.
const SHOW_DELAY_MS = 4000;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    // Already the installed app (App Store / Play shell).
    isNativeApp() ||
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes its own flag rather than display-mode.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports a Mac UA, so also treat a touch-capable "Mac" as iPad.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return ts + DISMISS_COOLDOWN_MS > new Date().getTime();
  } catch {
    return false;
  }
}

// Anything that should never sit under the banner: an open dialog, sheet or
// drawer (Radix renders those with role=dialog and locks body scroll), or an
// inline form that opts out with data-hide-install-banner (e.g. the baby
// "Add a feed" form, whose Save button lands at the bottom of the screen).
const BLOCKING_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [data-hide-install-banner]';

const NON_TYPING_INPUTS = ["button", "submit", "reset", "checkbox", "radio", "range", "color", "file"];

function somethingNeedsTheBottom(): boolean {
  if (typeof document === "undefined") return false;
  if (document.body.hasAttribute("data-scroll-locked")) return true;
  if (document.querySelector(BLOCKING_SELECTOR)) return true;
  // Typing in a field: the phone keyboard is up and the banner would float
  // right over the form being filled in.
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return true;
  if (el.tagName === "INPUT") return !NON_TYPING_INPUTS.includes((el as HTMLInputElement).type);
  return false;
}

/** True while somethingNeedsTheBottom(); re-checked on DOM and focus changes. */
function useBottomBusy(active: boolean): boolean {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!active || typeof MutationObserver === "undefined") {
      setBusy(false);
      return;
    }
    const check = () => setBusy(somethingNeedsTheBottom());
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-scroll-locked", "data-hide-install-banner", "role"],
    });
    // focusout fires before the next element gains focus; check a tick later.
    const onFocus = () => setTimeout(check, 0);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onFocus);
    return () => {
      mo.disconnect();
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onFocus);
    };
  }, [active]);
  return busy;
}

/**
 * A small, dismissible "add Womanie to your home screen" prompt.
 * - Chromium (Android/desktop): triggers the real install prompt.
 * - iOS Safari: points to /install, which has the Share → Add to Home
 *   Screen walkthrough (iOS has no programmatic install API).
 * Hidden entirely when already installed, recently dismissed, or on the
 * /install page itself. Mounted once, app-wide.
 *
 * While shown it reserves its own height at the bottom of the page
 * (body.has-install-banner + --install-banner-h) so the last buttons on any
 * page can always be scrolled clear of it, and it steps aside entirely while
 * a dialog or an opted-out form is open or a field is being typed in.
 */
export function InstallBanner() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // iOS never fires beforeinstallprompt, so show the manual hint there
    // after a short delay if it isn't already running as an app.
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIOSDevice()) {
      setIos(true);
      iosTimer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    }

    const onInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(new Date().getTime()));
    } catch {
      /* private mode — fine, we just won't remember the dismissal */
    }
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  // Don't compete with the dedicated install page.
  // Not on the front page or sign-in screens: there it covered the main
  // "Get Started" / "Log in" buttons on phones (the page has its own Install link).
  const allowedHere = !(pathname === "/install" || pathname === "/" || pathname.startsWith("/auth"));
  const busy = useBottomBusy(visible && allowedHere);
  const shown = visible && allowedHere && !busy;

  // Reserve the banner's height at the bottom of the page while it is shown.
  useEffect(() => {
    if (!shown) return;
    const root = document.documentElement;
    const apply = () => {
      const h = rootRef.current?.offsetHeight ?? 0;
      if (h) root.style.setProperty("--install-banner-h", `${h}px`);
    };
    apply();
    document.body.classList.add("has-install-banner");
    const ro = typeof ResizeObserver !== "undefined" && rootRef.current ? new ResizeObserver(apply) : null;
    if (ro && rootRef.current) ro.observe(rootRef.current);
    return () => {
      ro?.disconnect();
      document.body.classList.remove("has-install-banner");
      root.style.removeProperty("--install-banner-h");
    };
  }, [shown]);

  if (!shown) return null;

  return (
    <div
      ref={rootRef}
      className="install-banner-root fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:px-6"
      role="region"
      aria-label="Install Womanie"
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-[1.25rem] border border-line bg-background/95 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.10)] backdrop-blur">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stage-tint">
          <img src="/apple-touch-icon.png" alt="" className="h-7 w-7 rounded-lg" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-foreground">Install Womanie</p>
          <p className="truncate text-[13px] text-muted-foreground">
            {ios ? "Add it to your home screen for quick access" : "Use it like an app, even offline"}
          </p>
        </div>
        {ios ? (
          <Button size="sm" className="shrink-0 gap-1 h-10 px-4 bg-stage-accent text-stage-on text-[14px] font-bold hover:bg-stage-accent/90" onClick={() => navigate("/install")}>
            <Share className="h-4 w-4" />
            How
          </Button>
        ) : (
          <Button size="sm" className="shrink-0 gap-1 h-10 px-4 bg-stage-accent text-stage-on text-[14px] font-bold hover:bg-stage-accent/90" onClick={install}>
            <Download className="h-4 w-4" />
            Install
          </Button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default InstallBanner;
