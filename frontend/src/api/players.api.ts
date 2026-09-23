import { apiFetch, mediaUrl } from "./client";
import type { MediaWidth } from "./mediaSizes";
import type {
  GuestbookSubjectKind,
  Player,
  PlayerGuestbookEntry,
  PlayerGuestbookReadIds,
  PlayerGuestbookReadMapRow,
  PlayerGuestbookSummary,
  PlayerPoke,
  PlayerPokeAuthoredUnreadSummary,
  PlayerPokeReadIds,
  PlayerPokeReadMapRow,
  PlayerPokeSummary,
  PlayerProfile,
  VoteVotersResponse,
} from "./types";

export function listPlayers(): Promise<Player[]> {
  return apiFetch("/players", { method: "GET" });
}

export function createPlayer(display_name: string): Promise<Player> {
  return apiFetch("/players", { method: "POST", body: JSON.stringify({ display_name }) });
}

export function patchPlayer(id: number, display_name: string): Promise<Player> {
  return apiFetch(`/players/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ display_name }),
  });
}

export function listPlayerProfiles(): Promise<Array<Pick<PlayerProfile, "player_id" | "bio" | "header_image_updated_at" | "updated_at">>> {
  return apiFetch("/players/profiles", { method: "GET" });
}

export function getPlayerProfile(playerId: number): Promise<PlayerProfile> {
  return apiFetch(`/players/${playerId}/profile`, { method: "GET" });
}

export function patchPlayerProfile(playerId: number, body: { bio?: string }): Promise<PlayerProfile> {
  return apiFetch(`/players/${playerId}/profile`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * The session decides the per-caller answers each row carries — `can_edit`
 * (`guestbook_can_edit`: the author inside the hour, or an admin) and `my_vote`. Read as
 * nobody they were `false` and `0` for everybody, which is how the edit pencil came to be
 * dead in the app while the API was right all along (G4); the cookie now goes with every
 * request by itself, and the viewer stays in the query key (`qk.playerGuestbookFull`).
 */
export function listPlayerGuestbook(playerId: number): Promise<PlayerGuestbookEntry[]> {
  return apiFetch(`/players/${playerId}/guestbook`, { method: "GET" });
}

export function listPlayerGuestbookSummary(): Promise<PlayerGuestbookSummary[]> {
  return apiFetch("/players/guestbook-summary", { method: "GET" });
}

export function listPlayerGuestbookReadIds(playerId: number): Promise<PlayerGuestbookReadIds> {
  return apiFetch(`/players/${playerId}/guestbook/read`, { method: "GET" });
}

export function listPlayerGuestbookReadMap(): Promise<PlayerGuestbookReadMapRow[]> {
  return apiFetch("/players/guestbook-read-map", { method: "GET" });
}

export function listPlayerPokeSummary(): Promise<PlayerPokeSummary[]> {
  return apiFetch("/players/pokes-summary", { method: "GET" });
}

export function listPlayerPokeAuthoredUnreadSummary(): Promise<PlayerPokeAuthoredUnreadSummary[]> {
  return apiFetch("/players/pokes-authored-unread-summary", { method: "GET" });
}

export function listPlayerPokes(playerId: number, limit = 40): Promise<PlayerPoke[]> {
  return apiFetch(`/players/${playerId}/pokes?limit=${encodeURIComponent(String(limit))}`, { method: "GET" });
}

export function listPlayerPokeReadIds(playerId: number): Promise<PlayerPokeReadIds> {
  return apiFetch(`/players/${playerId}/pokes/read`, { method: "GET" });
}

export function listPlayerPokeReadMap(): Promise<PlayerPokeReadMapRow[]> {
  return apiFetch("/players/pokes-read-map", { method: "GET" });
}

export function createPlayerPoke(playerId: number, authorPlayerId?: number | null): Promise<PlayerPoke> {
  return apiFetch(`/players/${playerId}/pokes`, {
    method: "POST",
    body: JSON.stringify({
      author_player_id: authorPlayerId ?? null,
    }),
  });
}

export function markAllPlayerPokesRead(playerId: number): Promise<{ ok: boolean; marked: number }> {
  return apiFetch(`/players/${playerId}/pokes/read-all`, { method: "PUT" });
}

export function markPlayerGuestbookEntryRead(entryId: number): Promise<{ ok: boolean }> {
  return apiFetch(`/players/guestbook/${entryId}/read`, { method: "PUT" });
}

export function votePlayerGuestbookEntry(entryId: number, value: -1 | 0 | 1): Promise<{ ok: boolean; value: number }> {
  return apiFetch(`/players/guestbook/${entryId}/vote`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

export function listPlayerGuestbookEntryVoters(entryId: number): Promise<VoteVotersResponse> {
  return apiFetch(`/players/guestbook/${entryId}/voters`, { method: "GET" });
}

export function markAllPlayerGuestbookEntriesRead(playerId: number): Promise<{ ok: boolean; marked: number }> {
  return apiFetch(`/players/${playerId}/guestbook/read-all`, { method: "PUT" });
}

export function createPlayerGuestbookEntry(
  playerId: number,
  body: string,
  parentEntryId?: number | null,
  authorPlayerId?: number | null,
  /** The subject this entry is about (K1/K2). Root entries only — a reply is a 400. */
  subjectKind?: GuestbookSubjectKind | null,
): Promise<PlayerGuestbookEntry> {
  return apiFetch(`/players/${playerId}/guestbook`, {
    method: "POST",
    body: JSON.stringify({
      body,
      parent_entry_id: parentEntryId ?? null,
      author_player_id: authorPlayerId ?? null,
      subject_kind: subjectKind ?? null,
    }),
  });
}

/**
 * The pinned copy an entry is about — never the live picture, which may have been
 * replaced since. The snapshot is immutable and its URL carries its id, so `capturedAt`
 * is only the `?v=` habit every other media URL here keeps. `width` is the rung the
 * citation thumbnail is drawn at (W2); omit it for the full snapshot.
 */
export function guestbookSubjectImageUrl(
  snapshotId: number,
  capturedAt?: string | null,
  width?: MediaWidth | null,
): string {
  return mediaUrl(`/players/guestbook-subjects/${snapshotId}/image`, capturedAt, width);
}

export function editPlayerGuestbookEntry(entryId: number, body: string): Promise<PlayerGuestbookEntry> {
  return apiFetch(`/players/guestbook/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
}

export function deletePlayerGuestbookEntry(entryId: number): Promise<void> {
  return apiFetch(`/players/guestbook/${entryId}`, { method: "DELETE" });
}
