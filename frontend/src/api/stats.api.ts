import { apiFetch } from "./client";
import { StatsH2HResponse, StatsPlayersResponse, StatsStreaksResponse } from "./types";

export function getStatsPlayers(): Promise<StatsPlayersResponse> {
    return apiFetch("/stats/players", { method: "GET" });
}

export function getStatsH2H(opts?: {
    playerId?: number | null;
    limit?: number;
    order?: "rivalry" | "played";
}): Promise<StatsH2HResponse> {
    const qs = new URLSearchParams();
    if (opts?.playerId != null) qs.set("player_id", String(opts.playerId));
    if (opts?.limit != null) qs.set("limit", String(opts.limit));
    if (opts?.order != null) qs.set("order", String(opts.order));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return apiFetch(`/stats/h2h${suffix}`, { method: "GET" });
}

export function getStatsStreaks(opts?: {
    mode?: "overall" | "1v1" | "2v2";
    playerId?: number | null;
    limit?: number;
}): Promise<StatsStreaksResponse> {
    const qs = new URLSearchParams();
    if (opts?.mode) qs.set("mode", String(opts.mode));
    if (opts?.playerId != null) qs.set("player_id", String(opts.playerId));
    if (opts?.limit != null) qs.set("limit", String(opts.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return apiFetch(`/stats/streaks${suffix}`, { method: "GET" });
}
