import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, FileText, MessageCircle, Calendar, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

// Mobile navigation — the version 8 "museum index": a slim vertical rail
// down the left edge with rotated labels (formerly a bottom tab bar). Shown only on small screens (md:hidden); desktop keeps
// the existing dropdown menu. Rendered once app-wide and self-hides
// outside the patient dashboard area.
//
// Content clearance: while visible it adds `has-bottom-nav` to <body>,
// and a global rule in index.css pads the bottom of the page on mobile so
// the fixed bar never covers the last row of content.

interface Tab {
  to: string;
  label: string;
  icon: typeof Home;
  // Exact match only (Home), otherwise prefix match so child routes stay lit.
  exact?: boolean;
}

const TABS: Tab[] = [
  { to: "/dashboard", label: "Home", icon: Home, exact: true },
  { to: "/dashboard/medical-history", label: "Records", icon: FileText },
  { to: "/dashboard/ai-doctor", label: "Ask AI", icon: MessageCircle },
  { to: "/dashboard/appointments", label: "Visits", icon: Calendar },
  { to: "/dashboard/settings", label: "Me", icon: Settings },
];

// Where the tab bar belongs — the patient dashboard surfaces. Kept off
// marketing pages, auth, onboarding, doctor/admin, and print views.
function shouldShow(pathname: string): boolean {
  if (pathname.endsWith("/print") || pathname.includes("/print")) return false;
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

export function BottomNav() {
  const { pathname } = useLocation();
  const visible = shouldShow(pathname);

  useEffect(() => {
    document.body.classList.toggle("has-bottom-nav", visible);
    return () => document.body.classList.remove("has-bottom-nav");
  }, [visible]);

  if (!visible) return null;

  return (
    <nav
      className="fixed left-0 bottom-0 top-[env(safe-area-inset-top)] z-40 flex w-[46px] flex-col items-stretch justify-around border-r border-border bg-background/90 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Main"
    >
      {TABS.map(({ to, label, exact }, i) => {
        const ai = to === "/dashboard/ai-doctor";
        return (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              cn(
                "relative flex flex-1 items-center justify-center transition-colors",
                isActive ? "text-foreground" : ai ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Vertical museum-index label, read bottom-to-top */}
                <span className="flex rotate-180 items-center gap-2 whitespace-nowrap text-[12.5px] uppercase tracking-[0.16em] [writing-mode:vertical-rl]">
                  {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
                  {!isActive && ai && <span aria-hidden="true" className="text-[11px]">&#10022;</span>}
                  <span className={cn(isActive && "font-medium")}>{label}</span>
                  <span className={cn("font-mono text-[10px] tracking-normal", isActive ? "text-primary" : "text-border")}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </span>
                {isActive && <span className="absolute right-[-1px] top-1/2 h-20 w-[2px] -translate-y-1/2 bg-foreground" aria-hidden="true" />}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

export default BottomNav;
