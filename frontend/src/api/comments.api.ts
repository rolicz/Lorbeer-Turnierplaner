import { apiFetch } from "./client";
import { API_BASE } from "./client";
import type {
  TournamentCommentsResponse,
  TournamentCommentsSummary,
  TournamentCommentReadIds,
  TournamentCommentReadMapRow,
  Comment,
} from "./types";

export function listTournamentComments(tournamentId: number): Promise<TournamentCommentsResponse> {
  return apiFetch(`/tournaments/${tournamentId}/comments`, { method: "GET" });
}

export function listTournamentCommentsSummary(): Promise<TournamentCommentsSummary[]> {
  // Served by the tournaments router to avoid being shadowed by "/tournaments/{tournament_id}".
  return apiFetch(`/tournaments/comments-summary`, { method: "GET" });
}

export function listTournamentCommentReadIds(token: string, tournamentId: number): Promise<TournamentCommentReadIds> {
  return apiFetch(`/tournaments/${tournamentId}/comments/read`, { method: "GET", token });
}

export function listTournamentCommentReadMap(token: string): Promise<TournamentCommentReadMapRow[]> {
  return apiFetch(`/comments/read-map`, { method: "GET", token });
}

export function markCommentRead(token: string, commentId: number): Promise<{ ok: boolean }> {
  return apiFetch(`/comments/${commentId}/read`, { method: "PUT", token });
}

export function markAllTournamentCommentsRead(
  token: string,
  tournamentId: number
): Promise<{ ok: boolean; marked: number }> {
  return apiFetch(`/tournaments/${tournamentId}/comments/read-all`, { method: "PUT", token });
}

export function createTournamentComment(
  token: string,
  tournamentId: number,
  body: {
    match_id?: number | null;
    author_player_id?: number | null;
    body: string;
    has_image?: boolean;
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

export function commentImageUrl(commentId: number, updatedAt?: string | null): string {
  const base = API_BASE.replace(/\/+$/, "");
  const v = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
  return `${base}/comments/${commentId}/image${v}`;
}

export async function putCommentImage(
  token: string,
  commentId: number,
  blob: Blob,
  filename = "comment.webp"
): Promise<Comment> {
  const fd = new FormData();
  fd.append("file", blob, filename);
  const url = `${API_BASE.replace(/\/+$/, "")}/comments/${commentId}/image`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${txt}`);
  }
  return (await res.json()) as Comment;
}

export function deleteCommentImage(token: string, commentId: number) {
  return apiFetch<{ ok: boolean }>(`/comments/${commentId}/image`, { method: "DELETE", token });
}

export function setPinnedTournamentComment(token: string, tournamentId: number, commentId: number | null) {
  return apiFetch<{ pinned_comment_id: number | null }>(`/tournaments/${tournamentId}/comments/pin`, {
    method: "PUT",
    token,
    body: JSON.stringify({ comment_id: commentId }),
  });
}
