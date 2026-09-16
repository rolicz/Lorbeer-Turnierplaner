import { RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/AuthContext";
import { qk } from "../../api/queryKeys";
import { listPlayerGuestbookSummary, listPlayerPokeSummary, listPlayerGuestbookReadMap, listPlayerPokeReadMap } from "../../api/players.api";
import { listTournamentCommentsSummary, listTournamentCommentReadMap } from "../../api/comments.api";
import { ThemeProvider } from "../layout/ThemeProvider";
import { PageTitleProvider } from "../layout/PageTitleProvider";
import { usePullToRefresh } from "../layout/usePullToRefresh";
import { RealtimeProvider } from "../../hooks/realtime/RealtimeProvider";
import { useAnyTournamentWS } from "../../hooks/realtime/useRealtime";
import Sidebar from "./Sidebar";
import MobileChrome from "./MobileChrome";
import BottomTabBar from "./BottomTabBar";
import { ErrorToastViewport } from "../primitives/ErrorToast";
import RouteErrorBoundary from "./RouteErrorBoundary";
import { useSwipeNav } from "./useSwipeNav";
import { readStored, writeStored } from "../../utils/safeStorage";
import { useLocationRestore } from "./useLocationRestore";
import { useRememberLocation } from "./useRememberLocation";
import { useScrollRestoration } from "./useScrollRestoration";
import { useKeyboardWatcher } from "./keyboardOpen";

const COLLAPSE_KEY = "sidebar-collapsed";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();

  // Always-on global channel: keeps list/live/cup fresh app-wide and drives the
  // connection indicator on every route.
  useAnyTournamentWS();
  // Global swipe back/forward (mobile gesture nav; harmless on non-touch).
  useSwipeNav();
  // Standalone PWA: resume at the last route after the OS evicts the app.
  useLocationRestore();
  // Per-destination page memory: tapping a nav destination returns to its last page.
  useRememberLocation();
  // Back lands where you left off: every history entry keeps its own scroll offset.
  useScrollRestoration();
  // The on-screen keyboard: hides the bottom tab bar and collapses the clearance every
  // bottom-pinned surface leaves for it (Q2). One watcher for the whole app.
  useKeyboardWatcher();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => readStored(COLLAPSE_KEY) === "1");

  const toggleCollapse = () => {
    setCollapsed((v) => {
      const next = !v;
      writeStored(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  // Pull-to-refresh (mobile): refetch active queries.
  const pull = usePullToRefresh({
    enabled: true,
    onRefresh: async () => {
      await qc.invalidateQueries({ refetchType: "active" });
    },
  });

  // Warm caches so unread indicators (comments/guestbook/pokes) appear quickly.
  useEffect(() => {
    const opts = { staleTime: 15_000 } as const;
    qc.prefetchQuery({ queryKey: qk.commentsSummary(), queryFn: listTournamentCommentsSummary, ...opts }).catch(() => {});
    qc.prefetchQuery({ queryKey: qk.playerGuestbookSummary(), queryFn: listPlayerGuestbookSummary, ...opts }).catch(() => {});
    qc.prefetchQuery({ queryKey: qk.playerPokesSummary(), queryFn: listPlayerPokeSummary, ...opts }).catch(() => {});
    if (token) {
      qc.prefetchQuery({ queryKey: qk.commentsReadMap(token), queryFn: () => listTournamentCommentReadMap(token), ...opts }).catch(() => {});
      qc.prefetchQuery({ queryKey: qk.playerGuestbookReadMap(token), queryFn: () => listPlayerGuestbookReadMap(token), ...opts }).catch(() => {});
      qc.prefetchQuery({ queryKey: qk.playerPokesReadMap(token), queryFn: () => listPlayerPokeReadMap(token), ...opts }).catch(() => {});
    }
  }, [qc, token]);

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileChrome open={drawerOpen} setOpen={setDrawerOpen} />

        {/* Pull-to-refresh indicator (mobile) */}
        {pull.distance > 0 || pull.refreshing ? (
          <div
            className="pointer-events-none flex justify-center lg:hidden"
            style={{ height: Math.max(0, pull.distance) }}
          >
            <span className="pull-refresh-indicator self-end mb-1" style={{ opacity: pull.refreshing ? 1 : Math.min(1, pull.distance / 60) }}>
              <RotateCw
                size={14}
                className={pull.refreshing ? "animate-spin" : undefined}
                style={{ transform: pull.refreshing ? undefined : `rotate(${pull.distance * 3}deg)` }}
                aria-hidden="true"
              />
              {pull.refreshing ? "Refreshing…" : pull.ready ? "Release to refresh" : "Pull to refresh"}
            </span>
          </div>
        ) : null}

        {/* `pb-nav-clear`: the end of the page keeps room for the bottom tab bar, and
            gives it back the moment the keyboard hides that bar — otherwise a composer at
            the page end sits in 72px of dead space reserved for something that is
            `display: none`, and Safari scrolls further than it needs to in order to reveal
            the field (Q14, Roli's report). This is the one of the six offsets that is
            *document height* rather than a floating overlay, so the flip is bracketed by
            `bottomReservation.ts`: it records the scroll the shortened document takes from
            a reader parked at the end and pays it back when the room returns. */}
        <main
          className="mx-auto w-full max-w-6xl flex-1 page-x py-4 pb-nav-clear lg:py-6 lg:pb-6"
          style={pull.distance > 0 && !pull.refreshing ? { transform: `translateY(${Math.min(pull.distance, 64)}px)` } : undefined}
        >
          <RouteErrorBoundary resetKey={location.pathname}>{children}</RouteErrorBoundary>
        </main>

        <BottomTabBar />
      </div>

      {/* The single mount for showErrorToast/ErrorToastOnError (fixed overlay, so
          it can live outside the column): without it every toast is dispatched
          into the void. Inside ShellInner => present on every route. */}
      <ErrorToastViewport />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <RealtimeProvider>
        <PageTitleProvider>
          <ShellInner>{children}</ShellInner>
        </PageTitleProvider>
      </RealtimeProvider>
    </ThemeProvider>
  );
}
