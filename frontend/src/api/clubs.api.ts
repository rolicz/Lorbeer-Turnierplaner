import { apiFetch, mediaUrl } from "./client";
import type { Club, ClubStarHistory, League } from "./types";

// Clubs
export function listClubs(game?: string): Promise<Club[]> {
  const q = game ? `?game=${encodeURIComponent(game)}` : "";
  return apiFetch(`/clubs${q}`);
}

/** Crest image served by our own backend; `crest_updated_at` doubles as cache buster. */
export function clubCrestUrl(clubId: number, updatedAt?: string | null): string {
  return mediaUrl(`/clubs/${clubId}/crest`, updatedAt);
}

export function createClub(body: { name: string; game: string; star_rating: number; league_id: number }): Promise<Club> {
  return apiFetch(`/clubs`, { method: "POST", body: JSON.stringify(body) });
}

export function patchClub(
  id: number,
  body: Partial<{ name: string; game: string; star_rating: number; league_id: number }>
): Promise<Club> {
  return apiFetch(`/clubs/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

/** Every recorded rating of one club, oldest first (R4). */
export function getClubStarHistory(id: number): Promise<ClubStarHistory> {
  return apiFetch(`/clubs/${id}/star-history`);
}

/** Site admin (L12): the rating the current group counts today becomes the global one,
 * from today on. Answers the club's new history. */
export function promoteClubStars(id: number): Promise<ClubStarHistory> {
  return apiFetch(`/clubs/${id}/stars/promote`, { method: "POST" });
}

export function deleteClub(id: number): Promise<void> {
  return apiFetch(`/clubs/${id}`, { method: "DELETE" });
}

// Leagues (backend-managed)
export function listLeagues(): Promise<League[]> {
  return apiFetch(`/clubs/leagues`);
}
