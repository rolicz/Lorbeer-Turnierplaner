import { apiFetch } from "./client";
import type { Tournament, TournamentDetail } from "./types";

export function listTournaments(): Promise<Tournament[]> {
  return apiFetch("/tournaments", { method: "GET" });
}

export function createTournament(
  token: string,
  body: { name: string; mode: "1v1" | "2v2"; player_ids: number[] }
) {
  return apiFetch<{ id: number } & Tournament>("/tournaments", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function generateSchedule(token: string, id: number, randomize = true) {
  return apiFetch(`/tournaments/${id}/generate`, {
    method: "POST",
    token,
    body: JSON.stringify({ randomize }),
  });
}

export function getTournament(id: number): Promise<TournamentDetail> {
  return apiFetch(`/tournaments/${id}`, { method: "GET" });
}

/**
 * ADMIN: enable second leg (all-or-none).
 * Backend: PATCH /tournaments/{tournament_id}/second-leg
 *
 * NOTE: If your backend expects a different body key, adjust here.
 */
export function enableSecondLegAll(token: string, tournamentId: number) {
  return apiFetch(`/tournaments/${tournamentId}/second-leg`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ enabled: true }),
  });
}

export function disableSecondLegAll(token: string, tournamentId: number) {
  return apiFetch(`/tournaments/${tournamentId}/second-leg`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ enabled: false }),
  });
}

/**
 * ADMIN: reorder matches by providing match IDs in desired order.
 * Backend: PATCH /tournaments/{tournament_id}/reorder
 *
 * NOTE: If your backend expects a different body key, adjust here.
 */
export function reorderTournamentMatches(token: string, tournamentId: number, matchIdsInOrder: number[]) {
  return apiFetch(`/tournaments/${tournamentId}/reorder`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ match_ids: matchIdsInOrder }),
  });
}


export function patchTournamentStatus(
  token: string,
  tournamentId: number,
  status: "draft" | "live" | "done"
) {
  return apiFetch(`/tournaments/${tournamentId}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ status }),
  });
}

export function deleteTournament(token: string, tournamentId: number) {
return apiFetch(`/tournaments/${tournamentId}`, {
  method: "DELETE",
  token,
});
}