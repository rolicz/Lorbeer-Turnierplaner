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
import { useAuth } from "../../auth/AuthContext";
import type { IdeaKind, IdeaStatus } from "../../api/types";

/**
 * Every write the Ideas board makes, with its invalidation — the shape
 * `useCommentMutations` established, so the page holds state and nothing else.
 *
 * `qk.ideasAll()` is the prefix, so one invalidation covers the list under every
 * viewer token as well as the voter lists.
 */
export function useIdeaMutations() {
  const qc = useQueryClient();
  const { token } = useAuth();

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: qk.ideasAll() });
  };

  const createMut = useMutation({
    mutationFn: async (payload: { title: string; body: string; kind: IdeaKind; areas: string[] }) => {
      if (!token) throw new Error("Not logged in");
      return createIdea(token, payload);
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
      if (!token) throw new Error("Not logged in");
      return putIdeaImage(token, payload.ideaId, payload.blob);
    },
    onSuccess: refresh,
  });

  const deleteImageMut = useMutation({
    mutationFn: async (ideaId: number) => {
      if (!token) throw new Error("Not logged in");
      return deleteIdeaImage(token, ideaId);
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
      if (!token) throw new Error("Not logged in");
      const { ideaId, ...rest } = payload;
      return apiPatchIdea(token, ideaId, rest);
    },
    onSuccess: refresh,
  });

  const statusMut = useMutation({
    mutationFn: async (payload: { ideaId: number; status: IdeaStatus; note: string }) => {
      if (!token) throw new Error("Not logged in");
      return setIdeaStatus(token, payload.ideaId, { status: payload.status, note: payload.note });
    },
    onSuccess: refresh,
  });

  const deleteMut = useMutation({
    mutationFn: async (ideaId: number) => {
      if (!token) throw new Error("Not logged in");
      return apiDeleteIdea(token, ideaId);
    },
    onSuccess: refresh,
  });

  const voteMut = useMutation({
    mutationFn: async (payload: { ideaId: number; value: 0 | 1 }) => {
      if (!token) throw new Error("Not logged in");
      return voteIdea(token, payload.ideaId, payload.value);
    },
    onSuccess: refresh,
  });

  const commentMut = useMutation({
    mutationFn: async (payload: { ideaId: number; body: string }) => {
      if (!token) throw new Error("Not logged in");
      return createIdeaComment(token, payload.ideaId, payload.body);
    },
    onSuccess: refresh,
  });

  const deleteCommentMut = useMutation({
    mutationFn: async (commentId: number) => {
      if (!token) throw new Error("Not logged in");
      return deleteIdeaComment(token, commentId);
    },
    onSuccess: refresh,
  });

  /** Reading changes nothing on the board itself — only the bell's unread count. */
  const markReadMut = useMutation({
    mutationFn: async (ideaId: number) => {
      if (!token) throw new Error("Not logged in");
      return markIdeaRead(token, ideaId);
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
