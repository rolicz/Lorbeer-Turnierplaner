import { apiFetch } from "./client";
import { StatsPlayersResponse } from "./types";

export function getStatsPlayers(): Promise<StatsPlayersResponse> {
    return apiFetch("/stats/players", { method: "GET" });
}