import { apiFetch } from "./client";
import type { Player, PlayerGuestbookEntry, PlayerProfile } from "./types";

export function listPlayers(): Promise<Player[]> {
  return apiFetch("/players", { method: "GET" });
}

export function createPlayer(token: string, display_name: string): Promise<Player> {
  return apiFetch("/players", { method: "POST", token, body: JSON.stringify({ display_name }) });
}

export function patchPlayer(token: string, id: number, display_name: string): Promise<Player> {
  return apiFetch(`/players/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ display_name }),
  });
}

export function listPlayerProfiles(): Promise<Array<Pick<PlayerProfile, "player_id" | "bio" | "header_image_updated_at" | "updated_at">>> {
  return apiFetch("/players/profiles", { method: "GET" });
}

export function getPlayerProfile(playerId: number): Promise<PlayerProfile> {
  return apiFetch(`/players/${playerId}/profile`, { method: "GET" });
}

export function patchPlayerProfile(token: string, playerId: number, body: { bio?: string }): Promise<PlayerProfile> {
  return apiFetch(`/players/${playerId}/profile`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}

export function listPlayerGuestbook(playerId: number): Promise<PlayerGuestbookEntry[]> {
  return apiFetch(`/players/${playerId}/guestbook`, { method: "GET" });
}

export function createPlayerGuestbookEntry(
  token: string,
  playerId: number,
  body: string,
): Promise<PlayerGuestbookEntry> {
  return apiFetch(`/players/${playerId}/guestbook`, {
    method: "POST",
    token,
    body: JSON.stringify({ body }),
  });
}

export function deletePlayerGuestbookEntry(token: string, entryId: number): Promise<void> {
  return apiFetch(`/players/guestbook/${entryId}`, { method: "DELETE", token });
}
