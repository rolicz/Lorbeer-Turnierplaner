import { apiFetch } from "./client";

export function patchMatch(
  token: string,
  matchId: number,
  body: {
    state?: "scheduled" | "playing" | "finished";
    sideA?: { club_id?: number | null; goals?: number };
    sideB?: { club_id?: number | null; goals?: number };
  }
) {
  return apiFetch(`/matches/${matchId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}

/**
 * ADMIN-only patch (optional usage).
 * Use if your backend allows changing leg/order_index/etc on matches.
 */
export function adminPatchMatch(
  token: string,
  matchId: number,
  body: { leg?: 1 | 2; order_index?: number }
) {
  return apiFetch(`/matches/${matchId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}
