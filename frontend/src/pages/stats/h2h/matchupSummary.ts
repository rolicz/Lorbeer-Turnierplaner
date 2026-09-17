/**
 * Pure helpers for "A vs B" matchup summaries, shared by the match-detail H2H panel
 * and the stats Matchup view. Everything here works on the `POST /stats/h2h-matches`
 * payload (tournaments newest first, each with its matches).
 */
import type { MatchSide, StatsMatch, StatsPlayerMatchesTournament } from "../../../api/types";
import { sideBy } from "../../../helpers";
import { joinNames } from "../../../utils/matchDisplay";

export type Summary = {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  ptsPerMatch: number;
};

export type RecentMatch = {
  key: string;
  tournamentLabel: string;
  tournamentDate: string | null;
  match: StatsMatch;
};

/** Result of a single match from the left side's perspective. */
export type MatchResult = "W" | "D" | "L";

/** Sorted, positive player ids of a side (stable for query keys). */
export function playerIds(side?: MatchSide): number[] {
  return [...(side?.players ?? [])]
    .map((p) => Number(p.id))
    .filter((id) => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b);
}

/** "Roli" / "Roli / Flo" — the side's player names, or "—" when unknown. */
export function playerNames(side?: MatchSide): string {
  const names = (side?.players ?? []).map((p) => p.display_name).filter(Boolean);
  if (!names.length) return "—";
  return joinNames(names);
}

/** Whether every id is on that side (subset match: partners may differ). */
export function hasAllPlayers(side: MatchSide | undefined, ids: number[]) {
  if (!side || !ids.length) return false;
  const sideIds = new Set(
    (side.players ?? [])
      .map((p) => Number(p.id))
      .filter((id) => Number.isFinite(id) && id > 0),
  );
  return ids.every((id) => sideIds.has(id));
}

/**
 * Orient a match so `left` is the side holding `leftIds`. With `rightIds` both sides
 * must match (in either order); without it any opponent counts. Returns null when the
 * match does not fit the matchup.
 */
export function matchPerspective(match: StatsMatch, leftIds: number[], rightIds: number[] = []) {
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

/** Played / W-D-L / goals / points per match from the left side's perspective. */
export function summarizeMatches(
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

/** Flatten the grouped payload into single matches, keeping the API order. */
export function flattenRecentMatches(tournaments: StatsPlayerMatchesTournament[]): RecentMatch[] {
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

/**
 * W/D/L per matching match from the left side's perspective, in the order the API
 * returns them (newest first).
 */
export function resultsTimeline(
  tournaments: StatsPlayerMatchesTournament[],
  leftIds: number[],
  rightIds: number[] = [],
): MatchResult[] {
  const out: MatchResult[] = [];
  for (const tournament of tournaments) {
    for (const match of tournament.matches ?? []) {
      const perspective = matchPerspective(match, leftIds, rightIds);
      if (!perspective) continue;
      const leftGoals = Number(perspective.left.goals ?? 0);
      const rightGoals = Number(perspective.right.goals ?? 0);
      out.push(leftGoals > rightGoals ? "W" : leftGoals < rightGoals ? "L" : "D");
    }
  }
  return out;
}

/** Current streak: equal results counted from the newest entry. Null when empty. */
export function currentRun(results: MatchResult[]): { kind: MatchResult; length: number } | null {
  const kind = results[0];
  if (!kind) return null;
  let length = 0;
  for (const r of results) {
    if (r !== kind) break;
    length += 1;
  }
  return { kind, length };
}
