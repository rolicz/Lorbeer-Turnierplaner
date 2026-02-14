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
  const { token, role, accountRole, playerName, logout, canCycleRole, cycleRole } = useAuth();
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
    const storedRaw = localStorage.getItem("theme");
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

  const nav: { to: string; label: string; icon: string; min: Role }[] = [
    { to: "/dashboard", label: "Dashboard", icon: "fa-gauge-high", min: "reader" },
    { to: "/tournaments", label: "Tournaments", icon: "fa-trophy", min: "reader" },
    { to: "/friendlies", label: "Friendlies", icon: "fa-handshake", min: "reader" },
    { to: "/stats", label: "Stats", icon: "fa-chart-line", min: "reader" },
    { to: "/players", label: "Players", icon: "fa-users", min: "reader" },
    { to: "/profile", label: "Profile", icon: "fa-user", min: "editor" },
    { to: "/clubs", label: "Clubs", icon: "fa-shield-halved", min: "editor" },
  ];

  const rank: Record<Role, number> = { reader: 1, editor: 2, admin: 3 };
  const visible = nav.filter((n) => rank[role] >= rank[n.min]);
  const isNavActive = (to: string, pathname: string) => {
    if (to === "/profile") return pathname === "/profile";
    if (to === "/players") return pathname === "/players" || pathname.startsWith("/players/") || pathname.startsWith("/profiles/");
    return pathname === to || pathname.startsWith(`${to}/`);
  };

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
                {canCycleRole ? (
                  <button
                    type="button"
                    onClick={cycleRole}
                    title={`Switch role (${role})`}
                    className="btn-base btn-ghost inline-flex h-8 w-8 shrink-0 items-center justify-center p-0"
                  >
                    <i className="fa-solid fa-user-gear text-xs" aria-hidden="true" />
                  </button>
                ) : null}
                <div className="truncate text-xs text-muted sm:text-sm">
                  <span className="accent">{playerName || "Guest"}</span>
                  <span className="ml-1 text-text-normal">({role})</span>
                  {accountRole === "admin" && role !== "admin" ? (
                    <span className="ml-2 text-[11px] text-text-muted hidden sm:inline">ui override</span>
                  ) : null}
                </div>
              </div>
            }
            right={
              <>
                <div className="flex items-center gap-2">
                  <span className="hidden md:inline text-xs text-muted">Theme</span>
                  <select
                    aria-label="Theme"
                    className="select-field h-9 sm:h-10 w-[120px] px-2 py-0 text-[11px] sm:w-[140px] sm:text-xs"
                    value={theme}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (THEME_OPTIONS.some((t) => t.value === next)) {
                        setTheme(next);
                      }
                    }}
                  >
                    {THEME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {!token ? (
                  <Link
                    to="/login"
                    title="Login"
                    className="btn-base btn-ghost inline-flex h-9 sm:h-10 items-center justify-center px-3 py-0"
                  >
                    <i className="fa fa-sign-in md:hidden" aria-hidden="true" />
                    <span className="hidden md:inline">Login</span>
                  </Link>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={logout}
                    title="Logout"
                    className="inline-flex h-9 sm:h-10 items-center justify-center px-3 py-0"
                  >
                    <i className="fa fa-sign-out md:hidden" aria-hidden="true" />
                    <span className="hidden md:inline">Logout</span>
                  </Button>
                )}
              </>
            }
          />

          {/* Row 2: nav (always visible, scrollable on mobile) */}
          <div className="mt-2 border-t border-border-card-outer/70 sm:mt-3" />
          <nav className="page-x-bleed mt-2 pb-1 sm:pb-0">
            <div className="flex w-full items-center gap-1">
              {visible.map((n) => {
                const active = isNavActive(n.to, loc.pathname);
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={`nav-link inline-flex min-w-0 flex-1 items-center justify-center ${active ? "nav-link-active" : ""}`}
                    title={n.label}
                    aria-label={n.label}
                    onClick={
                      n.to === "/dashboard"
                        ? () => {
                            window.scrollTo({ top: 0, behavior: "auto" });
                          }
                        : undefined
                    }
                  >
                    <i className={`fa-solid ${n.icon} md:hidden`} aria-hidden="true" />
                    <span className="hidden md:inline truncate">{n.label}</span>
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
