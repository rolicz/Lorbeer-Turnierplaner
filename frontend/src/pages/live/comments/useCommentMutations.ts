import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createTournamentComment,
  deleteComment as apiDeleteComment,
  markCommentRead,
  patchComment as apiPatchComment,
  setPinnedTournamentComment,
  voteComment,
} from "../../../api/comments.api";
import { qk } from "../../../api/queryKeys";
import { useAuth } from "../../../auth/AuthContext";
import { type CommentScope } from "../tournamentCommentTypes";

/**
 * All comment write operations for one tournament (create/edit/delete/vote/pin/read),
 * with their cache invalidations. Encapsulates token + query client so callers
 * (TournamentCommentsCard, and any future reuse on the match detail page) don't repeat them.
 */
export function useCommentMutations(tournamentId: number) {
  const qc = useQueryClient();
  const { token } = useAuth();

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
      if (!token) throw new Error("Not logged in");
      return createTournamentComment(token, tournamentId, {
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
      await qc.invalidateQueries({ queryKey: qk.commentsReadIds(tournamentId, token) });
      await qc.invalidateQueries({ queryKey: qk.commentsReadMap(token) });
    },
  });

  const patchMut = useMutation({
    mutationFn: async (payload: { commentId: number; author_player_id?: number | null; body: string }) => {
      if (!token) throw new Error("Not logged in");
      return apiPatchComment(token, payload.commentId, {
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
      if (!token) throw new Error("Not logged in");
      return apiDeleteComment(token, commentId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.commentsTournament(tournamentId) });
      await qc.invalidateQueries({ queryKey: qk.commentsReadIds(tournamentId, token) });
      await qc.invalidateQueries({ queryKey: qk.commentsReadMap(token) });
    },
  });

  const pinMut = useMutation({
    mutationFn: async (commentId: number | null) => {
      if (!token) throw new Error("Not logged in");
      return setPinnedTournamentComment(token, tournamentId, commentId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.commentsTournament(tournamentId) });
    },
  });

  const markReadMut = useMutation({
    mutationFn: async (commentId: number) => {
      if (!token) throw new Error("Not logged in");
      return markCommentRead(token, commentId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.commentsReadIds(tournamentId, token) });
      await qc.invalidateQueries({ queryKey: qk.commentsReadMap(token) });
    },
  });

  const voteMut = useMutation({
    mutationFn: async (payload: { commentId: number; value: -1 | 0 | 1 }) => {
      if (!token) throw new Error("Not logged in");
      return voteComment(token, payload.commentId, payload.value);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.commentsTournament(tournamentId) });
    },
  });

  const actionError: unknown =
    createMut.error ?? patchMut.error ?? deleteMut.error ?? pinMut.error ?? markReadMut.error ?? voteMut.error;

  return { createMut, patchMut, deleteMut, pinMut, markReadMut, voteMut, actionError };
}
