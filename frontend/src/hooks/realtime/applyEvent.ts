/**
 * Pure cache reducers for realtime events: given the QueryClient + a parsed
 * message, apply a surgical setQueryData (zero refetch) where possible, or a
 * narrow invalidation otherwise. Unit-tested in src/test/applyEvent.test.ts.
 */
import type { QueryClient } from "@tanstack/react-query";
import { qk } from "../../api/queryKeys";
import type { Comment, TournamentCommentsResponse, TournamentDetail } from "../../api/types";
import type { RealtimeMessage } from "./connection";

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});

/** Replace the whole tournament cache with the pushed full state (no merge). */
export function applyTournamentSync(qc: QueryClient, payload: unknown) {
  const p = asObj(payload);
  const tid = Number(p.tournament_id);
  const tournament = p.tournament;
  if (!tournament || !Number.isFinite(tid)) return;
  qc.setQueryData(qk.tournament(tid), tournament as TournamentDetail);
}

export function applyTournamentDeleted(qc: QueryClient, payload: unknown) {
  const tid = Number(asObj(payload).tournament_id);
  if (!Number.isFinite(tid)) return;
  qc.removeQueries({ queryKey: qk.tournament(tid) });
  void qc.invalidateQueries({ queryKey: qk.tournaments() });
  void qc.invalidateQueries({ queryKey: qk.tournamentsLive() });
}

/**
 * Upsert a comment into every cached comments query for the tournament.
 * For an existing comment we PRESERVE the viewer's vote state (votes/my_vote
 * are viewer-specific and not carried by the broadcast); new comments append.
 */
export function applyCommentUpsert(qc: QueryClient, payload: unknown) {
  const p = asObj(payload);
  const tid = Number(p.tournament_id);
  const comment = p.comment as Comment | undefined;
  if (!comment || !Number.isFinite(tid)) return;

  qc.setQueriesData<TournamentCommentsResponse>({ queryKey: qk.commentsTournament(tid) }, (prev) => {
    if (!prev) return prev;
    const comments = prev.comments ?? [];
    const idx = comments.findIndex((c) => c.id === comment.id);
    if (idx === -1) {
      return { ...prev, comments: [...comments, comment] };
    }
    const existing = comments[idx];
    // Keep the viewer-specific vote fields (not carried by the broadcast).
    const merged = {
      ...comment,
      upvotes: existing.upvotes,
      downvotes: existing.downvotes,
      my_vote: existing.my_vote,
    };
    const next = comments.slice();
    next[idx] = merged;
    return { ...prev, comments: next };
  });
}

export function applyCommentDelete(qc: QueryClient, payload: unknown) {
  const p = asObj(payload);
  const tid = Number(p.tournament_id);
  const cid = Number(p.comment_id);
  if (!Number.isFinite(tid) || !Number.isFinite(cid)) return;
  qc.setQueriesData<TournamentCommentsResponse>({ queryKey: qk.commentsTournament(tid) }, (prev) => {
    if (!prev) return prev;
    return {
      pinned_comment_id: prev.pinned_comment_id === cid ? null : prev.pinned_comment_id,
      comments: (prev.comments ?? []).filter((c) => c.id !== cid),
    };
  });
}

/** Vote / pin / read metadata changed -> narrow refetch (accurate counts + my_vote). */
export function applyCommentMeta(qc: QueryClient, payload: unknown) {
  const tid = Number(asObj(payload).tournament_id);
  if (!Number.isFinite(tid)) return;
  void qc.invalidateQueries({ queryKey: qk.commentsTournament(tid) });
  void qc.invalidateQueries({ queryKey: qk.commentsSummary() });
}

/** Coarse global notify: refresh list/live; only touch stats/cup on result-grade changes. */
export function applyTournamentsChanged(qc: QueryClient, payload: unknown) {
  const p = asObj(payload);
  const action = typeof p.action === "string" ? p.action : "";
  void qc.invalidateQueries({ queryKey: qk.tournaments() });
  void qc.invalidateQueries({ queryKey: qk.tournamentsLive() });
  void qc.invalidateQueries({ queryKey: qk.commentsSummary() });
  if (action === "deleted" || action === "status") {
    void qc.invalidateQueries({ queryKey: qk.stats.all() });
    void qc.invalidateQueries({ queryKey: qk.cupAll() });
  }
}

/** Route a tournament-channel message to the right reducer. */
export function applyTournamentMessage(qc: QueryClient, msg: RealtimeMessage) {
  switch (msg.event) {
    case "tournament.sync":
      return applyTournamentSync(qc, msg.payload);
    case "tournament.deleted":
      return applyTournamentDeleted(qc, msg.payload);
    case "comment.upsert":
      return applyCommentUpsert(qc, msg.payload);
    case "comment.delete":
      return applyCommentDelete(qc, msg.payload);
    case "comment.meta":
      return applyCommentMeta(qc, msg.payload);
    default:
      return;
  }
}

/** Route a global-channel (`/ws/tournaments`) message. */
export function applyGlobalMessage(qc: QueryClient, msg: RealtimeMessage) {
  if (msg.event === "tournaments.changed") return applyTournamentsChanged(qc, msg.payload);
}
