import { useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { LayoutGrid, LineChart, Swords, UserRound } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";
import { ChipGroup } from "./charts";
import type { StatsScope } from "../../api/types";
import type { StatsMode } from "./StatsControls";
import { useStandings } from "./standings";
import StatsTable from "./StatsTable";
import TrendsExplorer, { type Metric, type ViewMode } from "./trends/TrendsExplorer";
import PositionsView from "./PositionsView";
import H2HView from "./H2HView";
import StreaksView from "./StreaksView";
import { StarsSection } from "./StarsView";
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
  mode, scope, onModeChange, onScopeChange, playerId, onSelectPlayer,
}: {
  mode: StatsMode; scope: StatsScope;
  onModeChange: (m: StatsMode) => void; onScopeChange: (s: StatsScope) => void;
  playerId: number | ""; onSelectPlayer: (id: number) => void;
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

  const setView = (v: StatsView) =>
    setSearchParams(canonicalStatsParams(searchParams, v, subForSection(v, searchParams.get("sub"))), { replace: true });
  const setSub = (s: StatsSub) => setSearchParams(canonicalStatsParams(searchParams, view, s), { replace: true });

  // Duos is 2v2-only; in the other modes H2H always shows the Players sub-view
  // (without rewriting the URL, so switching back to 2v2 returns to Duos).
  const subs = subsFor(view);
  const activeSub: StatsSub = view === "h2h" && mode !== "2v2" ? "players" : sub;
  const h2hSub: H2HSub = activeSub === "duos" ? "duos" : "players";
  const showSubs = subs.length > 0 && (view !== "h2h" || mode === "2v2");

  // Default selected player: the passed-in playerId, then self (if in the roster), then first row.
  const selfInRows = myId != null && rows.some((r) => r.id === myId);
  const selectedId = playerId !== "" ? playerId : selfInRows ? myId : (rows[0]?.id ?? null);
  // Jump to the Player section for a row tap: one URL write, so the player is not
  // overwritten by a second navigation in the same tick.
  const goPlayer = (id: number) => {
    const next = canonicalStatsParams(searchParams, "player", subForSection("player", searchParams.get("sub")));
    next.set("player", String(id));
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-3">
      {/* Slim global filters */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Mode</span>
          <ChipGroup<StatsMode> value={mode} onChange={onModeChange} ariaLabel="Mode"
            options={[{ key: "overall", label: "Overall" }, { key: "1v1", label: "1v1" }, { key: "2v2", label: "2v2" }]} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Source</span>
          <ChipGroup<StatsScope> value={scope} onChange={onScopeChange} ariaLabel="Source"
            options={[{ key: "tournaments", label: "Tournaments" }, { key: "both", label: "Both" }, { key: "friendlies", label: "Friendlies" }]} />
        </div>
      </div>

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

      {view === "h2h" && <H2HView mode={mode} scope={scope} rows={rows} subView={h2hSub} selectedId={selectedId} onSelect={onSelectPlayer} />}

      {view === "player" && (
        <div className="space-y-4">
          <PlayerProfile mode={mode} scope={scope} rows={rows} selectedId={selectedId} onSelect={onSelectPlayer} />
          {selectedId != null ? (
            <div className="space-y-2">
              <div className="section-head"><span className="section-label">Club stars</span></div>
              <StarsSection mode={mode} scope={scope} playerId={selectedId} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
