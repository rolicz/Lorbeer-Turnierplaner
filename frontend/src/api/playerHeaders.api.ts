import { apiFetch, apiUpload, mediaUrl } from "./client";
import type { MediaWidth } from "./mediaSizes";

export type PlayerHeaderMeta = { player_id: number; updated_at: string };

export function listPlayerHeaderMeta(): Promise<PlayerHeaderMeta[]> {
  return apiFetch(`/players/headers`, { method: "GET" });
}

/** `width` is the rung the banner is drawn at (W2); omit it for the full-size picture. */
export function playerHeaderImageUrl(playerId: number, updatedAt?: string | null, width?: MediaWidth | null): string {
  return mediaUrl(`/players/${playerId}/header-image`, updatedAt, width);
}

export async function putPlayerHeaderImage(
  playerId: number,
  blob: Blob,
  filename = "header.webp",
): Promise<{ player_id: number; updated_at: string }> {
  const fd = new FormData();
  fd.append("file", blob, filename);
  return apiUpload(`/players/${playerId}/header-image`, { body: fd });
}

export async function deletePlayerHeaderImage(playerId: number): Promise<void> {
  return apiFetch<void>(`/players/${playerId}/header-image`, { method: "DELETE" });
}
