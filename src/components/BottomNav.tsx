import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, FileText, MessageCircle, Calendar, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

// Mobile bottom tab bar — the "feels like an app" navigation for the
// installed PWA. Shown only on small screens (md:hidden); desktop keeps
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
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
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
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-border bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Main"
    >
      {TABS.map(({ to, label, icon: Icon, exact }) => (
        <NavLink
          key={to}
          to={to}
          end={exact}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={cn("h-5 w-5", isActive && "fill-primary/10")} aria-hidden="true" />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default BottomNav;
