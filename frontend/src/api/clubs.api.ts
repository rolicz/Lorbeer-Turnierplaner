import { apiFetch } from "./client";
import type { Club } from "./types";

export function listClubs(game?: string): Promise<Club[]> {
  const qs = game ? `?game=${encodeURIComponent(game)}` : "";
  return apiFetch(`/clubs${qs}`, { method: "GET" });
}

export function createClub(token: string, body: { name: string; game: string; star_rating: number }): Promise<Club> {
  return apiFetch("/clubs", { method: "POST", token, body: JSON.stringify(body) });
}

export function patchClub(token: string, id: number, body: Partial<{ name: string; game: string; star_rating: number }>): Promise<Club> {
  return apiFetch(`/clubs/${id}`, { method: "PATCH", token, body: JSON.stringify(body) });
}

export function deleteClub(token: string, id: number) {
  return apiFetch(`/clubs/${id}`, { method: "DELETE", token });
}