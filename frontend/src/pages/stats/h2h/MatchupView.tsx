/**
 * Matchup drill-in — "A vs B, every match".
 *
 * Lives inside the H2H section and is URL-addressable as
 * `/stats?view=h2h&player=<a>&vs=<b>`, so it can be linked from a profile's
 * rivals and from a match page. It follows the global Mode and Source filters
 * (the floating pill) and, outside 1v1, offers the two relations the backend
 * supports: Against (A and B on opposite sides, partners may differ) and
 * Together (A and B on the same side).
 *
 * Each side is **one player or a whole 2v2 team** (`?player=1,5&vs=2,4`, T7).
 * With two ids on both sides the view asks the backend for `exact_teams`, i.e.
 * only matches these four played in exactly this pairing — the "exact matchup" a
 * 2v2 match page links to. Against/Together only exist for a pair of players, so
 * a team matchup hides the relation chips.
 */
import { useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import AvatarCircle from "../../../ui/primitives/AvatarCircle";
import Button from "../../../ui/primitives/Button";
import EmptyState from "../../../ui/primitives/EmptyState";
import PlayerLink from "../../../ui/primitives/PlayerLink";
import InlineLoading from "../../../ui/primitives/InlineLoading";
import StatTile from "../../../ui/primitives/StatTile";
import { ErrorToastOnError } from "../../../ui/primitives/ErrorToast";
import { getStatsH2HMatches, type StatsH2HMatchesRequest } from "../../../api/stats.api";
import { listClubs } from "../../../api/clubs.api";
import { qk } from "../../../api/queryKeys";
import { usePlayerAvatarMap } from "../../../hooks/usePlayerAvatarMap";
import { ChipGroup } from "../../../ui/primitives/Chip";
import { MatchHistoryList, tournamentMatchHref } from "../MatchHistoryList";
import StatsSection from "../StatsSection";
import { currentRun, resultsTimeline, summarizeMatches, type MatchResult } from "./matchupSummary";
import { fmtAvg } from "../../../utils/format";
import type { Row } from "../standings";
import type { StatsMode } from "../statsMode";
import type { StatsScope } from "../../../api/types";

/** Against = opposite sides (subset match), Together = same side. */
export type Relation = "against" | "together";

const MODE_LABEL: Record<StatsMode, string> = { overall: "Overall", "1v1": "1v1", "2v2": "2v2" };
const SCOPE_LABEL: Record<StatsScope, string> = { tournaments: "Tournaments", both: "Both", friendlies: "Friendlies" };

/** W-D-L colouring through the semantic tokens (DESIGN.md §2), like `ScoreLine`'s result badge. */
const RESULT_CLASS: Record<MatchResult, string> = {
  W: "bg-win/15 text-win ring-win/30",
  D: "bg-draw/15 text-draw ring-draw/30",
  L: "bg-loss/15 text-loss ring-loss/30",
};

/** `StatTile` with the matchup's `title` tooltip kept on the box. */
function Tile({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return <StatTile label={label} value={children} title={title} />;
}

/**
 * One side of the header: a single player, or a 2v2 team as two stacked identities
 * (every name stays its own link to the profile, N4). A solo side keeps the bigger
 * avatar and type it always had.
 */
function MatchupSide({ ids, nameOf, align = "left" }: {
  ids: number[];
  nameOf: (id: number) => string;
  align?: "left" | "right";
}) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const solo = ids.length === 1;
  return (
    <div className={"flex min-w-0 flex-col gap-1 " + (align === "right" ? "items-end" : "items-start")}>
      {ids.map((id) => (
        <PlayerLink
          key={id}
          playerId={id}
          name={nameOf(id)}
          className={"flex min-w-0 max-w-full items-center gap-2 " + (align === "right" ? "flex-row-reverse text-right" : "")}
        >
          <AvatarCircle
            playerId={id}
            name={nameOf(id)}
            updatedAt={avatarUpdatedAtById.get(id) ?? null}
            sizeClass={solo ? "h-10 w-10" : "h-8 w-8"}
          />
          <span className={"truncate font-bold text-text-normal " + (solo ? "text-base" : "text-sm")}>{nameOf(id)}</span>
        </PlayerLink>
      ))}
    </div>
  );
}

export default function MatchupView({ mode, scope, leftIds, rightIds, rows, onBack, initialRelation }: {
  mode: StatsMode;
  scope: StatsScope;
  /** The "own" side — perspective of every number shown here. One id, or a 2v2 team. */
  leftIds: number[];
  /** The opposing side: one id, or the two players of the opposing team. */
  rightIds: number[];
  rows: Row[];
  onBack: () => void;
  /** Relation to open with (`?rel=together`, from a match page's "together" card). */
  initialRelation?: Relation;
}) {
  const nameById = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);
  const nameOf = (id: number) => nameById.get(id) ?? `#${id}`;
  // "Roli" / "Roli / Berni" — the same shape the match page's H2H panel prints.
  const leftName = leftIds.map(nameOf).join(" / ");
  const rightName = rightIds.map(nameOf).join(" / ");

  // Two ids on both sides = the exact team matchup; anything else is subset matching
  // ("these players were on opposite sides, whoever else played").
  const exactTeams = leftIds.length > 1 && rightIds.length > 1;
  const teamMatchup = leftIds.length > 1 || rightIds.length > 1;

  // Together is meaningless in 1v1 (nobody has a partner) and for a team matchup
  // (two teams are never teammates), so the chips are hidden and the relation
  // forced back to Against there.
  const [relationChoice, setRelationChoice] = useState<Relation>(initialRelation ?? "against");
  const [details, setDetails] = useState(false);
  const showRelation = mode !== "1v1" && !teamMatchup;
  const relation: Relation = showRelation ? relationChoice : "against";
  const together = relation === "together";

  const req: StatsH2HMatchesRequest = useMemo(
    () => (together
      ? { mode, relation: "teammates", left_player_ids: [...leftIds, ...rightIds], right_player_ids: [], scope }
      : { mode, relation: "opposed", left_player_ids: leftIds, right_player_ids: rightIds, exact_teams: exactTeams, scope }),
    [together, mode, scope, leftIds, rightIds, exactTeams],
  );

  const q = useQuery({
    queryKey: qk.stats.h2hMatches(
      mode,
      req.relation,
      req.left_player_ids.join("-"),
      (req.right_player_ids ?? []).join("-"),
      exactTeams ? "exact" : "subset",
      scope,
    ),
    queryFn: () => getStatsH2HMatches(req),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const clubsQ = useQuery({ queryKey: qk.clubs(), queryFn: () => listClubs(), staleTime: 5 * 60_000 });

  const tournaments = useMemo(() => q.data?.tournaments ?? [], [q.data]);
  // Perspective: the left player alone vs the right one, or both as one team.
  const perspective = useMemo<{ left: number[]; right: number[] }>(
    () => (together ? { left: [...leftIds, ...rightIds], right: [] } : { left: leftIds, right: rightIds }),
    [together, leftIds, rightIds],
  );
  const summary = useMemo(
    () => summarizeMatches(tournaments, perspective.left, perspective.right),
    [tournaments, perspective],
  );
  const timeline = useMemo(
    () => resultsTimeline(tournaments, perspective.left, perspective.right),
    [tournaments, perspective],
  );
  const run = currentRun(timeline);
  // resultsTimeline is newest first; show the last five oldest → newest.
  const last5 = timeline.slice(0, 5).slice().reverse();
  const winPct = summary.played ? Math.round((summary.wins / summary.played) * 100) : 0;
  const loading = q.isLoading && !q.data;

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-1 gap-1.5">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Head-to-head
        </Button>
      </div>

      <ErrorToastOnError error={q.error} title="Matchup loading failed" />

      <div className="card">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <MatchupSide ids={leftIds} nameOf={nameOf} />
          <span className="shrink-0 text-sm font-medium text-text-muted">
            {together ? "and" : "vs"}
          </span>
          <MatchupSide ids={rightIds} nameOf={nameOf} align="right" />
        </div>
        <div className="mt-1 text-center text-xs text-text-muted">
          {MODE_LABEL[mode]} · {SCOPE_LABEL[scope]}
          {together ? " · as a team" : exactTeams ? " · exact teams" : ""}
        </div>
      </div>

      {showRelation ? (
        <ChipGroup<Relation>
          value={relation}
          onChange={setRelationChoice}
          ariaLabel="Matchup relation"
          options={[{ key: "against", label: "Against" }, { key: "together", label: "Together" }]}
        />
      ) : null}

      {loading ? <InlineLoading label="Loading…" /> : null}

      {!loading ? (
        <div className="card space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Tile label="Played">{summary.played}</Tile>
            <Tile label="W-D-L" title={`${summary.wins} wins, ${summary.draws} draws, ${summary.losses} losses`}>
              <span className="text-win">{summary.wins}</span>
              <span className="text-text-muted">-</span>
              <span className="text-draw">{summary.draws}</span>
              <span className="text-text-muted">-</span>
              <span className="text-loss">{summary.losses}</span>
            </Tile>
            <Tile label="Goals" title={`${summary.gf} scored, ${summary.ga} conceded`}>{summary.gf}:{summary.ga}</Tile>
            <Tile label="Pts / match">{summary.played ? fmtAvg(summary.ptsPerMatch) : "—"}</Tile>
            <Tile label="Win %">{summary.played ? `${winPct}%` : "—"}</Tile>
            <Tile label="Current run" title="Results in a row, counted from the most recent match">
              {run ? (
                <span className={run.kind === "W" ? "text-win" : run.kind === "D" ? "text-draw" : "text-loss"}>
                  {run.kind}{run.length}
                </span>
              ) : "—"}
            </Tile>
          </div>

          {last5.length ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Last {last5.length}</span>
              <div className="flex items-center gap-1" aria-label="Recent results (oldest first)">
                {last5.map((r, i) => (
                  <span
                    key={i}
                    className={"grid h-6 w-6 place-items-center rounded-full text-xs font-bold ring-1 ring-inset " + RESULT_CLASS[r]}
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading ? (
        <StatsSection label={`Matches · ${summary.played}`}>
          {summary.played ? (
            <>
              <ChipGroup<"compact" | "details">
                value={details ? "details" : "compact"}
                onChange={(v) => setDetails(v === "details")}
                ariaLabel="Match details"
                options={[{ key: "compact", label: "Compact" }, { key: "details", label: "Details" }]}
              />
              <MatchHistoryList
                tournaments={tournaments}
                focusId={leftIds[0]}
                clubs={clubsQ.data ?? []}
                showMeta={details}
                showModePill={mode === "overall"}
                matchHref={tournamentMatchHref}
              />
            </>
          ) : (
            <EmptyState
              className="py-2"
              title={(together
                ? `No matches with ${leftName} and ${rightName} on the same team yet`
                : `No matches between ${leftName} and ${rightName} yet`) + ` (${MODE_LABEL[mode]} · ${SCOPE_LABEL[scope]}).`}
            />
          )}
        </StatsSection>
      ) : null}
    </div>
  );
}
