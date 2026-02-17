import { Link, useLocation } from "react-router-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import Button from "../primitives/Button";
import SectionHeader from "../primitives/SectionHeader";
import { ErrorToastViewport } from "../primitives/ErrorToast";
import { useAnyTournamentWS } from "../../hooks/useTournamentWS";
import { THEMES } from "../../themes";
import { listTournamentCommentReadMap, listTournamentCommentsSummary } from "../../api/comments.api";
import {
  listPlayerGuestbookReadMap,
  listPlayerGuestbookSummary,
  listPlayerPokeReadMap,
  listPlayerPokeSummary,
} from "../../api/players.api";
import { SubNavProvider, useSubNavContext, type SubNavItem } from "./SubNavContext";
import { usePullToRefresh } from "./usePullToRefresh";

type Role = "reader" | "editor" | "admin";
type ThemeName = string;
type MainNavKey = "dashboard" | "tournaments" | "friendlies" | "stats" | "players" | "clubs" | "login" | "other";

const MAIN_NAV_ORDER: Record<MainNavKey, number> = {
  dashboard: 0,
  tournaments: 1,
  friendlies: 2,
  stats: 3,
  players: 4,
  clubs: 5,
  login: -1,
  other: -1,
};

function mainNavKeyForPath(pathname: string): MainNavKey {
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return "dashboard";
  if (pathname === "/tournaments" || pathname.startsWith("/tournaments/") || pathname.startsWith("/live/")) return "tournaments";
  if (pathname === "/friendlies" || pathname.startsWith("/friendlies/")) return "friendlies";
  if (pathname === "/stats" || pathname.startsWith("/stats/")) return "stats";
  if (
    pathname === "/players" ||
    pathname.startsWith("/players/") ||
    pathname === "/profile" ||
    pathname.startsWith("/profiles/")
  ) return "players";
  if (pathname === "/clubs" || pathname.startsWith("/clubs/")) return "clubs";
  if (pathname === "/login") return "login";
  return "other";
}

function routeHasSubnav(pathname: string): boolean {
  const k = mainNavKeyForPath(pathname);
  return k === "dashboard" || k === "tournaments" || k === "friendlies" || k === "stats" || k === "players" || k === "clubs";
}

const THEME_SWATCHES: Record<string, string[]> = {
  blue: ["#0f172a", "#1e293b", "#334155", "#fe6100"],
  dark: ["#09090b", "#27272a", "#3f3f46", "#3b82f6"],
  red: ["#080507", "#180f12", "#2a1a1f", "#e1384a"],
  light: ["#f4f3f2", "#eae9e8", "#ffffff", "#3b82f6"],
  green: ["#0a100c", "#18261d", "#2a4032", "#22c55e"],
};

const THEME_OPTIONS: ThemeName[] = THEMES;

type SubNavTransition = {
  outgoing: SubNavItem[];
  incoming: SubNavItem[];
  dir: "left" | "right";
  mode: "default" | "tournaments-live-enter" | "tournaments-live-exit";
};

function subNavSignature(items: SubNavItem[]): string {
  return items.map((i) => i.key).join("|");
}

function hasSubNavKey(items: SubNavItem[], key: string): boolean {
  return items.some((i) => i.key === key);
}

function isTournamentListPath(pathname: string): boolean {
  return pathname === "/tournaments" || pathname.startsWith("/tournaments/");
}

function isLiveTournamentPath(pathname: string): boolean {
  return pathname.startsWith("/live/");
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { token, role, accountRole, playerName, logout, canCycleRole, cycleRole } = useAuth();
  const loc = useLocation();
  useAnyTournamentWS();
  const qc = useQueryClient();
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const { items: subNavItems, setItems: setSubNavItems } = useSubNavContext();
  const pull = usePullToRefresh({
    enabled: true,
    onRefresh: async () => {
      await qc.invalidateQueries({ refetchType: "active" });
    },
  });

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
    qc.prefetchQuery({
      queryKey: ["players", "pokes", "summary"],
      queryFn: listPlayerPokeSummary,
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
      qc.prefetchQuery({
        queryKey: ["players", "pokes", "read-map", token],
        queryFn: () => listPlayerPokeReadMap(token),
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
  const [subnavTransition, setSubnavTransition] = useState<SubNavTransition | null>(null);
  const subnavTransitionTimerRef = useRef<number | null>(null);
  const mainNavRowRef = useRef<HTMLDivElement | null>(null);
  const mainNavLinkRefs = useRef<Partial<Record<MainNavKey, HTMLAnchorElement | null>>>({});
  const pendingSubnavDirRef = useRef<"left" | "right" | null>(null);
  const pendingOutgoingRef = useRef<SubNavItem[]>([]);
  const pendingOutgoingSigRef = useRef<string>("");
  const pendingMainTargetRef = useRef<MainNavKey | null>(null);
  const pendingPageMotionDirRef = useRef<"left" | "right" | null>(null);
  const prevPathRef = useRef(loc.pathname);
  const prevShownSubNavRef = useRef<SubNavItem[]>([]);
  const [pageMotion, setPageMotion] = useState<"page-slide-in-left" | "page-slide-in-right" | null>(null);
  const pageMotionTimerRef = useRef<number | null>(null);
  const shownSubNavItems = useMemo(
    () => (routeHasSubnav(loc.pathname) ? subNavItems : []),
    [loc.pathname, subNavItems]
  );
  const showSubNav = !!subnavTransition || shownSubNavItems.length > 0;

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
  }, [showSubNav, shownSubNavItems.length]);

  useEffect(() => {
    if (!routeHasSubnav(loc.pathname)) {
      setSubNavItems([]);
    }
  }, [loc.pathname, setSubNavItems]);

  useEffect(() => {
    const prevPath = prevPathRef.current;
    const currPath = loc.pathname;
    const prevMain = mainNavKeyForPath(prevPath);
    const currMain = mainNavKeyForPath(currPath);

    if (
      prevPath !== currPath &&
      !pendingSubnavDirRef.current &&
      prevMain === "tournaments" &&
      currMain === "tournaments"
    ) {
      const fromListToLive = isTournamentListPath(prevPath) && isLiveTournamentPath(currPath);
      const fromLiveToList = isLiveTournamentPath(prevPath) && isTournamentListPath(currPath);
      if (fromListToLive || fromLiveToList) {
        const dir: "left" | "right" = fromListToLive ? "right" : "left";
        const outgoing = prevShownSubNavRef.current;
        pendingSubnavDirRef.current = dir;
        pendingOutgoingRef.current = outgoing.slice();
        pendingOutgoingSigRef.current = subNavSignature(outgoing);
        pendingMainTargetRef.current = "tournaments";
      }
    }

    prevPathRef.current = currPath;
    prevShownSubNavRef.current = shownSubNavItems;
  }, [loc.pathname, shownSubNavItems]);

  useEffect(() => {
    const dir = pendingSubnavDirRef.current;
    if (!dir) return;
    if (pendingMainTargetRef.current && mainNavKeyForPath(loc.pathname) !== pendingMainTargetRef.current) return;
    if (!routeHasSubnav(loc.pathname)) {
      pendingSubnavDirRef.current = null;
      pendingOutgoingRef.current = [];
      pendingOutgoingSigRef.current = "";
      pendingMainTargetRef.current = null;
      return;
    }
    if (!subNavItems.length) return;

    const outgoing = pendingOutgoingRef.current;
    const incomingSig = subNavSignature(subNavItems);
    if (incomingSig === pendingOutgoingSigRef.current) return;

    if (outgoing.length) {
      const isEnterLiveMorph =
        hasSubNavKey(outgoing, "create-new") &&
        hasSubNavKey(outgoing, "all-tournaments") &&
        hasSubNavKey(subNavItems, "all-tournaments") &&
        hasSubNavKey(subNavItems, "tournament");
      const mode: SubNavTransition["mode"] = isEnterLiveMorph
        ? "tournaments-live-enter"
        : "default";
      if (subnavTransitionTimerRef.current != null) window.clearTimeout(subnavTransitionTimerRef.current);
      setSubnavTransition({ outgoing, incoming: subNavItems, dir, mode });
      subnavTransitionTimerRef.current = window.setTimeout(() => {
        setSubnavTransition(null);
        subnavTransitionTimerRef.current = null;
      }, mode === "default" ? 240 : 620);
    }

    pendingSubnavDirRef.current = null;
    pendingOutgoingRef.current = [];
    pendingOutgoingSigRef.current = "";
    pendingMainTargetRef.current = null;
  }, [loc.pathname, subNavItems]);

  useEffect(() => {
    const dir = pendingPageMotionDirRef.current;
    if (!dir) return;
    pendingPageMotionDirRef.current = null;
    if (pageMotionTimerRef.current != null) window.clearTimeout(pageMotionTimerRef.current);

    const rafId = window.requestAnimationFrame(() => {
      setPageMotion(dir === "right" ? "page-slide-in-right" : "page-slide-in-left");
      pageMotionTimerRef.current = window.setTimeout(() => {
        setPageMotion(null);
        pageMotionTimerRef.current = null;
      }, 430);
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [loc.pathname]);

  useEffect(() => {
    return () => {
      if (subnavTransitionTimerRef.current != null) window.clearTimeout(subnavTransitionTimerRef.current);
      if (pageMotionTimerRef.current != null) window.clearTimeout(pageMotionTimerRef.current);
      pendingSubnavDirRef.current = null;
      pendingOutgoingRef.current = [];
      pendingOutgoingSigRef.current = "";
      pendingMainTargetRef.current = null;
      pendingPageMotionDirRef.current = null;
    };
  }, []);

  const nav: { key: MainNavKey; to: string; label: string; icon: string; min: Role }[] = [
    { key: "dashboard", to: "/dashboard", label: "Dashboard", icon: "fa-gauge-high", min: "reader" },
    { key: "tournaments", to: "/tournaments", label: "Tournaments", icon: "fa-trophy", min: "reader" },
    { key: "friendlies", to: "/friendlies", label: "Friendlies", icon: "fa-handshake", min: "reader" },
    { key: "stats", to: "/stats", label: "Stats", icon: "fa-chart-line", min: "reader" },
    { key: "players", to: "/players", label: "Players", icon: "fa-users", min: "reader" },
    { key: "clubs", to: "/clubs", label: "Clubs", icon: "fa-shield-halved", min: "editor" },
  ];

  const rank: Record<Role, number> = { reader: 1, editor: 2, admin: 3 };
  const visible = nav.filter((n) => rank[role] >= rank[n.min]);
  const activeMainNavKey = mainNavKeyForPath(loc.pathname);

  useLayoutEffect(() => {
    const row = mainNavRowRef.current;
    if (!row) return;
    const activeEl = mainNavLinkRefs.current[activeMainNavKey] ?? null;
    if (!activeEl) {
      row.style.setProperty("--main-nav-indicator-opacity", "0");
      return;
    }
    const rowRect = row.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    row.style.setProperty("--main-nav-indicator-left", `${Math.max(0, activeRect.left - rowRect.left)}px`);
    row.style.setProperty("--main-nav-indicator-width", `${Math.max(0, activeRect.width)}px`);
    row.style.setProperty("--main-nav-indicator-opacity", "1");
  }, [activeMainNavKey, loc.pathname, visible.length]);

  useEffect(() => {
    const row = mainNavRowRef.current;
    if (!row) return;
    const update = () => {
      const activeEl = mainNavLinkRefs.current[activeMainNavKey] ?? null;
      if (!activeEl) return;
      const rowRect = row.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();
      row.style.setProperty("--main-nav-indicator-left", `${Math.max(0, activeRect.left - rowRect.left)}px`);
      row.style.setProperty("--main-nav-indicator-width", `${Math.max(0, activeRect.width)}px`);
      row.style.setProperty("--main-nav-indicator-opacity", "1");
    };
    const obs = new ResizeObserver(() => update());
    obs.observe(row);
    window.addEventListener("resize", update);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [activeMainNavKey]);

  const renderSubNavButtons = (items: SubNavItem[], keyPrefix = "") =>
    items.map((item) => {
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
            key={`${keyPrefix}${item.key}`}
            data-subnav-key={item.key}
            data-subnav-icononly={item.iconOnly ? "1" : "0"}
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
            {showLabel ? <span data-subnav-label="1" className={labelCls}>{item.label}</span> : null}
          </Link>
        );
      }

      return (
        <button
          key={`${keyPrefix}${item.key}`}
          data-subnav-key={item.key}
          data-subnav-icononly={item.iconOnly ? "1" : "0"}
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
          {showLabel ? <span data-subnav-label="1" className={labelCls}>{item.label}</span> : null}
        </button>
      );
    });

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
            <div ref={mainNavRowRef} className="main-nav-row flex w-full items-center gap-1">
              <span className="main-nav-indicator" aria-hidden="true" />
              {visible.map((n) => {
                const active = n.key === activeMainNavKey;
                return (
                  <Link
                    key={n.key}
                    ref={(el) => {
                      mainNavLinkRefs.current[n.key] = el;
                    }}
                    to={n.to}
                    className={`nav-link relative z-[1] inline-flex min-w-0 flex-1 items-center justify-center ${active ? "nav-link-current" : ""}`}
                    title={n.label}
                    aria-label={n.label}
                    onClick={() => {
                      const from = mainNavKeyForPath(loc.pathname);
                      const to = n.key;
                    if (from === to) {
                      window.scrollTo({ top: 0, behavior: "auto" });
                      return;
                    }
                    const fromIdx = MAIN_NAV_ORDER[from] ?? -1;
                    const toIdx = MAIN_NAV_ORDER[to] ?? -1;
                    const dir: "left" | "right" = toIdx > fromIdx ? "right" : "left";

                    if (subnavTransitionTimerRef.current != null) window.clearTimeout(subnavTransitionTimerRef.current);
                    if (pageMotionTimerRef.current != null) window.clearTimeout(pageMotionTimerRef.current);

                    pendingSubnavDirRef.current = dir;
                    pendingOutgoingRef.current = shownSubNavItems.slice();
                    pendingOutgoingSigRef.current = subNavSignature(shownSubNavItems);
                    pendingMainTargetRef.current = to;
                    pendingPageMotionDirRef.current = dir;
                    window.scrollTo({ top: 0, behavior: "auto" });
                  }}
                >
                    <i className={`fa-solid ${n.icon} md:hidden`} aria-hidden="true" />
                    <span className="hidden md:inline truncate">{n.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {showSubNav ? (
            <>
              <div className="mt-2 border-t border-border-card-outer/70" />
              <div className="page-x-bleed mt-2 pb-1 sm:pb-0 overflow-hidden">
                {subnavTransition ? (
                  <div className="relative h-11 overflow-hidden">
                    {subnavTransition.mode === "default" ? (
                      <>
                        <div
                          className={
                            "absolute inset-0 flex w-full items-center gap-1 overflow-x-auto py-1 " +
                            (subnavTransition.dir === "right" ? "subnav-slide-out-left" : "subnav-slide-out-right")
                          }
                        >
                          {renderSubNavButtons(subnavTransition.outgoing, "out-")}
                        </div>
                        <div
                          className={
                            "absolute inset-0 flex w-full items-center gap-1 overflow-x-auto py-1 " +
                            (subnavTransition.dir === "right" ? "subnav-slide-in-right" : "subnav-slide-in-left")
                          }
                        >
                          {renderSubNavButtons(subnavTransition.incoming, "in-")}
                        </div>
                      </>
                    ) : subnavTransition.mode === "tournaments-live-enter" ? (
                      <div className="absolute inset-0 flex w-full items-center gap-1 overflow-hidden py-1">
                        <div className="shrink-0 overflow-hidden subnav-morph-enter-create-slot">
                          <div className="subnav-morph-enter-create-item">
                            {renderSubNavButtons(
                              subnavTransition.outgoing.filter((i) => i.key === "create-new"),
                              "out-"
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 overflow-hidden subnav-morph-enter-anchor-slot">
                          <div className="subnav-morph-enter-anchor-item">
                            {renderSubNavButtons(
                              subnavTransition.outgoing
                                .filter((i) => i.key === "all-tournaments")
                                .map((i) => ({ ...i, active: false, iconOnly: true })),
                              "anchor-out-"
                            )}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="flex min-w-max items-center gap-1 subnav-morph-enter-rest">
                            {renderSubNavButtons(
                              subnavTransition.incoming.filter((i) => i.key !== "all-tournaments"),
                              "in-"
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex w-full items-center gap-1 overflow-hidden py-1">
                        <div className="shrink-0 overflow-hidden subnav-morph-exit-create-slot">
                          <div className="subnav-morph-exit-create-item">
                            {renderSubNavButtons(
                              subnavTransition.incoming.filter((i) => i.key === "create-new"),
                              "in-"
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 overflow-hidden subnav-morph-exit-anchor-slot">
                          <div className="subnav-morph-exit-anchor-item">
                            {renderSubNavButtons(
                              subnavTransition.incoming.filter((i) => i.key === "all-tournaments"),
                              "anchor-in-"
                            )}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="flex min-w-max items-center gap-1 subnav-morph-exit-rest">
                            {renderSubNavButtons(
                              subnavTransition.outgoing.filter((i) => i.key !== "all-tournaments"),
                              "out-"
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex w-full items-center gap-1 overflow-x-auto py-1">
                    {renderSubNavButtons(shownSubNavItems)}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div
        className="fixed inset-x-0 z-20 pointer-events-none"
        style={{ top: `${headerHeight}px` }}
        aria-hidden="true"
      >
        <div className="mx-auto max-w-6xl xl:max-w-7xl page-x">
          <div className="flex justify-center">
            <div
              className={
                "pull-refresh-indicator " +
                (pull.active || pull.refreshing ? "opacity-100" : "opacity-0")
              }
              style={{
                transform: `translateY(${Math.max(-44, Math.min(28, pull.distance - 44))}px)`,
              }}
            >
              <i
                className={
                  "fa-solid " +
                  (pull.refreshing
                    ? "fa-spinner fa-spin"
                    : pull.ready
                      ? "fa-arrows-rotate"
                      : "fa-arrow-down")
                }
                aria-hidden="true"
              />
              <span>
                {pull.refreshing ? "Refreshing…" : pull.ready ? "Release to refresh" : "Pull to refresh"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content offset: measured header height already includes safe-area top padding */}
      <div style={{ paddingTop: `${headerHeight}px` }}>
        <main
          className={`
            mx-auto max-w-6xl xl:max-w-7xl page-x py-4 sm:py-6
            pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]
          ${pageMotion ? ` ${pageMotion}` : ""}`}
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
