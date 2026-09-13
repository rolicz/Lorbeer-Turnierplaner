import { useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { LayoutGrid, LineChart, Swords, UserRound } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";
import { ChipGroup } from "../../ui/primitives/Chip";
import StatsFilterPill from "./StatsFilterPill";
import type { StatsScope } from "../../api/types";
import type { StatsMode } from "./statsMode";
import { useStandings } from "./standings";
import StatsTable from "./StatsTable";
import TrendsExplorer, { type Metric, type ViewMode } from "./trends/TrendsExplorer";
import PositionsView from "./PositionsView";
import H2HView from "./H2HView";
import MatchupView from "./h2h/MatchupView";
import StreaksView from "./StreaksView";
import PlayerProfile from "./PlayerProfile";
import RecordsView from "./RecordsView";
import CupsView from "./CupsView";
import {
  canonicalStatsParams,
  resolveStatsView,
  subForSection,
  subsFor,
  type H2HSub,
  type StatsSub,
  type StatsView,
} from "./statsNav";

const SECTIONS: SectionTab<StatsView>[] = [
  { key: "overview", label: "Overview", icon: <LayoutGrid size={14} /> },
  { key: "trends", label: "Trends", icon: <LineChart size={14} /> },
  { key: "h2h", label: "H2H", icon: <Swords size={14} /> },
  { key: "player", label: "Player", icon: <UserRound size={14} /> },
];

/** Which global filters each section (Overview: each sub-view) actually uses. */
const FILTERS: Record<string, { mode: boolean; scope: boolean }> = {
  "overview:table": { mode: true, scope: true },
  "overview:positions": { mode: true, scope: false },
  "overview:streaks": { mode: true, scope: true },
  "overview:records": { mode: true, scope: true },
  "overview:cups": { mode: false, scope: false },
  trends: { mode: true, scope: true },
  h2h: { mode: true, scope: true },
  player: { mode: true, scope: true },
};

const SUB_LABELS: Record<StatsSub, string> = {
  table: "Table",
  positions: "Positions",
  streaks: "Streaks",
  records: "Records",
  cups: "Cups",
  players: "Players",
  duos: "Duos",
};

export default function StatsInsights({
  mode, scope, onModeChange, onScopeChange, playerId, onSelectPlayer, vsId, onSetVs,
}: {
  mode: StatsMode; scope: StatsScope;
  onModeChange: (m: StatsMode) => void; onScopeChange: (s: StatsScope) => void;
  playerId: number | ""; onSelectPlayer: (id: number) => void;
  /** Matchup opponent from the URL (`?vs=`); the drill-in of the H2H section. */
  vsId: number | ""; onSetVs: (id: number | "", withPlayer?: number) => void;
}) {
  const { rows, loading } = useStandings(mode, scope);
  const { playerId: selfId } = useAuth();
  const myId = selfId != null ? Number(selfId) : null;
  // Deep-link support: dashboard (and others) can pass an initial trends config via nav state.
  const location = useLocation();
  const initState = (location.state as { trendsMetric?: Metric; trendsView?: ViewMode; trendsPerMatch?: boolean } | null) ?? null;
  // Section + sub-view live in the URL (`?view=`/`?sub=`) so leaving for a tournament
  // and pressing Back restores the same place (e.g. Overview · Positions).
  const [searchParams, setSearchParams] = useSearchParams();
  const { view, sub, legacy } = resolveStatsView(searchParams, location.hash, location.state);

  // Older URL shapes (?view=table, ?section=h2h, #trends, nav state) are rewritten once.
  const rewrittenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!legacy) return;
    const key = `${searchParams}${location.hash}`;
    if (rewrittenRef.current === key) return;
    rewrittenRef.current = key;
    setSearchParams(canonicalStatsParams(searchParams, view, sub), { replace: true });
  }, [legacy, view, sub, searchParams, location.hash, setSearchParams]);

  const setView = (v: StatsView) => {
    const next = canonicalStatsParams(searchParams, v, subForSection(v, searchParams.get("sub")));
    // The matchup is a drill-in of H2H: leaving the section closes it.
    if (v !== "h2h") next.delete("vs");
    setSearchParams(next, { replace: true });
  };
  const setSub = (s: StatsSub) => setSearchParams(canonicalStatsParams(searchParams, view, s), { replace: true });

  // Duos is 2v2-only; in the other modes H2H always shows the Players sub-view
  // (without rewriting the URL, so switching back to 2v2 returns to Duos).
  const subs = subsFor(view);
  const activeSub: StatsSub = view === "h2h" && mode !== "2v2" ? "players" : sub;
  const h2hSub: H2HSub = activeSub === "duos" ? "duos" : "players";

  // Default selected player: the passed-in playerId, then self (if in the roster), then first row.
  const selfInRows = myId != null && rows.some((r) => r.id === myId);
  const selectedId = playerId !== "" ? playerId : selfInRows ? myId : (rows[0]?.id ?? null);
  // The matchup replaces the H2H body (and its sub chips) while `?vs=` names another player.
  const matchup =
    view === "h2h" && selectedId != null && vsId !== "" && vsId !== selectedId
      ? { leftId: selectedId, rightId: vsId }
      : null;
  const showSubs = subs.length > 0 && (view !== "h2h" || mode === "2v2") && matchup == null;
  const filters = FILTERS[view === "overview" ? `overview:${activeSub}` : view] ?? { mode: true, scope: true };

  // Jump to the Player section for a row tap: one URL write, so the player is not
  // overwritten by a second navigation in the same tick.
  const goPlayer = (id: number) => {
    const next = canonicalStatsParams(searchParams, "player", subForSection("player", searchParams.get("sub")));
    next.delete("vs");
    next.set("player", String(id));
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-3 pb-16">
      <SectionTabs tabs={SECTIONS} active={view} onChange={setView} />

      {showSubs ? (
        <ChipGroup<StatsSub>
          value={activeSub}
          onChange={setSub}
          ariaLabel={`${view === "h2h" ? "Head-to-head" : "Overview"} sub-view`}
          options={subs.map((s) => ({ key: s, label: SUB_LABELS[s] }))}
        />
      ) : null}

      {view === "overview" && activeSub === "table" && <StatsTable rows={rows} loading={loading} onSelect={goPlayer} mode={mode} scope={scope} />}
      {view === "overview" && activeSub === "positions" && <PositionsView mode={mode} />}
      {view === "overview" && activeSub === "streaks" && <StreaksView mode={mode} scope={scope} />}
      {view === "overview" && activeSub === "records" && <RecordsView mode={mode} scope={scope} rows={rows} onSelect={goPlayer} />}
      {view === "overview" && activeSub === "cups" && <CupsView />}

      {view === "trends" && <TrendsExplorer mode={mode} scope={scope} rows={rows} initialMetric={initState?.trendsMetric} initialView={initState?.trendsView} initialPerMatch={initState?.trendsPerMatch} />}

      {view === "h2h" && (matchup ? (
        <MatchupView
          mode={mode}
          scope={scope}
          leftId={matchup.leftId}
          rightId={matchup.rightId}
          rows={rows}
          onBack={() => onSetVs("")}
        />
      ) : (
        <H2HView
          mode={mode}
          scope={scope}
          rows={rows}
          subView={h2hSub}
          selectedId={selectedId}
          onSelect={onSelectPlayer}
          onOpenMatchup={(leftId, rightId) => onSetVs(rightId, leftId)}
        />
      ))}

      {view === "player" && <PlayerProfile mode={mode} scope={scope} rows={rows} selectedId={selectedId} onSelect={onSelectPlayer} />}

      {/* Global filters float bottom-right so they stay reachable while scrolled
          down; only the ones the active section uses are rendered. */}
      <StatsFilterPill
        mode={mode}
        scope={scope}
        onModeChange={onModeChange}
        onScopeChange={onScopeChange}
        showMode={filters.mode}
        showScope={filters.scope}
      />
    </div>
  );
}
