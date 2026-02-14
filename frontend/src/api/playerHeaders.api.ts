import { apiFetch, API_BASE } from "./client";

export type PlayerHeaderMeta = { player_id: number; updated_at: string };

export function listPlayerHeaderMeta(): Promise<PlayerHeaderMeta[]> {
  return apiFetch(`/players/headers`, { method: "GET" });
}

export function playerHeaderImageUrl(playerId: number, updatedAt?: string | null): string {
  const base = API_BASE.replace(/\/+$/, "");
  const v = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
  return `${base}/players/${playerId}/header-image${v}`;
}

export async function putPlayerHeaderImage(
  token: string,
  playerId: number,
  blob: Blob,
  filename = "header.webp",
): Promise<{ player_id: number; updated_at: string }> {
  const fd = new FormData();
  fd.append("file", blob, filename);
  const url = `${API_BASE.replace(/\/+$/, "")}/players/${playerId}/header-image`;
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

export async function deletePlayerHeaderImage(token: string, playerId: number): Promise<void> {
  return apiFetch<void>(`/players/${playerId}/header-image`, { method: "DELETE", token });
}
