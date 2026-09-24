import { apiFetch } from "./client";
import type { Player } from "./types";

export type FriendlyMatchCreateBody = {
  mode: "1v1" | "2v2";
  teamA_player_ids: number[];
  teamB_player_ids: number[];
  clubA_id: number | null;
  clubB_id: number | null;
  a_goals: number;
  b_goals: number;
};

export type FriendlyMatchPatchBody = {
  state?: "scheduled" | "playing" | "finished";
  sideA?: { club_id?: number | null; goals?: number };
  sideB?: { club_id?: number | null; goals?: number };
};

export type FriendlyMatchResponse = {
  id: number;
  /** Per-caller capability flags computed by the backend (A10) — never re-derive them here. */
  can_edit: boolean;
  can_delete: boolean;
  mode: "1v1" | "2v2";
  state: string;
  date: string;
  created_at: string;
  updated_at: string;
  sides: Array<{
    id: number;
    side: "A" | "B";
    club_id: number | null;
    goals: number;
    players: Player[];
  }>;
};

/** The session decides the `can_edit` / `can_delete` flags per row (A10). */
export function listFriendlies(opts?: { mode?: "1v1" | "2v2"; limit?: number }): Promise<FriendlyMatchResponse[]> {
  const qs = new URLSearchParams();
  if (opts?.mode) qs.set("mode", String(opts.mode));
  if (opts?.limit != null) qs.set("limit", String(opts.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch(`/friendlies${suffix}`, { method: "GET" });
}

export function createFriendlyMatch(body: FriendlyMatchCreateBody): Promise<FriendlyMatchResponse> {
  return apiFetch("/friendlies", { method: "POST", body: JSON.stringify(body) });
}

export function patchFriendlyMatch(friendlyId: number, body: FriendlyMatchPatchBody): Promise<FriendlyMatchResponse> {
  return apiFetch(`/friendlies/${friendlyId}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteFriendlyMatch(friendlyId: number): Promise<{ ok: boolean }> {
  return apiFetch(`/friendlies/${friendlyId}`, { method: "DELETE" });
}
