import { apiFetch, apiUpload, mediaUrl } from "./client";
import type { MediaWidth } from "./mediaSizes";

export type PlayerAvatarMeta = { player_id: number; updated_at: string };

export function listPlayerAvatarMeta(): Promise<PlayerAvatarMeta[]> {
  return apiFetch(`/players/avatars`, { method: "GET" });
}

/** `width` is the rung the disc is drawn at (W2); omit it for the original file. */
export function playerAvatarUrl(playerId: number, updatedAt?: string | null, width?: MediaWidth | null): string {
  return mediaUrl(`/players/${playerId}/avatar`, updatedAt, width);
}

export async function putPlayerAvatar(
  playerId: number,
  blob: Blob,
  filename = "avatar.webp"
): Promise<{ player_id: number; updated_at: string }> {
  const fd = new FormData();
  fd.append("file", blob, filename);
  return apiUpload(`/players/${playerId}/avatar`, { body: fd });
}

export async function deletePlayerAvatar(playerId: number): Promise<void> {
  return apiFetch<void>(`/players/${playerId}/avatar`, { method: "DELETE" });
}

