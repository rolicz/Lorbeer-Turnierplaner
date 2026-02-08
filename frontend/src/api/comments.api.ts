import { apiFetch } from "./client";
import type { TournamentCommentsResponse, TournamentCommentsSummary, Comment } from "./types";

export function listTournamentComments(tournamentId: number): Promise<TournamentCommentsResponse> {
  return apiFetch(`/tournaments/${tournamentId}/comments`, { method: "GET" });
}

export function listTournamentCommentsSummary(): Promise<TournamentCommentsSummary[]> {
  // Served by the tournaments router to avoid being shadowed by "/tournaments/{tournament_id}".
  return apiFetch(`/tournaments/comments-summary`, { method: "GET" });
}

export function createTournamentComment(
  token: string,
  tournamentId: number,
  body: {
    match_id?: number | null;
    author_player_id?: number | null;
    body: string;
  }
): Promise<Comment> {
  return apiFetch(`/tournaments/${tournamentId}/comments`, {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export function patchComment(
  token: string,
  commentId: number,
  body: { author_player_id?: number | null; body?: string }
): Promise<Comment> {
  return apiFetch(`/comments/${commentId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}

export function deleteComment(token: string, commentId: number) {
  return apiFetch(`/comments/${commentId}`, { method: "DELETE", token });
}

export function setPinnedTournamentComment(token: string, tournamentId: number, commentId: number | null) {
  return apiFetch<{ pinned_comment_id: number | null }>(`/tournaments/${tournamentId}/comments/pin`, {
    method: "PUT",
    token,
    body: JSON.stringify({ comment_id: commentId }),
  });
}
