import { useEffect, useMemo, useRef } from "react";
import { NavigationType, useLocation, useNavigationType, useSearchParams } from "react-router-dom";
import { LayoutGrid, LineChart, Swords, UserRound } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";
import { ChipGroup } from "../../ui/primitives/Chip";
import Button from "../../ui/primitives/Button";
import StatsFilterPill from "./StatsFilterPill";
import { useReturnScroll } from "../../ui/shell/useReturnScroll";
import type { StatsScope } from "../../api/types";
import type { StatsMode } from "./statsMode";
import { TABLE_COLS, useStandings } from "./standings";
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
  collapseMatchupSide,
  DIR_PARAM,
  parseSortDir,
  resolveStatsView,
  SORT_PARAM,
  subForSection,
  subsFor,
  type H2HSub,
  type SortDir,
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

/** Stable scroll key of a body: sections without sub-views are one body. */
function bodyKey(view: StatsView, sub: StatsSub): string {
  return subsFor(view).length ? `/stats:${view}:${sub}` : `/stats:${view}`;
}

/** The matchup replaces the whole H2H body, so it counts as its own view. */
const MATCHUP_KEY = "/stats:h2h:matchup";

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
  mode, scope, onModeChange, onScopeChange, playerIds, onSelectPlayer, vsIds, onSetVs,
}: {
  mode: StatsMode; scope: StatsScope;
  onModeChange: (m: StatsMode) => void; onScopeChange: (s: StatsScope) => void;
  /** `?player=` — one id, or the two of a 2v2 team inside the matchup (T7). */
  playerIds: number[]; onSelectPlayer: (id: number) => void;
  /** Matchup opponent(s) from the URL (`?vs=`); the drill-in of the H2H section. */
  vsIds: number[]; onSetVs: (ids: number[], withPlayer?: number[], opts?: { push?: boolean }) => void;
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

  // The Table's sort lives in the URL too (M3), so a record badge can land on it
  // sorted by the column the record is about (`?sort=`/`?dir=`). Unknown/absent
  // falls back to Pts, exactly as StatsTable's own uncontrolled default did.
  const sortRaw = searchParams.get(SORT_PARAM);
  const sortKey = TABLE_COLS.some((c) => c.key === sortRaw) ? sortRaw! : "pts";
  const sortDir: SortDir = parseSortDir(searchParams.get(DIR_PARAM));
  const onSortChange = (key: string, dir: SortDir) => {
    const next = new URLSearchParams(searchParams);
    if (key === "pts") next.delete(SORT_PARAM); else next.set(SORT_PARAM, key);
    if (dir === "desc") next.delete(DIR_PARAM); else next.set(DIR_PARAM, dir);
    setSearchParams(next, { replace: true });
  };

  // Older URL shapes (?view=table, ?section=h2h, #trends, nav state) are rewritten once.
  const rewrittenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!legacy) return;
    const key = `${searchParams}${location.hash}`;
    if (rewrittenRef.current === key) return;
    rewrittenRef.current = key;
    setSearchParams(canonicalStatsParams(searchParams, view, sub), { replace: true });
  }, [legacy, view, sub, searchParams, location.hash, setSearchParams]);

  // Duos is 2v2-only; in the other modes H2H always shows the Players sub-view
  // (without rewriting the URL, so switching back to 2v2 returns to Duos).
  const subs = subsFor(view);
  const activeSub: StatsSub = view === "h2h" && mode !== "2v2" ? "players" : sub;
  const h2hSub: H2HSub = activeSub === "duos" ? "duos" : "players";

  // Default selected player: the first id of `?player=` (a team selects its first
  // player outside the matchup), then self (if in the roster), then the first row.
  const urlPlayerId: number | null = playerIds[0] ?? null;
  const selfInRows = myId != null && rows.some((r) => r.id === myId);
  const selectedId = urlPlayerId != null ? urlPlayerId : selfInRows ? myId : (rows[0]?.id ?? null);
  // The matchup replaces the H2H body (and its sub chips) while `?vs=` names the other
  // side. Each side is one player or a whole 2v2 team; the two must not share a player.
  const leftIds = useMemo(
    () => (playerIds.length ? playerIds : selectedId != null ? [selectedId] : []),
    [playerIds, selectedId],
  );
  const matchup =
    view === "h2h" && leftIds.length > 0 && vsIds.length > 0 && !vsIds.some((id) => leftIds.includes(id))
      ? { leftIds, rightIds: vsIds }
      : null;
  const showSubs = subs.length > 0 && (view !== "h2h" || mode === "2v2") && matchup == null;
  // A URL that asks for Duos outside 2v2 used to render the Players view with the
  // sub chips hidden and the URL untouched — a shared duos link landed somewhere
  // else and said nothing (A7). Say it where the chips would be, and offer the one
  // tap that honours what the link asked for, rather than overruling the reader's
  // own Mode behind their back.
  const duosNeeds2v2 = view === "h2h" && mode !== "2v2" && sub === "duos" && matchup == null;
  const filters = FILTERS[view === "overview" ? `overview:${activeSub}` : view] ?? { mode: true, scope: true };

  // Sections and sub-views swap the body without navigating (their params are
  // written with `replace`), so each one keeps its own scroll offset: you come
  // back to a list exactly where you left it, and a body you open for the first
  // time starts at the top. The matchup is the exception — it is a push, and its
  // history entry remembers the offset for it (see `openMatchup`).
  const currentKey = matchup ? MATCHUP_KEY : bodyKey(view, activeSub);
  const { save, swap, restore } = useReturnScroll();
  // Leaving the matchup is the app's one back decision now (Q6): the chevron in
  // the top bar, `PageLayout`'s on desktop, and the swipe all call `useBack()`,
  // and the matchup carries no back control of its own. All this page still owns
  // is the scroll bookkeeping below.
  const navType = useNavigationType();

  /**
   * When back leaves the matchup **in place** — nothing to pop, because the
   * reader arrived by deep link or from another page — the H2H list underneath
   * has to come back to the offset it was left at. A *pop* never reaches this:
   * there `useScrollRestoration` restores the history entry's own offset, and a
   * second restore racing it is exactly what T11/A9.7 had to untangle.
   */
  const lastBodyRef = useRef(currentKey);
  useEffect(() => {
    const previous = lastBodyRef.current;
    lastBodyRef.current = currentKey;
    if (previous !== MATCHUP_KEY || currentKey !== bodyKey("h2h", h2hSub)) return;
    if (navType !== NavigationType.Replace) return;
    restore(currentKey);
  }, [currentKey, h2hSub, navType, restore]);

  const setView = (v: StatsView) => {
    const nextSub = subForSection(v, searchParams.get("sub"));
    const next = canonicalStatsParams(searchParams, v, nextSub);
    // The matchup is a drill-in of H2H: leaving the section closes it, and a team
    // selection (`player=1,5`) collapses to its first player — only the matchup
    // can address two players at once.
    if (v !== "h2h") { next.delete("vs"); next.delete("rel"); collapseMatchupSide(next, "player"); }
    // Tapping H2H while the matchup is open keeps `vs` — the body does not change.
    const nextKey = v === "h2h" && matchup ? MATCHUP_KEY : bodyKey(v, nextSub);
    if (nextKey !== currentKey) swap(currentKey, nextKey);
    setSearchParams(next, { replace: true });
  };
  const setSub = (s: StatsSub) => {
    if (s !== activeSub) swap(currentKey, bodyKey(view, s));
    setSearchParams(canonicalStatsParams(searchParams, view, s), { replace: true });
  };

  // Jump to the Player section for a row tap: one URL write, so the player is not
  // overwritten by a second navigation in the same tick.
  const goPlayer = (id: number) => {
    const playerSub = subForSection("player", searchParams.get("sub"));
    const next = canonicalStatsParams(searchParams, "player", playerSub);
    next.delete("vs");
    next.delete("rel");
    next.set("player", String(id));
    swap(currentKey, bodyKey("player", playerSub));
    setSearchParams(next, { replace: true });
  };

  /**
   * Drill into "A vs B, every match" — the H2H list keeps its place for the way back.
   *
   * Unlike every other stats param this one is **pushed** (T11): the matchup
   * replaces the whole body, so it deserves a history step, and only then does
   * swiping right (or the browser's back button) return to the matrix instead of
   * leaving `/stats` altogether. The history entry carries the list's scroll
   * offset by itself (N2's `useScrollRestoration`: a push opens at the top, the
   * pop back restores what was left behind), so all this remembers is the offset
   * *per body*, for the way back through the section tabs.
   */
  const openMatchup = (leftId: number, rightId: number) => {
    save(currentKey);
    onSetVs([rightId], [leftId], { push: true });
  };

  return (
    <div className="space-y-3 pb-16">
      <SectionTabs tabs={SECTIONS} active={view} onChange={setView} />

      {/* Sub-views only: the filters have exactly one entry point, the floating
          pill (T4) — S9's inline "Filters" chip is gone from this row. */}
      {showSubs ? (
        <ChipGroup<StatsSub>
          value={activeSub}
          onChange={setSub}
          ariaLabel={`${view === "h2h" ? "Head-to-head" : "Overview"} sub-view`}
          options={subs.map((s) => ({ key: s, label: SUB_LABELS[s] }))}
        />
      ) : null}

      {duosNeeds2v2 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span>Duos only exist in 2v2 — showing Players.</span>
          <Button variant="ghost" size="sm" type="button" onClick={() => onModeChange("2v2")}>
            Switch to 2v2
          </Button>
        </div>
      ) : null}

      {view === "overview" && activeSub === "table" && (
        <StatsTable
          rows={rows}
          loading={loading}
          onSelect={goPlayer}
          mode={mode}
          scope={scope}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={onSortChange}
        />
      )}
      {view === "overview" && activeSub === "positions" && <PositionsView mode={mode} />}
      {view === "overview" && activeSub === "streaks" && <StreaksView mode={mode} scope={scope} />}
      {view === "overview" && activeSub === "records" && <RecordsView mode={mode} scope={scope} rows={rows} onSelect={goPlayer} onOpenStreaks={() => setSub("streaks")} />}
      {view === "overview" && activeSub === "cups" && <CupsView />}

      {view === "trends" && <TrendsExplorer mode={mode} scope={scope} rows={rows} initialMetric={initState?.trendsMetric} initialView={initState?.trendsView} initialPerMatch={initState?.trendsPerMatch} />}

      {view === "h2h" && (matchup ? (
        <MatchupView
          mode={mode}
          scope={scope}
          leftIds={matchup.leftIds}
          rightIds={matchup.rightIds}
          rows={rows}
          initialRelation={searchParams.get("rel") === "together" ? "together" : undefined}
        />
      ) : (
        <H2HView
          mode={mode}
          scope={scope}
          rows={rows}
          subView={h2hSub}
          selectedId={selectedId}
          onSelect={onSelectPlayer}
          onOpenMatchup={openMatchup}
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
