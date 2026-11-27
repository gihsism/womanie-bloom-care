import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { shouldShowConsentGate } from "@/lib/consentGate";
import { NavLink, useLocation } from "react-router-dom";
import { Home, FileText, AskMark, Calendar, Me } from "@/components/icons";
import { cn } from "@/lib/utils";

// Mobile navigation — a standard bottom tab bar: five tabs, each an icon
// with its label underneath (never rotated, never numbered). Shown only on
// every screen size: Home no longer has its own menu, so on desktop too
// this bar is the one way between the five areas. Rendered once app-wide and self-hides
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
  { to: "/dashboard/ai-doctor", label: "Ask AI", icon: AskMark },
  { to: "/dashboard/appointments", label: "Visits", icon: Calendar },
  { to: "/dashboard/settings", label: "Me", icon: Me },
];

// Where the tab bar belongs — the patient dashboard surfaces. Kept off
// marketing pages, auth, onboarding, doctor/admin, and print views.
function shouldShow(pathname: string): boolean {
  if (pathname.endsWith("/print") || pathname.includes("/print")) return false;
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

export function BottomNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  // Hidden while the one-time privacy consent screen covers the page.
  const visible = shouldShow(pathname) && !shouldShowConsentGate(user, pathname);

  useEffect(() => {
    document.body.classList.toggle("has-bottom-nav", visible);
    return () => document.body.classList.remove("has-bottom-nav");
  }, [visible]);

  if (!visible) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      aria-label="Main"
    >
      <ul className="mx-auto flex h-16 max-w-xl items-stretch">
        {TABS.map(({ to, label, icon: Icon, exact }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={exact}
              className={({ isActive }) =>
                cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                  isActive ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default BottomNav;
