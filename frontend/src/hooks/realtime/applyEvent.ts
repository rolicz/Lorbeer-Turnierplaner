/**
 * Pure cache reducers for realtime events: given the QueryClient + a parsed
 * message, apply a surgical setQueryData (zero refetch) where possible, or a
 * narrow invalidation otherwise. Unit-tested in src/test/applyEvent.test.ts.
 */
import type { QueryClient } from "@tanstack/react-query";
import { qk } from "../../api/queryKeys";
import type { TournamentCommentsResponse, TournamentDetail } from "../../api/types";
import type { RealtimeMessage } from "./connection";
import {
  WS_COMMENT_DELETE,
  WS_COMMENT_META,
  WS_COMMENT_UPSERT,
  WS_TOURNAMENT_DELETED,
  WS_TOURNAMENT_SYNC,
  WS_TOURNAMENTS_CHANGED,
  type CommentDeletePayload,
  type CommentMetaPayload,
  type CommentUpsertPayload,
  type TournamentDeletedPayload,
  type TournamentSyncPayload,
  type TournamentsChangedPayload,
} from "./wsEvents";

// Coerce an untrusted WS payload to its declared shape. Stays defensive (returns {} for
// non-objects); the type parameter makes the per-event payload contract compile-time checked.
const asObj = <T = Record<string, unknown>>(v: unknown): Partial<T> =>
  v && typeof v === "object" ? (v as Partial<T>) : {};

/**
 * Replace the whole tournament cache with the pushed full state.
 * The broadcast has no single viewer, so it cannot know this viewer's capability flags
 * (A10) — they arrive all-false and are kept from what the viewer already fetched, the
 * same way `applyCommentUpsert` keeps a comment's votes and `can_edit`.
 */
export function applyTournamentSync(qc: QueryClient, payload: unknown) {
  const p = asObj<TournamentSyncPayload>(payload);
  const tid = Number(p.tournament_id);
  const tournament = p.tournament;
  if (!tournament || !Number.isFinite(tid)) return;
  const existing = qc.getQueryData<TournamentDetail>(qk.tournament(tid));
  qc.setQueryData(
    qk.tournament(tid),
    existing
      ? {
          ...tournament,
          can_edit: existing.can_edit,
          can_delete: existing.can_delete,
          can_set_decider: existing.can_set_decider,
        }
      : tournament,
  );
}

export function applyTournamentDeleted(qc: QueryClient, payload: unknown) {
  const tid = Number(asObj<TournamentDeletedPayload>(payload).tournament_id);
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
  const p = asObj<CommentUpsertPayload>(payload);
  const tid = Number(p.tournament_id);
  const comment = p.comment;
  if (!comment || !Number.isFinite(tid)) return;

  qc.setQueriesData<TournamentCommentsResponse>({ queryKey: qk.commentsTournament(tid) }, (prev) => {
    if (!prev) return prev;
    const comments = prev.comments ?? [];
    const idx = comments.findIndex((c) => c.id === comment.id);
    if (idx === -1) {
      return { ...prev, comments: [...comments, comment] };
    }
    const existing = comments[idx];
    // Keep the viewer-specific fields the broadcast can't know (votes + edit rights).
    const merged = {
      ...comment,
      upvotes: existing.upvotes,
      downvotes: existing.downvotes,
      my_vote: existing.my_vote,
      can_edit: existing.can_edit,
    };
    const next = comments.slice();
    next[idx] = merged;
    return { ...prev, comments: next };
  });

  // A new comment may be a reply to the viewer's comment → refresh the bell.
  void qc.invalidateQueries({ queryKey: qk.notificationsAll() });
}

export function applyCommentDelete(qc: QueryClient, payload: unknown) {
  const p = asObj<CommentDeletePayload>(payload);
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
  const tid = Number(asObj<CommentMetaPayload>(payload).tournament_id);
  if (!Number.isFinite(tid)) return;
  void qc.invalidateQueries({ queryKey: qk.commentsTournament(tid) });
  void qc.invalidateQueries({ queryKey: qk.commentsSummary() });
}

/** Coarse global notify: refresh list/live; only touch stats/cup on result-grade changes. */
export function applyTournamentsChanged(qc: QueryClient, payload: unknown) {
  const p = asObj<TournamentsChangedPayload>(payload);
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
    case WS_TOURNAMENT_SYNC:
      return applyTournamentSync(qc, msg.payload);
    case WS_TOURNAMENT_DELETED:
      return applyTournamentDeleted(qc, msg.payload);
    case WS_COMMENT_UPSERT:
      return applyCommentUpsert(qc, msg.payload);
    case WS_COMMENT_DELETE:
      return applyCommentDelete(qc, msg.payload);
    case WS_COMMENT_META:
      return applyCommentMeta(qc, msg.payload);
    default:
      return;
  }
}

/** Route a global-channel (`/ws/tournaments`) message. */
export function applyGlobalMessage(qc: QueryClient, msg: RealtimeMessage) {
  if (msg.event === WS_TOURNAMENTS_CHANGED) return applyTournamentsChanged(qc, msg.payload);
}
