import { Link, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import Button from "../primitives/Button";
import SectionHeader from "../primitives/SectionHeader";
import { ErrorToastViewport } from "../primitives/ErrorToast";
import { useAnyTournamentWS } from "../../hooks/useTournamentWS";
import { THEMES } from "../../themes";
import { listTournamentCommentReadMap, listTournamentCommentsSummary } from "../../api/comments.api";
import { listPlayerGuestbookReadMap, listPlayerGuestbookSummary } from "../../api/players.api";
import { SubNavProvider, useSubNavContext } from "./SubNavContext";

type Role = "reader" | "editor" | "admin";
type ThemeName = string;

const THEME_SWATCHES: Record<string, string[]> = {
  blue: ["#0f172a", "#1e293b", "#334155", "#fe6100"],
  dark: ["#09090b", "#27272a", "#3f3f46", "#3b82f6"],
  red: ["#080507", "#180f12", "#2a1a1f", "#e1384a"],
  light: ["#f4f3f2", "#eae9e8", "#ffffff", "#3b82f6"],
  green: ["#0a100c", "#18261d", "#2a4032", "#22c55e"],
};

const THEME_OPTIONS: ThemeName[] = THEMES;

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { token, role, accountRole, playerName, logout, canCycleRole, cycleRole } = useAuth();
  const loc = useLocation();
  useAnyTournamentWS();
  const qc = useQueryClient();
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const { items: subNavItems } = useSubNavContext();

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
    if (token) {
      qc.prefetchQuery({
        queryKey: ["comments", "read-map", token],
        queryFn: () => listTournamentCommentReadMap(token),
        staleTime: 15_000,
      }).catch(() => {
        // ignore
      });
    }
    qc.prefetchQuery({
      queryKey: ["players", "guestbook", "summary"],
      queryFn: listPlayerGuestbookSummary,
      staleTime: 15_000,
    }).catch(() => {
      // ignore
    });
    if (token) {
      qc.prefetchQuery({
        queryKey: ["players", "guestbook", "read-map", token],
        queryFn: () => listPlayerGuestbookReadMap(token),
        staleTime: 15_000,
      }).catch(() => {
        // ignore
      });
    }
  }, [qc, token]);

  const [theme, setTheme] = useState<ThemeName>(() => {
    const storedRaw = localStorage.getItem("theme");
    const stored = storedRaw === "ibm" ? "blue" : storedRaw === "football" ? "green" : storedRaw;
    if (stored && THEME_OPTIONS.includes(stored)) {
      return stored;
    }
    return "blue";
  });
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(120);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!themeMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = themeMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setThemeMenuOpen(false);
      }
    };
    const onDocKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setThemeMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [themeMenuOpen]);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const update = () => {
      // Use layout height (ignores visual transforms like click-blink animations)
      // so content offset stays stable across tabs.
      const next = Math.ceil(el.offsetHeight);
      if (Number.isFinite(next) && next > 0) setHeaderHeight(next);
    };
    update();

    const obs = new ResizeObserver(() => update());
    obs.observe(el);
    return () => obs.disconnect();
  }, [subNavItems.length]);

  const nav: { to: string; label: string; icon: string; min: Role }[] = [
    { to: "/dashboard", label: "Dashboard", icon: "fa-gauge-high", min: "reader" },
    { to: "/tournaments", label: "Tournaments", icon: "fa-trophy", min: "reader" },
    { to: "/friendlies", label: "Friendlies", icon: "fa-handshake", min: "reader" },
    { to: "/stats", label: "Stats", icon: "fa-chart-line", min: "reader" },
    { to: "/players", label: "Players", icon: "fa-users", min: "reader" },
    { to: "/clubs", label: "Clubs", icon: "fa-shield-halved", min: "editor" },
  ];

  const rank: Record<Role, number> = { reader: 1, editor: 2, admin: 3 };
  const visible = nav.filter((n) => rank[role] >= rank[n.min]);
  const isNavActive = (to: string, pathname: string) => {
    if (to === "/players") {
      return (
        pathname === "/players" ||
        pathname === "/profile" ||
        pathname.startsWith("/players/") ||
        pathname.startsWith("/profiles/")
      );
    }
    if (to === "/tournaments") return pathname === "/tournaments" || pathname.startsWith("/tournaments/") || pathname.startsWith("/live/");
    return pathname === to || pathname.startsWith(`${to}/`);
  };
  return (
    <div className="min-h-screen">
      {/* Fixed top bar, respecting mobile safe-area insets */}
      <div
        id="app-top-nav"
        ref={headerRef}
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
                  <div className="relative" ref={themeMenuRef}>
                    <button
                      type="button"
                      aria-label="Theme"
                      title={`Theme: ${theme}`}
                      className="btn-base btn-ghost inline-flex h-9 sm:h-10 items-center justify-center gap-2 px-2 sm:px-3"
                      onClick={() => setThemeMenuOpen((v) => !v)}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {(THEME_SWATCHES[theme] ?? ["#334155", "#475569", "#64748b", "#fe6100"]).map((c, i) => (
                          <span
                            key={`${theme}-${i}`}
                            className="h-3 w-3 rounded-full border border-border-card-chip/80"
                            style={{ backgroundColor: c }}
                            aria-hidden="true"
                          />
                        ))}
                      </span>
                      <i className={"fa-solid text-[11px] text-text-muted " + (themeMenuOpen ? "fa-chevron-up" : "fa-chevron-down")} aria-hidden="true" />
                    </button>

                    {themeMenuOpen ? (
                      <div className="absolute right-0 top-full z-50 mt-1 min-w-[156px] rounded-xl border border-border-card-chip bg-bg-card-inner p-1 shadow-xl">
                        <div className="space-y-1">
                          {THEME_OPTIONS.map((opt) => {
                            const swatches = THEME_SWATCHES[opt] ?? ["#334155", "#475569", "#64748b", "#fe6100"];
                            const active = opt === theme;
                            return (
                              <button
                                key={opt}
                                type="button"
                                title={opt}
                                aria-label={`Theme ${opt}`}
                                className={
                                  "w-full rounded-lg px-2 py-1.5 transition " +
                                  (active ? "bg-bg-card-chip/45" : "hover:bg-hover-default/40")
                                }
                                onClick={() => {
                                  setTheme(opt);
                                  setThemeMenuOpen(false);
                                }}
                              >
                                <span className="flex items-center justify-between gap-2">
                                  <span className="inline-flex items-center gap-1.5">
                                    {swatches.map((c, i) => (
                                      <span
                                        key={`${opt}-${i}`}
                                        className="h-3 w-3 rounded-full border border-border-card-chip/80"
                                        style={{ backgroundColor: c }}
                                        aria-hidden="true"
                                      />
                                    ))}
                                  </span>
                                  <span className="inline-flex w-4 items-center justify-center text-text-muted">
                                    {active ? <i className="fa-solid fa-check text-[11px]" aria-hidden="true" /> : null}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
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

          {subNavItems.length ? (
            <>
              <div className="mt-2 border-t border-border-card-outer/70" />
              <div className="page-x-bleed mt-2 pb-1 sm:pb-0">
                <div className="flex w-full items-center gap-1 overflow-x-auto py-1">
                  {subNavItems.map((item) => {
                    const commonCls =
                      "btn-base inline-flex h-9 items-center justify-center rounded-xl transition-none disabled:opacity-60";
                    const activeCls = item.active
                      ? ((item.activeClassName ?? "bg-bg-card-chip/45 border border-border-card-chip/70") + " subnav-active-glow")
                      : "btn-ghost";
                    const extraCls = item.className ?? "";
                    const icon = item.icon ? <i className={`fa-solid ${item.icon}`} aria-hidden="true" /> : null;
                    const compactMobile = !!item.iconOnlyMobile;
                    const buttonSizeCls = item.iconOnly
                      ? "w-9 px-0"
                      : compactMobile
                        ? "w-9 px-0 md:w-auto md:px-3"
                        : "px-3";
                    const iconGapCls = item.iconOnly
                      ? ""
                      : compactMobile
                        ? "md:mr-2"
                        : "mr-2";
                    const showLabel = !item.iconOnly;
                    const labelCls = compactMobile ? "hidden md:inline whitespace-nowrap text-xs font-medium" : "whitespace-nowrap text-xs font-medium";

                    if (item.to) {
                      return (
                        <Link
                          key={item.key}
                          to={item.to}
                          title={item.title ?? item.label}
                          className={
                            commonCls +
                            " " +
                            activeCls +
                            " " +
                            buttonSizeCls +
                            " " +
                            extraCls
                          }
                        >
                          {icon ? <span className={iconGapCls}>{icon}</span> : null}
                          {showLabel ? <span className={labelCls}>{item.label}</span> : null}
                        </Link>
                      );
                    }

                    return (
                      <button
                        key={item.key}
                        type="button"
                        title={item.title ?? item.label}
                        onClick={item.onClick}
                        disabled={item.disabled}
                        className={
                          commonCls +
                          " " +
                          activeCls +
                          " " +
                          buttonSizeCls +
                          " " +
                          extraCls
                        }
                      >
                        {icon ? <span className={iconGapCls}>{icon}</span> : null}
                        {showLabel ? <span className={labelCls}>{item.label}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Content offset: measured header height already includes safe-area top padding */}
      <div style={{ paddingTop: `${headerHeight}px` }}>
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

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SubNavProvider>
      <LayoutInner>{children}</LayoutInner>
    </SubNavProvider>
  );
}
