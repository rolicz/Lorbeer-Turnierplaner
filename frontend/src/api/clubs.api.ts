import { apiFetch, mediaUrl } from "./client";
import type { Club, League } from "./types";

// Clubs
export function listClubs(game?: string): Promise<Club[]> {
  const q = game ? `?game=${encodeURIComponent(game)}` : "";
  return apiFetch(`/clubs${q}`);
}

/** Crest image served by our own backend; `crest_updated_at` doubles as cache buster. */
export function clubCrestUrl(clubId: number, updatedAt?: string | null): string {
  return mediaUrl(`/clubs/${clubId}/crest`, updatedAt);
}

export function createClub(
  token: string,
  body: { name: string; game: string; star_rating: number; league_id: number }
): Promise<Club> {
  return apiFetch(`/clubs`, { method: "POST", token, body: JSON.stringify(body) });
}

export function patchClub(
  token: string,
  id: number,
  body: Partial<{ name: string; game: string; star_rating: number; league_id: number }>
): Promise<Club> {
  return apiFetch(`/clubs/${id}`, { method: "PATCH", token, body: JSON.stringify(body) });
}

export function deleteClub(token: string, id: number): Promise<void> {
  return apiFetch(`/clubs/${id}`, { method: "DELETE", token });
}

// Leagues (backend-managed)
export function listLeagues(): Promise<League[]> {
  return apiFetch(`/clubs/leagues`);
}
