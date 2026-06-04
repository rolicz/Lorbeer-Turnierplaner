import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getStatsH2HMatches } from "../../api/stats.api";
import type { Club, Match, MatchSide, StatsPlayerMatchesTournament } from "../../api/types";
import { sideBy } from "../../helpers";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { MatchRowWithClubs } from "../stats/MatchHistoryList";
import { fmtAvg } from "../../utils/format";

type Summary = {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  ptsPerMatch: number;
};

type RecentMatch = {
  key: string;
  tournamentLabel: string;
  tournamentDate: string | null;
  match: Match;
};

function playerIds(side?: MatchSide): number[] {
  return [...(side?.players ?? [])]
    .map((p) => Number(p.id))
    .filter((id) => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b);
}

function playerNames(side?: MatchSide): string {
  const names = (side?.players ?? []).map((p) => p.display_name).filter(Boolean);
  if (!names.length) return "—";
  return names.join(" / ");
}

function hasAllPlayers(side: MatchSide | undefined, ids: number[]) {
  if (!side || !ids.length) return false;
  const sideIds = new Set(
    (side.players ?? [])
      .map((p) => Number(p.id))
      .filter((id) => Number.isFinite(id) && id > 0),
  );
  return ids.every((id) => sideIds.has(id));
}

function matchPerspective(match: Match, leftIds: number[], rightIds: number[] = []) {
  const a = sideBy(match, "A");
  const b = sideBy(match, "B");
  if (!a || !b) return null;

  if (rightIds.length) {
    if (hasAllPlayers(a, leftIds) && hasAllPlayers(b, rightIds)) return { left: a, right: b };
    if (hasAllPlayers(b, leftIds) && hasAllPlayers(a, rightIds)) return { left: b, right: a };
    return null;
  }

  if (hasAllPlayers(a, leftIds)) return { left: a, right: b };
  if (hasAllPlayers(b, leftIds)) return { left: b, right: a };
  return null;
}

function summarizeMatches(
  tournaments: StatsPlayerMatchesTournament[],
  leftIds: number[],
  rightIds: number[] = [],
): Summary {
  let played = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let gf = 0;
  let ga = 0;

  for (const tournament of tournaments) {
    for (const match of tournament.matches ?? []) {
      const perspective = matchPerspective(match, leftIds, rightIds);
      if (!perspective) continue;
      const leftGoals = Number(perspective.left.goals ?? 0);
      const rightGoals = Number(perspective.right.goals ?? 0);
      played += 1;
      gf += leftGoals;
      ga += rightGoals;
      if (leftGoals > rightGoals) wins += 1;
      else if (leftGoals < rightGoals) losses += 1;
      else draws += 1;
    }
  }

  const pts = wins * 3 + draws;
  return {
    played,
    wins,
    draws,
    losses,
    gf,
    ga,
    ptsPerMatch: played > 0 ? pts / played : 0,
  };
}

function flattenRecentMatches(tournaments: StatsPlayerMatchesTournament[]): RecentMatch[] {
  const out: RecentMatch[] = [];
  for (const tournament of tournaments) {
    for (const match of tournament.matches ?? []) {
      out.push({
        key: `${tournament.id}-${match.id}`,
        tournamentLabel: tournament.name,
        tournamentDate: tournament.date ?? null,
        match,
      });
    }
  }
  return out;
}

function fmtDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function SummaryCard({
  title,
  label,
  summary,
}: {
  title: string;
  label: string;
  summary: Summary;
}) {
  return (
    <div className="panel-subtle rounded-xl px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">{title}</div>
      <div className="mt-1 text-sm font-semibold text-text-normal">{label}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
        <span>{summary.played} matches</span>
        <span className="font-mono tabular-nums text-text-normal">
          <span className="text-status-text-green">{summary.wins}</span>
          <span className="text-text-muted">-</span>
          <span className="text-amber-300">{summary.draws}</span>
          <span className="text-text-muted">-</span>
          <span className="text-red-300">{summary.losses}</span>
        </span>
        <span className="font-mono tabular-nums">{summary.gf}:{summary.ga}</span>
        <span className="font-mono tabular-nums">{fmtAvg(summary.ptsPerMatch)} ppm</span>
      </div>
    </div>
  );
}

export default function MatchH2HPanel({
  match,
  clubs,
}: {
  match: Match;
  clubs: Club[];
}) {
  const aSide = sideBy(match, "A");
  const bSide = sideBy(match, "B");
  const aIds = useMemo(() => playerIds(aSide), [aSide]);
  const bIds = useMemo(() => playerIds(bSide), [bSide]);

  const mode = aIds.length === 2 && bIds.length === 2 ? "2v2" : aIds.length === 1 && bIds.length === 1 ? "1v1" : "overall";
  const showDuoStats = mode === "2v2";

  const matchupQuery = useQuery({
    queryKey: ["match-h2h", "opposed", mode, aIds, bIds],
    queryFn: () =>
      getStatsH2HMatches({
        mode,
        relation: "opposed",
        left_player_ids: aIds,
        right_player_ids: bIds,
        exact_teams: mode === "2v2",
        scope: "both",
      }),
    enabled: aIds.length > 0 && bIds.length > 0,
    staleTime: 30_000,
  });

  const duoAQuery = useQuery({
    queryKey: ["match-h2h", "duo", aIds],
    queryFn: () =>
      getStatsH2HMatches({
        mode: "2v2",
        relation: "teammates",
        left_player_ids: aIds,
        scope: "both",
      }),
    enabled: showDuoStats && aIds.length === 2,
    staleTime: 30_000,
  });

  const duoBQuery = useQuery({
    queryKey: ["match-h2h", "duo", bIds],
    queryFn: () =>
      getStatsH2HMatches({
        mode: "2v2",
        relation: "teammates",
        left_player_ids: bIds,
        scope: "both",
      }),
    enabled: showDuoStats && bIds.length === 2,
    staleTime: 30_000,
  });

  const matchupSummary = useMemo(
    () => summarizeMatches(matchupQuery.data?.tournaments ?? [], aIds, bIds),
    [aIds, bIds, matchupQuery.data?.tournaments],
  );
  const duoASummary = useMemo(
    () => summarizeMatches(duoAQuery.data?.tournaments ?? [], aIds),
    [aIds, duoAQuery.data?.tournaments],
  );
  const duoBSummary = useMemo(
    () => summarizeMatches(duoBQuery.data?.tournaments ?? [], bIds),
    [bIds, duoBQuery.data?.tournaments],
  );
  const recentMeetings = useMemo(
    () => flattenRecentMatches(matchupQuery.data?.tournaments ?? []).slice(0, 5),
    [matchupQuery.data?.tournaments],
  );

  if (!aIds.length || !bIds.length) {
    return <div className="card-inner-flat rounded-2xl text-sm text-text-muted">H2H is unavailable until both sides have players.</div>;
  }

  const loading = matchupQuery.isLoading || duoAQuery.isLoading || duoBQuery.isLoading;
  const error =
    (matchupQuery.error instanceof Error ? matchupQuery.error.message : null) ??
    (duoAQuery.error instanceof Error ? duoAQuery.error.message : null) ??
    (duoBQuery.error instanceof Error ? duoBQuery.error.message : null);

  return (
    <div className="space-y-3">
      <div className="card-inner-flat rounded-2xl p-3 space-y-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-text-normal">
            {playerNames(aSide)} <span className="text-text-muted">vs</span> {playerNames(bSide)}
          </div>
          <div className="text-[11px] text-text-muted">
            H2H across tournaments and friendlies{mode === "2v2" ? " with exact team matchups" : ""}.
          </div>
        </div>

        {loading ? <InlineLoading label="Loading H2H…" /> : null}
        {error ? <div className="panel-subtle rounded-xl px-3 py-2 text-sm text-red-200">{error}</div> : null}

        {!loading && !error ? (
          <>
            <SummaryCard
              title={mode === "2v2" ? "Exact matchup" : "Head-to-head"}
              label={`${playerNames(aSide)} vs ${playerNames(bSide)}`}
              summary={matchupSummary}
            />

            {showDuoStats ? (
              <div className="grid gap-2 md:grid-cols-2">
                <SummaryCard title="Team A together" label={playerNames(aSide)} summary={duoASummary} />
                <SummaryCard title="Team B together" label={playerNames(bSide)} summary={duoBSummary} />
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="card-inner-flat rounded-2xl p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-text-normal">Recent meetings</div>
          <div className="text-[11px] text-text-muted">{matchupSummary.played} total</div>
        </div>

        {!loading && !error && matchupSummary.played === 0 ? (
          <div className="panel-subtle rounded-xl px-3 py-2 text-sm text-text-muted">No finished meetings for this matchup yet.</div>
        ) : null}

        <div className="space-y-2">
          {recentMeetings.map((item) => {
            return (
              <div key={item.key} className="space-y-1">
                <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-text-muted">
                  <span className="truncate">{item.tournamentLabel}</span>
                  <span className="shrink-0">{fmtDate(item.tournamentDate)}</span>
                </div>
                <MatchRowWithClubs
                  m={item.match}
                  focusId={aIds[0] ?? null}
                  clubs={clubs}
                  showMeta={false}
                  nameColorByResult
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
