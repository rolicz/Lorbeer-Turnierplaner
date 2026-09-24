import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createIdea,
  createIdeaComment,
  deleteIdea as apiDeleteIdea,
  deleteIdeaComment,
  deleteIdeaImage,
  markIdeaRead,
  patchIdea as apiPatchIdea,
  putIdeaImage,
  setIdeaStatus,
  voteIdea,
} from "../../api/ideas.api";
import { qk } from "../../api/queryKeys";
import type { IdeaKind, IdeaStatus } from "../../api/types";

/**
 * Every write the Ideas board makes, with its invalidation — the shape
 * `useCommentMutations` established, so the page holds state and nothing else.
 *
 * `qk.ideasAll()` is the prefix, so one invalidation covers the list under every
 * viewer as well as the voter lists.
 */
export function useIdeaMutations() {
  const qc = useQueryClient();

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: qk.ideasAll() });
  };

  const createMut = useMutation({
    mutationFn: async (payload: { title: string; body: string; kind: IdeaKind; areas: string[] }) => {
      return createIdea(payload);
    },
    onSuccess: refresh,
  });

  /**
   * The image is a second call, after the idea exists: `has_image` is derived from
   * the stored file, so the feed only shows the screenshot once the list is
   * refetched *after* the upload (same race the comments hit — T3).
   */
  const putImageMut = useMutation({
    mutationFn: async (payload: { ideaId: number; blob: Blob }) => {
      return putIdeaImage(payload.ideaId, payload.blob);
    },
    onSuccess: refresh,
  });

  const deleteImageMut = useMutation({
    mutationFn: async (ideaId: number) => {
      return deleteIdeaImage(ideaId);
    },
    onSuccess: refresh,
  });

  const patchMut = useMutation({
    mutationFn: async (payload: {
      ideaId: number;
      title?: string;
      body?: string;
      kind?: IdeaKind;
      areas?: string[];
    }) => {
      const { ideaId, ...rest } = payload;
      return apiPatchIdea(ideaId, rest);
    },
    onSuccess: refresh,
  });

  const statusMut = useMutation({
    mutationFn: async (payload: { ideaId: number; status: IdeaStatus; note: string }) => {
      return setIdeaStatus(payload.ideaId, { status: payload.status, note: payload.note });
    },
    onSuccess: refresh,
  });

  const deleteMut = useMutation({
    mutationFn: async (ideaId: number) => {
      return apiDeleteIdea(ideaId);
    },
    onSuccess: refresh,
  });

  const voteMut = useMutation({
    mutationFn: async (payload: { ideaId: number; value: 0 | 1 }) => {
      return voteIdea(payload.ideaId, payload.value);
    },
    onSuccess: refresh,
  });

  const commentMut = useMutation({
    mutationFn: async (payload: { ideaId: number; body: string }) => {
      return createIdeaComment(payload.ideaId, payload.body);
    },
    onSuccess: refresh,
  });

  const deleteCommentMut = useMutation({
    mutationFn: async (commentId: number) => {
      return deleteIdeaComment(commentId);
    },
    onSuccess: refresh,
  });

  /** Reading changes nothing on the board itself — only the bell's unread count. */
  const markReadMut = useMutation({
    mutationFn: async (ideaId: number) => {
      return markIdeaRead(ideaId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.notificationsAll() });
    },
  });

  return {
    createMut,
    putImageMut,
    deleteImageMut,
    patchMut,
    statusMut,
    deleteMut,
    voteMut,
    commentMut,
    deleteCommentMut,
    markReadMut,
  };
}
