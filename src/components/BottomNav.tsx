import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, Folder, MessageSquareText, CalendarDays, User } from "lucide-react";
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
  { to: "/dashboard/medical-history", label: "Records", icon: Folder },
  { to: "/dashboard/ai-doctor", label: "Ask AI", icon: MessageSquareText },
  { to: "/dashboard/appointments", label: "Visits", icon: CalendarDays },
  { to: "/dashboard/settings", label: "Me", icon: User },
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-background pb-[env(safe-area-inset-bottom)]"
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
                  // Idea 4: white bar, grey tabs, the stage accent for the active one.
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stage-accent",
                  isActive ? "text-stage-accent" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <Icon className="h-6 w-6" strokeWidth={1.9} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default BottomNav;
