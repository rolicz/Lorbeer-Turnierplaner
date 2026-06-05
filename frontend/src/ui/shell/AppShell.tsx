import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../../auth/AuthContext";
import { qk } from "../../api/queryKeys";
import { listPlayers, listPlayerGuestbookSummary, listPlayerPokeSummary, listPlayerGuestbookReadMap, listPlayerPokeReadMap } from "../../api/players.api";
import { listTournamentCommentsSummary, listTournamentCommentReadMap } from "../../api/comments.api";
import { useThemeManager } from "../layout/useThemeManager";
import { usePullToRefresh } from "../layout/usePullToRefresh";
import { SubNavProvider } from "../layout/SubNavContext";
import Sidebar from "./Sidebar";
import MobileChrome from "./MobileChrome";
import SubNavBar from "./SubNavBar";

const COLLAPSE_KEY = "sidebar-collapsed";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { token, accountRole, playerId } = useAuth();
  const qc = useQueryClient();
  const { theme, setTheme } = useThemeManager();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSE_KEY) === "1");

  const toggleCollapse = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  // Actor "view as" options (admin only).
  const playersQ = useQuery({
    queryKey: qk.players(),
    queryFn: listPlayers,
    enabled: !!token && accountRole === "admin",
    staleTime: 30_000,
  });
  const actorOptions = useMemo(() => {
    const rows = (playersQ.data ?? [])
      .filter((p) => playerId == null || Number(p.id) !== Number(playerId))
      .slice();
    rows.sort((a, b) => a.display_name.localeCompare(b.display_name));
    return rows;
  }, [playersQ.data, playerId]);

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
      <Sidebar
        theme={theme}
        setTheme={setTheme}
        actorOptions={actorOptions}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileChrome
          theme={theme}
          setTheme={setTheme}
          actorOptions={actorOptions}
          open={drawerOpen}
          setOpen={setDrawerOpen}
        />

        {/* Pull-to-refresh indicator (mobile) */}
        {pull.distance > 0 || pull.refreshing ? (
          <div
            className="pointer-events-none flex justify-center lg:hidden"
            style={{ height: Math.max(0, pull.distance) }}
          >
            <span className="pull-refresh-indicator self-end mb-1" style={{ opacity: pull.refreshing ? 1 : Math.min(1, pull.distance / 60) }}>
              <i
                className={`fa-solid fa-arrow-rotate-right ${pull.refreshing ? "fa-spin" : ""}`}
                style={{ transform: pull.refreshing ? undefined : `rotate(${pull.distance * 3}deg)` }}
                aria-hidden="true"
              />
              {pull.refreshing ? "Refreshing…" : pull.ready ? "Release to refresh" : "Pull to refresh"}
            </span>
          </div>
        ) : null}

        <main
          className="mx-auto w-full max-w-6xl flex-1 page-x py-4 lg:py-6"
          style={pull.distance > 0 && !pull.refreshing ? { transform: `translateY(${Math.min(pull.distance, 64)}px)` } : undefined}
        >
          <SubNavBar />
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SubNavProvider>
      <ShellInner>{children}</ShellInner>
    </SubNavProvider>
  );
}
