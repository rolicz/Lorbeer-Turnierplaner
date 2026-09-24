import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createTournamentComment,
  deleteComment as apiDeleteComment,
  markCommentRead,
  patchComment as apiPatchComment,
  putCommentImage,
  setPinnedTournamentComment,
  voteComment,
} from "../../../api/comments.api";
import { qk } from "../../../api/queryKeys";
import { useAuth } from "../../../auth/AuthContext";
import { type CommentScope } from "../tournamentCommentTypes";

/**
 * All comment write operations for one tournament (create/edit/delete/vote/pin/read),
 * with their cache invalidations. Encapsulates the viewer + query client so callers
 * (TournamentCommentsCard, and any future reuse on the match detail page) don't repeat them.
 */
export function useCommentMutations(tournamentId: number) {
  const qc = useQueryClient();
  const { playerId: viewerId } = useAuth();

  const createMut = useMutation({
    mutationFn: async (payload: {
      scope: CommentScope;
      author_player_id: number | null;
      body: string;
      has_image: boolean;
      parent_comment_id?: number | null;
      event_type?: "goal" | "shots";
      goal_minute?: number;
      goal_player_name?: string;
      result_score_a?: number;
      result_score_b?: number;
    }) => {
      return createTournamentComment(tournamentId, {
        match_id: payload.scope.kind === "match" ? payload.scope.matchId : null,
        parent_comment_id: payload.parent_comment_id ?? null,
        author_player_id: payload.author_player_id,
        body: payload.body,
        has_image: payload.has_image,
        event_type: payload.event_type,
        goal_minute: payload.goal_minute,
        goal_player_name: payload.goal_player_name,
        result_score_a: payload.result_score_a,
        result_score_b: payload.result_score_b,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.tournament(tournamentId) });
      await qc.invalidateQueries({ queryKey: qk.commentsTournament(tournamentId) });
      await qc.invalidateQueries({ queryKey: qk.commentsReadIds(tournamentId, viewerId) });
      await qc.invalidateQueries({ queryKey: qk.commentsReadMap(viewerId) });
    },
  });

  /**
   * The image is a second call after the comment exists, and `has_image` in the
   * response is derived from the stored file — so the feed only shows the picture
   * once the list is refetched *after* the upload (the create call's own
   * invalidation races ahead of it).
   */
  const putImageMut = useMutation({
    mutationFn: async (payload: { commentId: number; blob: Blob }) => {
      return putCommentImage(payload.commentId, payload.blob, "comment.webp");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.commentsTournament(tournamentId) });
    },
  });

  const patchMut = useMutation({
    mutationFn: async (payload: { commentId: number; author_player_id?: number | null; body: string }) => {
      return apiPatchComment(payload.commentId, {
        author_player_id: payload.author_player_id,
        body: payload.body,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.commentsTournament(tournamentId) });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (commentId: number) => {
      return apiDeleteComment(commentId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.commentsTournament(tournamentId) });
      await qc.invalidateQueries({ queryKey: qk.commentsReadIds(tournamentId, viewerId) });
      await qc.invalidateQueries({ queryKey: qk.commentsReadMap(viewerId) });
    },
  });

  const pinMut = useMutation({
    mutationFn: async (commentId: number | null) => {
      return setPinnedTournamentComment(tournamentId, commentId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.commentsTournament(tournamentId) });
    },
  });

  const markReadMut = useMutation({
    mutationFn: async (commentId: number) => {
      return markCommentRead(commentId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.commentsReadIds(tournamentId, viewerId) });
      await qc.invalidateQueries({ queryKey: qk.commentsReadMap(viewerId) });
    },
  });

  const voteMut = useMutation({
    mutationFn: async (payload: { commentId: number; value: -1 | 0 | 1 }) => {
      return voteComment(payload.commentId, payload.value);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.commentsTournament(tournamentId) });
    },
  });

  const actionError: unknown =
    createMut.error ?? patchMut.error ?? deleteMut.error ?? pinMut.error ?? markReadMut.error ?? voteMut.error;

  return { createMut, putImageMut, patchMut, deleteMut, pinMut, markReadMut, voteMut, actionError };
}
