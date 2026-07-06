import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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

/**
 * A small, dismissible "add Womanie to your home screen" prompt.
 * - Chromium (Android/desktop): triggers the real install prompt.
 * - iOS Safari: points to /install, which has the Share → Add to Home
 *   Screen walkthrough (iOS has no programmatic install API).
 * Hidden entirely when already installed, recently dismissed, or on the
 * /install page itself. Mounted once, app-wide.
 */
export function InstallBanner() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);

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
  if (!visible || pathname === "/install") return null;

  return (
    <div
      className="install-banner-root fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:px-6"
      role="region"
      aria-label="Install Womanie"
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <img src="/apple-touch-icon.png" alt="" className="h-7 w-7 rounded-lg" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">Install Womanie</p>
          <p className="truncate text-xs text-muted-foreground">
            {ios ? "Add it to your home screen for quick access" : "Use it like an app, even offline"}
          </p>
        </div>
        {ios ? (
          <Button size="sm" variant="secondary" className="shrink-0 gap-1" onClick={() => navigate("/install")}>
            <Share className="h-4 w-4" />
            How
          </Button>
        ) : (
          <Button size="sm" className="shrink-0 gap-1" onClick={install}>
            <Download className="h-4 w-4" />
            Install
          </Button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default InstallBanner;
