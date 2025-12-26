import { apiFetch } from "./client";
import type { Player } from "./types";

export function listPlayers(): Promise<Player[]> {
  return apiFetch("/players", { method: "GET" });
}

export function createPlayer(token: string, display_name: string): Promise<Player> {
  return apiFetch("/players", { method: "POST", token, body: JSON.stringify({ display_name }) });
}
