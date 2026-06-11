import { useLocation, useSearchParams } from "react-router-dom";
import { LineChart, Table2, Grid3x3, UserRound, Flame, Star, Medal, Award, Trophy } from "lucide-react";

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
import StarsView from "./StarsView";
import PlayerProfile from "./PlayerProfile";
import RecordsView from "./RecordsView";
import CupsView from "./CupsView";

type Tab = "trends" | "table" | "positions" | "h2h" | "streaks" | "stars" | "player" | "records" | "cups";

const TABS: SectionTab<Tab>[] = [
  { key: "trends", label: "Trends", icon: <LineChart size={14} /> },
  { key: "table", label: "Table", icon: <Table2 size={14} /> },
  { key: "positions", label: "Positions", icon: <Medal size={14} /> },
  { key: "h2h", label: "H2H", icon: <Grid3x3 size={14} /> },
  { key: "streaks", label: "Streaks", icon: <Flame size={14} /> },
  { key: "stars", label: "Stars", icon: <Star size={14} /> },
  { key: "player", label: "Player", icon: <UserRound size={14} /> },
  { key: "records", label: "Records", icon: <Award size={14} /> },
  { key: "cups", label: "Cups", icon: <Trophy size={14} /> },
];
const TAB_KEYS = TABS.map((t) => t.key);

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
  // Deep-link support: dashboard (and others) can pass an initial tab + trends config via nav state.
  const location = useLocation();
  const initState = (location.state as { statsTab?: Tab; trendsMetric?: Metric; trendsView?: ViewMode; trendsPerMatch?: boolean } | null) ?? null;
  // The active sub-tab is persisted in the URL (`?view=`) so leaving for a tournament
  // and pressing Back restores the same tab (e.g. Positions / Records).
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const tab: Tab =
    viewParam && (TAB_KEYS as readonly string[]).includes(viewParam)
      ? (viewParam as Tab)
      : (initState?.statsTab ?? (playerId !== "" ? "player" : "trends"));
  const setTab = (t: Tab) => {
    const n = new URLSearchParams(searchParams);
    n.set("view", t);
    setSearchParams(n, { replace: true });
  };
  // Default selected player: the passed-in playerId, then self (if in the roster), then first row.
  const selfInRows = myId != null && rows.some((r) => r.id === myId);
  const selectedId = playerId !== "" ? playerId : selfInRows ? myId : (rows[0]?.id ?? null);
  const goPlayer = (id: number) => { onSelectPlayer(id); setTab("player"); };

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

      <SectionTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "trends" && <TrendsExplorer mode={mode} scope={scope} rows={rows} initialMetric={initState?.trendsMetric} initialView={initState?.trendsView} initialPerMatch={initState?.trendsPerMatch} />}
      {tab === "table" && <StatsTable rows={rows} loading={loading} onSelect={goPlayer} mode={mode} scope={scope} />}
      {tab === "positions" && <PositionsView mode={mode} />}
      {tab === "h2h" && <H2HView mode={mode} scope={scope} rows={rows} myId={myId} />}
      {tab === "streaks" && <StreaksView mode={mode} scope={scope} />}
      {tab === "stars" && <StarsView mode={mode} scope={scope} rows={rows} selectedId={selectedId} onSelect={onSelectPlayer} />}
      {tab === "player" && <PlayerProfile mode={mode} scope={scope} rows={rows} selectedId={selectedId} onSelect={onSelectPlayer} />}
      {tab === "records" && <RecordsView mode={mode} scope={scope} rows={rows} />}
      {tab === "cups" && <CupsView />}
    </div>
  );
}
