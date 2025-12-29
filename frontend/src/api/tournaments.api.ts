import { apiFetch } from "./client";
import type { TournamentSummary, TournamentDetail } from "./types";

export function listTournaments(): Promise<TournamentSummary[]> {
  return apiFetch("/tournaments", { method: "GET" });
}

export function createTournament(
  token: string,
  body: { name: string; mode: "1v1" | "2v2"; player_ids: number[] }
) {
  return apiFetch<{ id: number } & TournamentSummary>("/tournaments", {
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

export function patchTournamentDate(token: string, tournamentId: number, date: string) {
  return apiFetch(`/tournaments/${tournamentId}/date`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ date }),
  });
}

export function patchTournamentName(token: string, tournamentId: number, name: string) {
  return apiFetch(`/tournaments/${tournamentId}/name`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ name }),
  });
}

export function patchTournamentDecider(
  token: string,
  tournamentId: number,
  body: {
    type: "none" | "penalties" | "match" | "scheresteinpapier";
    winner_player_id: number | null;
    loser_player_id: number | null;
    winner_goals: number | null;
    loser_goals: number | null;
  }
) {
  return apiFetch(`/tournaments/${tournamentId}/decider`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}