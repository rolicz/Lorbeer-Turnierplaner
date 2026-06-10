import { apiFetch, apiUpload, mediaUrl } from "./client";

export type PlayerAvatarMeta = { player_id: number; updated_at: string };

export function listPlayerAvatarMeta(): Promise<PlayerAvatarMeta[]> {
  return apiFetch(`/players/avatars`, { method: "GET" });
}

export function playerAvatarUrl(playerId: number, updatedAt?: string | null): string {
  return mediaUrl(`/players/${playerId}/avatar`, updatedAt);
}

export async function putPlayerAvatar(
  token: string,
  playerId: number,
  blob: Blob,
  filename = "avatar.webp"
): Promise<{ player_id: number; updated_at: string }> {
  const fd = new FormData();
  fd.append("file", blob, filename);
  return apiUpload(`/players/${playerId}/avatar`, { token, body: fd });
}

export async function deletePlayerAvatar(token: string, playerId: number): Promise<void> {
  return apiFetch<void>(`/players/${playerId}/avatar`, { method: "DELETE", token });
}

