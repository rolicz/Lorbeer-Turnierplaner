import { apiFetch, API_BASE } from "./client";

export type PlayerAvatarMeta = { player_id: number; updated_at: string };

export function listPlayerAvatarMeta(): Promise<PlayerAvatarMeta[]> {
  return apiFetch(`/players/avatars`, { method: "GET" });
}

export function playerAvatarUrl(playerId: number, updatedAt?: string | null): string {
  const base = API_BASE.replace(/\/+$/, "");
  const v = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
  return `${base}/players/${playerId}/avatar${v}`;
}

export async function putPlayerAvatar(
  token: string,
  playerId: number,
  blob: Blob,
  filename = "avatar.webp"
): Promise<{ player_id: number; updated_at: string }> {
  const fd = new FormData();
  fd.append("file", blob, filename);

  // Don't use apiFetch here because we must not set Content-Type manually
  // (the browser needs to add the multipart boundary).
  const url = `${API_BASE.replace(/\/+$/, "")}/players/${playerId}/avatar`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${txt}`);
  }
  return (await res.json()) as { player_id: number; updated_at: string };
}

export async function deletePlayerAvatar(token: string, playerId: number): Promise<void> {
  return apiFetch<void>(`/players/${playerId}/avatar`, { method: "DELETE", token });
}

