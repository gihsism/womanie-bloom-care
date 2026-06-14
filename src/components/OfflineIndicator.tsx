import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * A slim banner that appears when the device goes offline and clears
 * itself when the connection returns. Matters most for the installed
 * PWA: the app shell is cached and keeps running, but anything that
 * hits /api (health records, AI Doctor, appointments) will fail in a
 * dead zone — this tells the user why instead of letting buttons
 * silently do nothing. Mounted once, app-wide.
 */
export function OfflineIndicator() {
  // navigator.onLine is the starting truth; events keep it current.
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" && navigator.onLine === false,
  );

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-muted px-4 py-2 text-center text-xs font-medium text-muted-foreground shadow-sm pt-[calc(env(safe-area-inset-top)+0.5rem)]"
      role="status"
      aria-live="polite"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      You're offline — saved info still shows, but new data won't load until you reconnect.
    </div>
  );
}

export default OfflineIndicator;
