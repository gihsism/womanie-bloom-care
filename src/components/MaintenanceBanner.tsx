import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";

/**
 * Shown only while the server's maintenance (read-only) mode is ON, e.g.
 * during the EU database move (docs/eu-region-migration.md). The flag lives
 * on the server (MAINTENANCE_MODE env var, OFF by default); this asks
 * GET /api/maintenance once on load and again when the tab regains focus.
 * Any failure (offline, old server without the route) shows nothing.
 * Mounted once, app-wide.
 */
export function MaintenanceBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const resp = await fetch("/api/maintenance", { cache: "no-store" });
        if (!resp.ok) throw new Error(String(resp.status));
        const body = (await resp.json()) as { maintenance?: boolean; message?: string | null };
        if (!cancelled) setMessage(body.maintenance ? body.message || "Womanie is under maintenance. Nothing can be saved right now." : null);
      } catch {
        if (!cancelled) setMessage(null);
      }
    };
    check();
    const onFocus = () => { check(); };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!message) return null;

  return (
    <div
      className="sticky top-0 z-[59] flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900 shadow-sm pt-[calc(env(safe-area-inset-top)+0.5rem)]"
      role="status"
      aria-live="polite"
      data-testid="maintenance-banner"
    >
      <Wrench className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {message}
    </div>
  );
}

export default MaintenanceBanner;
