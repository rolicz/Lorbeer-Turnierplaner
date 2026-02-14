import { apiFetch } from "./client";
import {
  MatchOdds,
  StatsH2HMatchesResponse,
  StatsH2HResponse,
  StatsPlayerMatchesResponse,
  StatsPlayersResponse,
  StatsRatingsResponse,
  StatsScope,
  StatsStreaksResponse,
} from "./types";

export function getStatsPlayers(opts?: { lastN?: number; mode?: "overall" | "1v1" | "2v2" }): Promise<StatsPlayersResponse> {
    const qs = new URLSearchParams();
    if (opts?.lastN != null) qs.set("lastN", String(opts.lastN));
    if (opts?.mode && opts.mode !== "overall") qs.set("mode", String(opts.mode));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return apiFetch(`/stats/players${suffix}`, { method: "GET" });
}

export function getStatsH2H(opts?: {
    playerId?: number | null;
    limit?: number;
    order?: "rivalry" | "played";
    scope?: StatsScope;
}): Promise<StatsH2HResponse> {
    const qs = new URLSearchParams();
    if (opts?.playerId != null) qs.set("player_id", String(opts.playerId));
    if (opts?.limit != null) qs.set("limit", String(opts.limit));
    if (opts?.order != null) qs.set("order", String(opts.order));
    if (opts?.scope && opts.scope !== "tournaments") qs.set("scope", String(opts.scope));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return apiFetch(`/stats/h2h${suffix}`, { method: "GET" });
}

export type StatsH2HMatchesRequest = {
  mode: "overall" | "1v1" | "2v2";
  relation: "opposed" | "teammates";
  left_player_ids: number[];
  right_player_ids?: number[];
  exact_teams?: boolean;
  scope?: StatsScope;
};

export function getStatsH2HMatches(req: StatsH2HMatchesRequest): Promise<StatsH2HMatchesResponse> {
  return apiFetch(`/stats/h2h-matches`, {
    method: "POST",
    body: JSON.stringify({
      mode: req.mode,
      relation: req.relation,
      left_player_ids: req.left_player_ids,
      right_player_ids: req.right_player_ids ?? [],
      exact_teams: !!req.exact_teams,
      scope: req.scope ?? "tournaments",
    }),
  });
}

export function getStatsStreaks(opts?: {
    mode?: "overall" | "1v1" | "2v2";
    playerId?: number | null;
    limit?: number;
    scope?: StatsScope;
}): Promise<StatsStreaksResponse> {
    const qs = new URLSearchParams();
    if (opts?.mode) qs.set("mode", String(opts.mode));
    if (opts?.playerId != null) qs.set("player_id", String(opts.playerId));
    if (opts?.limit != null) qs.set("limit", String(opts.limit));
    if (opts?.scope && opts.scope !== "tournaments") qs.set("scope", String(opts.scope));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return apiFetch(`/stats/streaks${suffix}`, { method: "GET" });
}

export function getStatsPlayerMatches(opts: { playerId: number; scope?: StatsScope }): Promise<StatsPlayerMatchesResponse> {
    const qs = new URLSearchParams();
    qs.set("player_id", String(opts.playerId));
    if (opts.scope && opts.scope !== "tournaments") qs.set("scope", String(opts.scope));
    return apiFetch(`/stats/player-matches?${qs.toString()}`, { method: "GET" });
}

export function getStatsRatings(opts?: { mode?: "overall" | "1v1" | "2v2"; scope?: StatsScope }): Promise<StatsRatingsResponse> {
    const qs = new URLSearchParams();
    if (opts?.mode && opts.mode !== "overall") qs.set("mode", String(opts.mode));
    if (opts?.scope && opts.scope !== "tournaments") qs.set("scope", String(opts.scope));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return apiFetch(`/stats/ratings${suffix}`, { method: "GET" });
}

export type StatsOddsRequest = {
  mode: "1v1" | "2v2";
  teamA_player_ids: number[];
  teamB_player_ids: number[];
  clubA_id: number | null;
  clubB_id: number | null;
  state: "scheduled" | "playing";
  a_goals: number;
  b_goals: number;
};

export type StatsOddsResponse = {
  odds: MatchOdds | null;
};

export function getStatsOdds(req: StatsOddsRequest): Promise<StatsOddsResponse> {
  return apiFetch(`/stats/odds`, { method: "POST", body: JSON.stringify(req) });
}
