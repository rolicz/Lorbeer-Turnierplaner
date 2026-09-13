/**
 * Matchup drill-in — "A vs B, every match".
 *
 * Lives inside the H2H section and is URL-addressable as
 * `/stats?view=h2h&player=<a>&vs=<b>`, so it can be linked from a profile's
 * rivals and from a match page. It follows the global Mode and Source filters
 * (the floating pill) and, outside 1v1, offers the two relations the backend
 * supports: Against (A and B on opposite sides, partners may differ) and
 * Together (A and B on the same side).
 */
import { useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import AvatarCircle from "../../../ui/primitives/AvatarCircle";
import Button from "../../../ui/primitives/Button";
import PlayerLink from "../../../ui/primitives/PlayerLink";
import InlineLoading from "../../../ui/primitives/InlineLoading";
import { ErrorToastOnError } from "../../../ui/primitives/ErrorToast";
import { getStatsH2HMatches, type StatsH2HMatchesRequest } from "../../../api/stats.api";
import { listClubs } from "../../../api/clubs.api";
import { qk } from "../../../api/queryKeys";
import { usePlayerAvatarMap } from "../../../hooks/usePlayerAvatarMap";
import { ChipGroup } from "../../../ui/primitives/Chip";
import { MatchHistoryList, tournamentMatchHref } from "../MatchHistoryList";
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

function Tile({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="surface rounded-xl px-2 py-2 text-center" title={title}>
      <div className="text-base font-bold tabular-nums text-text-normal">{children}</div>
      <div className="text-[11px] text-text-muted">{label}</div>
    </div>
  );
}

function PlayerSide({ id, name, updatedAt, align = "left" }: { id: number; name: string; updatedAt: string | null; align?: "left" | "right" }) {
  return (
    <PlayerLink
      playerId={id}
      name={name}
      className={"flex min-w-0 items-center gap-2 " + (align === "right" ? "flex-row-reverse text-right" : "")}
    >
      <AvatarCircle playerId={id} name={name} updatedAt={updatedAt} sizeClass="h-10 w-10" />
      <span className="truncate text-base font-bold text-text-normal">{name}</span>
    </PlayerLink>
  );
}

export default function MatchupView({ mode, scope, leftId, rightId, rows, onBack, initialRelation }: {
  mode: StatsMode;
  scope: StatsScope;
  /** The "own" side — perspective of every number shown here. */
  leftId: number;
  rightId: number;
  rows: Row[];
  onBack: () => void;
  /** Relation to open with (`?rel=together`, from a match page's "together" card). */
  initialRelation?: Relation;
}) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const nameById = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);
  const leftName = nameById.get(leftId) ?? `#${leftId}`;
  const rightName = nameById.get(rightId) ?? `#${rightId}`;

  // Together is meaningless in 1v1 (nobody has a partner), so the chips are hidden
  // and the relation forced back to Against there.
  const [relationChoice, setRelationChoice] = useState<Relation>(initialRelation ?? "against");
  const [details, setDetails] = useState(false);
  const showRelation = mode !== "1v1";
  const relation: Relation = showRelation ? relationChoice : "against";
  const together = relation === "together";

  const req: StatsH2HMatchesRequest = useMemo(
    () => (together
      ? { mode, relation: "teammates", left_player_ids: [leftId, rightId], right_player_ids: [], scope }
      : { mode, relation: "opposed", left_player_ids: [leftId], right_player_ids: [rightId], exact_teams: false, scope }),
    [together, mode, scope, leftId, rightId],
  );

  const q = useQuery({
    queryKey: qk.stats.h2hMatches(
      mode,
      req.relation,
      req.left_player_ids.join("-"),
      (req.right_player_ids ?? []).join("-"),
      "subset",
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
    () => (together ? { left: [leftId, rightId], right: [] } : { left: [leftId], right: [rightId] }),
    [together, leftId, rightId],
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

      <div className="card-outer">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <PlayerSide id={leftId} name={leftName} updatedAt={avatarUpdatedAtById.get(leftId) ?? null} />
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            {together ? "and" : "vs"}
          </span>
          <PlayerSide id={rightId} name={rightName} updatedAt={avatarUpdatedAtById.get(rightId) ?? null} align="right" />
        </div>
        <div className="mt-1 text-center text-[11px] text-text-muted">
          {MODE_LABEL[mode]} · {SCOPE_LABEL[scope]}{together ? " · as a team" : ""}
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
        <div className="card-outer space-y-3">
          <div className="grid grid-cols-3 gap-2">
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
              <span className="text-[11px] text-text-muted">Last {last5.length}</span>
              <div className="flex items-center gap-1" aria-label="Recent results (oldest first)">
                {last5.map((r, i) => (
                  <span
                    key={i}
                    className={"grid h-6 w-6 place-items-center rounded-md text-[11px] font-bold ring-1 ring-inset " + RESULT_CLASS[r]}
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
        <div className="space-y-2">
          <div className="section-head">
            <span className="section-label">Matches · {summary.played}</span>
          </div>
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
                focusId={leftId}
                clubs={clubsQ.data ?? []}
                showMeta={details}
                hideModePill={mode !== "overall"}
                matchHref={tournamentMatchHref}
              />
            </>
          ) : (
            <div className="text-sm text-text-muted">
              {together
                ? `No matches with ${leftName} and ${rightName} on the same team yet`
                : `No matches between ${leftName} and ${rightName} yet`}
              {" "}({MODE_LABEL[mode]} · {SCOPE_LABEL[scope]}).
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
