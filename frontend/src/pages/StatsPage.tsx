import { useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users, TrendingUp, Swords, Flame, Star, ListChecks, BarChart3 } from "lucide-react";

import PlayersStatsCard from "./stats/PlayersStatsCard";
import TrendsCard from "./stats/TrendsCard";
import HeadToHeadCard from "./stats/HeadToHeadCard";
import StreaksCard from "./stats/StreaksCard";
import PlayerMatchesCard from "./stats/PlayerMatchesCard";
import RatingsCard from "./stats/RatingsCard";
import StarsPerformanceCard from "./stats/StarsPerformanceCard";
import StatsFilterBar, { type StatsFilterConfig } from "./stats/StatsFilterBar";
import StatsInsights from "./stats/StatsInsights";
import { useStatsExperience } from "../ui/layout/useStatsMode";
import type { StatsMode } from "./stats/StatsControls";
import { SectionTabs, type SectionTab } from "../ui/SectionTabs";
import { useRouteEntryLoading } from "../ui/layout/useRouteEntryLoading";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";
import { listPlayers } from "../api/players.api";
import { qk } from "../api/queryKeys";
import { usePlayerAvatarMap } from "../hooks/usePlayerAvatarMap";
import { useAuth } from "../auth/AuthContext";
import type { StatsScope } from "../api/types";

type TabKey = "players" | "trends" | "h2h" | "streaks" | "ratings" | "stars" | "matches";

const TABS: SectionTab<TabKey>[] = [
  { key: "players", label: "Players", icon: <Users size={14} /> },
  { key: "trends", label: "Trends", icon: <TrendingUp size={14} /> },
  { key: "h2h", label: "H2H", icon: <Swords size={14} /> },
  { key: "streaks", label: "Streaks", icon: <Flame size={14} /> },
  { key: "ratings", label: "Ratings", icon: <Star size={14} /> },
  { key: "stars", label: "Stars", icon: <BarChart3 size={14} /> },
  { key: "matches", label: "Matches", icon: <ListChecks size={14} /> },
];

// Which shared filters each section actually uses.
const FILTER_CONFIG: Record<TabKey, StatsFilterConfig> = {
  players: { mode: true, scope: false, player: "none" },
  trends: { mode: true, scope: false, player: "none" },
  h2h: { mode: true, scope: true, player: "optional" },
  streaks: { mode: true, scope: true, player: "none" },
  ratings: { mode: true, scope: true, player: "none" },
  stars: { mode: true, scope: true, player: "required" },
  matches: { mode: true, scope: true, player: "required" },
};

const TAB_KEYS = TABS.map((t) => t.key);
const MODE_VALUES: StatsMode[] = ["overall", "1v1", "2v2"];
const SCOPE_VALUES: StatsScope[] = ["tournaments", "both", "friendlies"];

export default function StatsPage() {
  const location = useLocation();
  const pageEntered = useRouteEntryLoading();
  const [searchParams, setSearchParams] = useSearchParams();

  const experience = useStatsExperience();
  const { playerId: selfId } = useAuth();
  const playersQ = useQuery({ queryKey: qk.players(), queryFn: listPlayers });
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const players = useMemo(
    () => (playersQ.data ?? []).slice().sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [playersQ.data],
  );

  // --- shared state, persisted in the URL so it survives section switches ---
  const state = (location.state as { focus?: string; trendsView?: "lastN" | "total" } | null) ?? null;
  const wantsTrends =
    location.hash === "#trends" || location.hash === "#stats-trends" || state?.focus === "trends";

  const tabParam = searchParams.get("section");
  const active: TabKey =
    tabParam && (TAB_KEYS as string[]).includes(tabParam)
      ? (tabParam as TabKey)
      : wantsTrends
        ? "trends"
        : "players";

  const modeParam = searchParams.get("mode");
  const mode: StatsMode = modeParam && (MODE_VALUES as string[]).includes(modeParam) ? (modeParam as StatsMode) : "overall";
  const scopeParam = searchParams.get("source");
  const scope: StatsScope = scopeParam && (SCOPE_VALUES as string[]).includes(scopeParam) ? (scopeParam as StatsScope) : "tournaments";
  const playerParam = Number(searchParams.get("player"));
  const playerId: number | "" = Number.isFinite(playerParam) && playerParam > 0 ? playerParam : "";

  const patchParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  };

  const setActive = (t: TabKey) => patchParams({ section: t });
  const setMode = (m: StatsMode) => patchParams({ mode: m });
  const setScope = (s: StatsScope) => patchParams({ source: s });
  const setPlayer = (id: number | "") => patchParams({ player: id === "" ? null : String(id) });

  const initialTrendsView = state?.trendsView ?? undefined;
  const config = FILTER_CONFIG[active];

  // Effective player: explicit URL choice, else self for sections that require one.
  const effPlayerId: number | "" =
    playerId !== "" ? playerId : config.player === "required" ? (selfId ?? "") : "";

  if (!pageEntered) {
    return <div className="page"><PageLoadingScreen sectionCount={3} /></div>;
  }

  // --- Insights (opt-in) mode: League standings + per-player profile ---
  if (experience === "insights") {
    const insightsConfig: StatsFilterConfig = { mode: true, scope: true, player: "optional" };
    return (
      <div className="page">
        <div className="mb-4 hidden lg:block">
          <h1 className="text-xl font-bold tracking-tight text-text-normal">Stats</h1>
        </div>
        <StatsFilterBar
          config={insightsConfig}
          mode={mode}
          onModeChange={setMode}
          scope={scope}
          onScopeChange={setScope}
          playerId={playerId}
          onPlayerChange={setPlayer}
          players={players}
          avatarUpdatedAtById={avatarUpdatedAtById}
        />
        <StatsInsights mode={mode} scope={scope} playerId={playerId} onSelectPlayer={(id) => setPlayer(id)} />
      </div>
    );
  }

  // --- Classic mode (default) ---
  return (
    <div className="page">
      <div className="mb-4 hidden lg:block">
        <h1 className="text-xl font-bold tracking-tight text-text-normal">Stats</h1>
      </div>

      <SectionTabs tabs={TABS} active={active} onChange={setActive} className="mb-4" />

      <StatsFilterBar
        config={config}
        mode={mode}
        onModeChange={setMode}
        scope={scope}
        onScopeChange={setScope}
        playerId={effPlayerId}
        onPlayerChange={setPlayer}
        players={players}
        avatarUpdatedAtById={avatarUpdatedAtById}
      />

      {active === "players" && <PlayersStatsCard embedded mode={mode} />}
      {active === "trends" && <TrendsCard embedded defaultOpen initialView={initialTrendsView} mode={mode} />}
      {active === "h2h" && <HeadToHeadCard embedded mode={mode} scope={scope} playerId={effPlayerId} />}
      {active === "streaks" && <StreaksCard embedded mode={mode} scope={scope} />}
      {active === "ratings" && <RatingsCard embedded mode={mode} scope={scope} />}
      {active === "stars" && <StarsPerformanceCard embedded mode={mode} scope={scope} playerId={effPlayerId} />}
      {active === "matches" && <PlayerMatchesCard embedded mode={mode} scope={scope} playerId={effPlayerId} />}
    </div>
  );
}
