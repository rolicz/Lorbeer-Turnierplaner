import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import Button from "../primitives/Button";
import SectionHeader from "../primitives/SectionHeader";
import { ErrorToastViewport } from "../primitives/ErrorToast";
import { useAnyTournamentWS } from "../../hooks/useTournamentWS";
import { THEMES } from "../../themes";
import { listTournamentCommentsSummary } from "../../api/comments.api";

type Role = "reader" | "editor" | "admin";
type ThemeName = string;

const THEME_OPTIONS: { value: ThemeName; label: string }[] = THEMES.map((t) => ({
  value: t,
  label: t.charAt(0).toUpperCase() + t.slice(1),
}));

export default function Layout({ children }: { children: React.ReactNode }) {
  const { role, logout } = useAuth();
  const loc = useLocation();
  useAnyTournamentWS();
  const qc = useQueryClient();

  // Warm cache so "unread comments" indicators appear quickly after navigation.
  // Using prefetch avoids any rendering dependencies and works well with StrictMode.
  useEffect(() => {
    qc.prefetchQuery({
      queryKey: ["comments", "summary"],
      queryFn: listTournamentCommentsSummary,
      staleTime: 15_000,
    }).catch(() => {
      // ignore (older backend may not have this endpoint)
    });
  }, [qc]);

  const [theme, setTheme] = useState<ThemeName>(() => {
    const storedRaw = localStorage.getItem("theme") as ThemeName | null;
    const stored = storedRaw === "ibm" ? "blue" : storedRaw === "football" ? "green" : storedRaw;
    if (stored && THEME_OPTIONS.some((t) => t.value === stored)) {
      return stored;
    }
    return "blue";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const nav: { to: string; label: string; min: Role }[] = [
    { to: "/dashboard", label: "Dashboard", min: "reader" },
    { to: "/tournaments", label: "Tournaments", min: "reader" },
    { to: "/stats", label: "Stats", min: "reader" },
    { to: "/players", label: "Players", min: "admin" },
    { to: "/clubs", label: "Clubs", min: "editor" },
    { to: "/tools", label: "Tools", min: "reader" },
  ];

  const rank: Record<Role, number> = { reader: 1, editor: 2, admin: 3 };
  const visible = nav.filter((n) => rank[role] >= rank[n.min]);

  return (
    <div className="min-h-screen">
      {/* Fixed top bar, respecting mobile safe-area insets */}
      <div
        className="
          fixed inset-x-0 top-0 z-30
          nav-shell backdrop-blur-md backdrop-saturate-150
          pt-[env(safe-area-inset-top,0px)]
          pl-[env(safe-area-inset-left,0px)]
          pr-[env(safe-area-inset-right,0px)]
        "
      >
        <div className="mx-auto max-w-6xl xl:max-w-7xl page-x py-2 sm:py-3">
          {/* Row 1: title + role + auth */}
          <SectionHeader
            left={
              <div className="flex min-w-0 items-center gap-2">
                <div className="shrink-0 font-semibold tracking-tight">EA FC</div>
                <div className="truncate text-xs text-muted sm:text-sm">
                  role: <span className="accent">{role}</span>
                </div>
              </div>
            }
            right={
              <>
                <div className="flex items-center gap-2">
                  <span className="hidden md:inline text-xs text-muted">Theme</span>
                  <select
                    aria-label="Theme"
                    className="select-field h-10 w-[120px] px-2 text-[11px] sm:w-[140px] sm:text-xs"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as ThemeName)}
                  >
                    {THEME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {role === "reader" ? (
                  <Link
                    to="/login"
                    title="Login"
                    className="btn-base btn-ghost inline-flex h-10 items-center justify-center"
                  >
                    <i className="fa fa-sign-in md:hidden" aria-hidden="true" />
                    <span className="hidden md:inline">Login</span>
                  </Link>
                ) : (
                  <Button variant="ghost" onClick={logout} title="Logout">
                    <i className="fa fa-sign-out md:hidden" aria-hidden="true" />
                    <span className="hidden md:inline">Logout</span>
                  </Button>
                )}
              </>
            }
          />

          {/* Row 2: nav (always visible, scrollable on mobile) */}
          <nav className="page-x-bleed mt-2 overflow-x-auto pb-1 sm:mt-3 sm:overflow-visible sm:pb-0">
            <div className="flex min-w-max items-center gap-1">
              {visible.map((n) => {
                const active = loc.pathname.startsWith(n.to);
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={`nav-link ${active ? "nav-link-active" : ""}`}
                    onClick={
                      n.to === "/dashboard"
                        ? () => {
                            window.scrollTo({ top: 0, behavior: "auto" });
                          }
                        : undefined
                    }
                  >
                    {n.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>

      {/* Content offset: header height + safe-area inset top */}
      <div className="pt-[calc(env(safe-area-inset-top,0px)+104px)] sm:pt-[calc(env(safe-area-inset-top,0px)+120px)]">
        <main
          className="
            mx-auto max-w-6xl xl:max-w-7xl page-x py-4 sm:py-6
            pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]
          "
        >
          {children}
        </main>
      </div>
      <ErrorToastViewport />
    </div>
  );
}
