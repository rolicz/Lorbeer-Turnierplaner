import { apiFetch } from "./client";
import type { ReassignPreview, TournamentSummary, TournamentDetail } from "./types";

/** The session decides the per-caller `can_edit` / `can_delete` / `can_set_decider`
 * flags each row carries (A10). */
export function listTournaments(): Promise<TournamentSummary[]> {
  return apiFetch("/tournaments", { method: "GET" });
}

export function createTournament(
  body: {
    name: string;
    mode: "1v1" | "2v2";
    player_ids: number[];
    auto_generate?: boolean;
    randomize?: boolean;
  }
) {
  return apiFetch<{ id: number } & TournamentSummary>("/tournaments", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function generateSchedule(id: number, randomize = true) {
  return apiFetch(`/tournaments/${id}/generate`, {
    method: "POST",
    body: JSON.stringify({ randomize }),
  });
}

/** The session decides the capability flags in the payload (A10). */
export function getTournament(id: number): Promise<TournamentDetail> {
  return apiFetch(`/tournaments/${id}`, { method: "GET" });
}

/**
 * ADMIN: enable second leg (all-or-none).
 * Backend: PATCH /tournaments/{tournament_id}/second-leg
 *
 * NOTE: If your backend expects a different body key, adjust here.
 */
export function enableSecondLegAll(tournamentId: number) {
  return apiFetch(`/tournaments/${tournamentId}/second-leg`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: true }),
  });
}

export function disableSecondLegAll(tournamentId: number) {
  return apiFetch(`/tournaments/${tournamentId}/second-leg`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: false }),
  });
}

/**
 * ADMIN: reorder matches by providing match IDs in desired order.
 * Backend: PATCH /tournaments/{tournament_id}/reorder
 *
 * NOTE: If your backend expects a different body key, adjust here.
 */
export function reorderTournamentMatches(tournamentId: number, matchIdsInOrder: number[]) {
  return apiFetch(`/tournaments/${tournamentId}/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ match_ids: matchIdsInOrder }),
  });
}

export function deleteTournament(tournamentId: number) {
  return apiFetch(`/tournaments/${tournamentId}`, { method: "DELETE" });
}

export function patchTournamentDate(tournamentId: number, date: string) {
  return apiFetch(`/tournaments/${tournamentId}/date`, {
    method: "PATCH",
    body: JSON.stringify({ date }),
  });
}

export function patchTournamentName(tournamentId: number, name: string) {
  return apiFetch(`/tournaments/${tournamentId}`, {
    method: "PATCH",
    body: JSON.stringify({ "name" : name }),
  });
}

export function patchTournamentDecider(
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
    body: JSON.stringify(body),
  });
}

/** What a re-assign would clear — asked for when the confirmation opens, never guessed. */
export function getReassignPreview(tournamentId: number) {
  return apiFetch<ReassignPreview>(`/tournaments/${tournamentId}/reassign-preview`);
}

export function reassign2v2Schedule(
  tournamentId: number,
  randomize_order: boolean = true
) {
  return apiFetch<{ ok: true; matches: number; second_leg: boolean; status: string }>(
    `/tournaments/${tournamentId}/reassign`,
    {
      method: "POST",
      body: JSON.stringify({ randomize_order }),
    }
  );
}
