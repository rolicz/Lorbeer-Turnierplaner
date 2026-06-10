import { apiFetch, apiUpload, mediaUrl } from "./client";

export type PlayerHeaderMeta = { player_id: number; updated_at: string };

export function listPlayerHeaderMeta(): Promise<PlayerHeaderMeta[]> {
  return apiFetch(`/players/headers`, { method: "GET" });
}

export function playerHeaderImageUrl(playerId: number, updatedAt?: string | null): string {
  return mediaUrl(`/players/${playerId}/header-image`, updatedAt);
}

export async function putPlayerHeaderImage(
  token: string,
  playerId: number,
  blob: Blob,
  filename = "header.webp",
): Promise<{ player_id: number; updated_at: string }> {
  const fd = new FormData();
  fd.append("file", blob, filename);
  return apiUpload(`/players/${playerId}/header-image`, { token, body: fd });
}

export async function deletePlayerHeaderImage(token: string, playerId: number): Promise<void> {
  return apiFetch<void>(`/players/${playerId}/header-image`, { method: "DELETE", token });
}
