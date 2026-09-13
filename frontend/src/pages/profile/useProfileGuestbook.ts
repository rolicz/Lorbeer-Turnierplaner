import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPlayerGuestbookEntry,
  deletePlayerGuestbookEntry,
  editPlayerGuestbookEntry,
  listPlayerGuestbook,
  listPlayerGuestbookReadIds,
  markAllPlayerGuestbookEntriesRead,
  markPlayerGuestbookEntryRead,
  votePlayerGuestbookEntry,
} from "../../api/players.api";
import { qk } from "../../api/queryKeys";
import type { Role } from "../../api/types";
import { scrollToSectionById } from "../../ui/scrollToSection";
import {
  buildGuestbookTree,
  countUnreadGuestbookAuthors,
  countUnreadRepliesByEntry,
  latestUnreadGuestbookId,
  summarizeUnreadGuestbookAuthors,
} from "./guestbookTree";
import { type GuestbookCardContextValue } from "./GuestbookEntryCard";
import { type GuestbookSectionProps } from "./GuestbookSection";

export type FocusGuestbookEntry = (
  entryId: number,
  options?: { blink?: boolean; behavior?: ScrollBehavior },
) => void;

/**
 * All guestbook state + behaviour for a profile: list/read queries, the
 * per-profile draft/reply/edit/collapse state, unread metrics, mutations
 * (create/delete/edit/markRead/markAll/vote), the scroll/focus helpers, and
 * the GuestbookEntryCard context. Lifted verbatim from ProfilePage so the
 * coordinator only has to render <GuestbookSection {...sectionProps}/>.
 */
export function useProfileGuestbook({
  targetPlayerId,
  token,
  role,
  actorPlayerId,
  currentPlayerId,
  isOwnProfile,
  avatarUpdatedAtByPlayerId,
}: {
  targetPlayerId: number | null;
  token: string | null;
  role: Role | null;
  actorPlayerId: number | null;
  currentPlayerId: number | null;
  isOwnProfile: boolean;
  avatarUpdatedAtByPlayerId: Map<number, string | null>;
}) {
  const qc = useQueryClient();

  const guestbookQ = useQuery({
    queryKey: qk.playerGuestbook(targetPlayerId ?? "none"),
    queryFn: () => listPlayerGuestbook(targetPlayerId as number),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const guestbookReadQ = useQuery({
    queryKey: qk.playerGuestbookReadIds(targetPlayerId ?? "none", token),
    queryFn: () => listPlayerGuestbookReadIds(token as string, targetPlayerId as number),
    enabled: !!token && Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });

  const [guestbookDraftByPlayerId, setGuestbookDraftByPlayerId] = useState<Record<number, string>>({});
  const [replyDraftByProfileAndEntry, setReplyDraftByProfileAndEntry] = useState<
    Record<number, Record<number, string>>
  >({});
  const [replyOpenEntryByProfileId, setReplyOpenEntryByProfileId] = useState<Record<number, number | null>>({});
  const [editDraftByProfileAndEntry, setEditDraftByProfileAndEntry] = useState<
    Record<number, Record<number, string>>
  >({});
  const [editOpenEntryByProfileId, setEditOpenEntryByProfileId] = useState<Record<number, number | null>>({});
  const [collapsedEntryByProfileId, setCollapsedEntryByProfileId] = useState<Record<number, Set<number>>>({});
  const [voteVotersEntryId, setVoteVotersEntryId] = useState<number | null>(null);

  const guestbookDraft = targetPlayerId != null ? (guestbookDraftByPlayerId[targetPlayerId] ?? "") : "";
  const replyDraftByEntryId = useMemo(
    () => (targetPlayerId != null ? (replyDraftByProfileAndEntry[targetPlayerId] ?? {}) : {}),
    [targetPlayerId, replyDraftByProfileAndEntry]
  );
  const replyOpenEntryId = targetPlayerId != null ? (replyOpenEntryByProfileId[targetPlayerId] ?? null) : null;
  const editDraftByEntryId = useMemo(
    () => (targetPlayerId != null ? (editDraftByProfileAndEntry[targetPlayerId] ?? {}) : {}),
    [targetPlayerId, editDraftByProfileAndEntry]
  );
  const editOpenEntryId = targetPlayerId != null ? (editOpenEntryByProfileId[targetPlayerId] ?? null) : null;
  const collapsedEntryIds = useMemo(
    () => (targetPlayerId != null ? (collapsedEntryByProfileId[targetPlayerId] ?? new Set<number>()) : new Set<number>()),
    [targetPlayerId, collapsedEntryByProfileId]
  );

  const canPostGuestbook = !!token && role !== "reader";
  /** Bumped after a posted message, to return the caret to the composer. */
  const [postedNonce, setPostedNonce] = useState(0);
  const seenGuestbook = useMemo(
    () => new Set((guestbookReadQ.data?.entry_ids ?? []).map((x) => Number(x))),
    [guestbookReadQ.data?.entry_ids]
  );

  const unreadGuestbookCount = useMemo(() => {
    if (!token) return 0;
    let n = 0;
    for (const row of guestbookQ.data ?? []) {
      if (!seenGuestbook.has(row.id)) n++;
    }
    return n;
  }, [guestbookQ.data, seenGuestbook, token]);
  const unreadGuestbookIds = useMemo(
    () => (!token ? [] : (guestbookQ.data ?? []).filter((row) => !seenGuestbook.has(row.id)).map((row) => row.id)),
    [guestbookQ.data, seenGuestbook, token]
  );
  const totalGuestbookCount = Number(guestbookQ.data?.length ?? 0);
  const isGuestbookUnread = useCallback(
    (id: number) => !!token && !seenGuestbook.has(id),
    [token, seenGuestbook]
  );
  const unreadGuestbookAuthorsText = useMemo(() => {
    if (!token || !isOwnProfile) return "";
    return summarizeUnreadGuestbookAuthors(guestbookQ.data ?? [], isGuestbookUnread);
  }, [guestbookQ.data, isOwnProfile, isGuestbookUnread, token]);
  const unreadGuestbookAuthorCount = useMemo(() => {
    if (!token || !isOwnProfile) return 0;
    return countUnreadGuestbookAuthors(guestbookQ.data ?? [], isGuestbookUnread);
  }, [guestbookQ.data, isOwnProfile, isGuestbookUnread, token]);
  const latestUnreadGuestbookEntryId = useMemo(
    () => (!token ? null : latestUnreadGuestbookId(guestbookQ.data ?? [], isGuestbookUnread)),
    [guestbookQ.data, isGuestbookUnread, token]
  );
  const guestbookRootsAndChildren = useMemo(
    () => buildGuestbookTree(guestbookQ.data ?? []),
    [guestbookQ.data]
  );
  const unreadReplyCountByEntryId = useMemo(
    () => countUnreadRepliesByEntry(guestbookRootsAndChildren, isGuestbookUnread),
    [guestbookRootsAndChildren, isGuestbookUnread]
  );

  const scrollToGuestbookSection = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      scrollToSectionById("profile-section-guestbook", 20, 0, behavior);
    },
    [],
  );

  const focusGuestbookEntry = useCallback<FocusGuestbookEntry>(
    (entryId, options) => {
      const behavior = options?.behavior ?? "smooth";
      scrollToGuestbookSection(behavior);
      let tries = 0;
      const run = () => {
        const el = document.getElementById(`guestbook-entry-${entryId}`);
        if (!el) {
          if (tries >= 80) return;
          tries += 1;
          window.setTimeout(run, 120);
          return;
        }
        const header = document.getElementById("app-top-nav");
        const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
        const rect = el.getBoundingClientRect();
        const entryTop = window.scrollY + rect.top;
        const usableViewport = Math.max(140, window.innerHeight - headerHeight);
        const centeredTarget = entryTop - headerHeight - Math.max(12, Math.floor((usableViewport - rect.height) / 2));
        window.scrollTo({ top: Math.max(0, centeredTarget), behavior });
        el.classList.remove("comment-attn");
        void el.offsetHeight;
        el.classList.add("comment-attn");
        window.setTimeout(() => el.classList.remove("comment-attn"), 1700);
      };
      run();
    },
    [scrollToGuestbookSection],
  );

  const createGuestbookMut = useMutation({
    mutationFn: async ({
      body,
      parentEntryId,
    }: {
      body: string;
      parentEntryId: number | null;
    }) => {
      if (!token) throw new Error("Not logged in");
      if (!targetPlayerId) throw new Error("Invalid player");
      return createPlayerGuestbookEntry(token, targetPlayerId, body, parentEntryId, actorPlayerId ?? null);
    },
    onSuccess: async (_result, vars) => {
      if (targetPlayerId && vars.parentEntryId == null) {
        setGuestbookDraftByPlayerId((prev) => ({ ...prev, [targetPlayerId]: "" }));
        // Send moves focus to the button, which then disables itself — put the caret
        // back in the field so the next message costs one tap (same as the comments).
        setPostedNonce((n) => n + 1);
      }
      if (targetPlayerId && vars.parentEntryId != null) {
        const parentEntryId = vars.parentEntryId;
        setReplyDraftByProfileAndEntry((prev) => ({
          ...prev,
          [targetPlayerId]: {
            ...(prev[targetPlayerId] ?? {}),
            [parentEntryId]: "",
          },
        }));
        setReplyOpenEntryByProfileId((prev) => ({
          ...prev,
          [targetPlayerId]: prev[targetPlayerId] === parentEntryId ? null : prev[targetPlayerId] ?? null,
        }));
      }
      await qc.invalidateQueries({ queryKey: qk.playerGuestbook(targetPlayerId ?? "none") });
      await qc.invalidateQueries({ queryKey: qk.playerGuestbookSummary() });
      await qc.invalidateQueries({ queryKey: qk.playerGuestbookReadIds(targetPlayerId ?? "none", token) });
    },
  });

  const deleteGuestbookMut = useMutation({
    mutationFn: async (entryId: number) => {
      if (!token) throw new Error("Not logged in");
      await deletePlayerGuestbookEntry(token, entryId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.playerGuestbook(targetPlayerId ?? "none") });
      await qc.invalidateQueries({ queryKey: qk.playerGuestbookSummary() });
      await qc.invalidateQueries({ queryKey: qk.playerGuestbookReadIds(targetPlayerId ?? "none", token) });
    },
  });
  const editGuestbookMut = useMutation({
    mutationFn: async ({ entryId, body }: { entryId: number; body: string }) => {
      if (!token) throw new Error("Not logged in");
      return editPlayerGuestbookEntry(token, entryId, body);
    },
    onSuccess: async (_result, vars) => {
      if (targetPlayerId != null) {
        setEditOpenEntryByProfileId((prev) => ({
          ...prev,
          [targetPlayerId]: prev[targetPlayerId] === vars.entryId ? null : prev[targetPlayerId] ?? null,
        }));
      }
      await qc.invalidateQueries({ queryKey: qk.playerGuestbook(targetPlayerId ?? "none") });
    },
  });
  const markGuestbookReadMut = useMutation({
    mutationFn: async (entryId: number) => {
      if (!token) throw new Error("Not logged in");
      return markPlayerGuestbookEntryRead(token, entryId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.playerGuestbookReadIds(targetPlayerId ?? "none", token) });
      await qc.invalidateQueries({ queryKey: qk.playerGuestbookReadMap(token) });
    },
  });
  const markGuestbookReadAllMut = useMutation({
    mutationFn: async () => {
      if (!token || !targetPlayerId) throw new Error("Not logged in");
      return markAllPlayerGuestbookEntriesRead(token, targetPlayerId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.playerGuestbookReadIds(targetPlayerId ?? "none", token) });
      await qc.invalidateQueries({ queryKey: qk.playerGuestbookReadMap(token) });
    },
  });
  const voteGuestbookMut = useMutation({
    mutationFn: async (payload: { entryId: number; value: -1 | 0 | 1 }) => {
      if (!token) throw new Error("Not logged in");
      return votePlayerGuestbookEntry(token, payload.entryId, payload.value);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.playerGuestbook(targetPlayerId ?? "none") });
    },
  });

  const guestbookCardContext = useMemo<GuestbookCardContextValue>(
    () => ({
      childrenByParent: guestbookRootsAndChildren.childrenByParent,
      avatarUpdatedAtByPlayerId,
      unreadReplyCountByEntryId,
      replyDraftByEntryId,
      replyOpenEntryId,
      editDraftByEntryId,
      editOpenEntryId,
      collapsedEntryIds,
      canPostGuestbook,
      isUnread: isGuestbookUnread,
      canDelete: (entry) =>
        !!token && (role === "admin" || isOwnProfile || currentPlayerId === entry.author_player_id),
      canEditEntry: (entry) => !!token && !!entry.can_edit,
      readPending: markGuestbookReadMut.isPending,
      votePending: voteGuestbookMut.isPending,
      createPending: createGuestbookMut.isPending,
      editPending: editGuestbookMut.isPending,
      voteEnabled: !!token && !voteGuestbookMut.isPending,
      markRead: (entryId) => {
        if (!token || markGuestbookReadMut.isPending) return;
        markGuestbookReadMut.mutate(entryId);
      },
      toggleReply: (entryId) => {
        if (!targetPlayerId) return;
        setReplyOpenEntryByProfileId((prev) => ({
          ...prev,
          [targetPlayerId]: prev[targetPlayerId] === entryId ? null : entryId,
        }));
      },
      cancelReply: (entryId) => {
        if (!targetPlayerId) return;
        setReplyOpenEntryByProfileId((prev) => ({
          ...prev,
          [targetPlayerId]: prev[targetPlayerId] === entryId ? null : prev[targetPlayerId] ?? null,
        }));
      },
      deleteEntry: (entryId) => {
        void deleteGuestbookMut.mutateAsync(entryId);
      },
      vote: (entryId, value) => {
        if (!token || voteGuestbookMut.isPending) return;
        voteGuestbookMut.mutate({ entryId, value });
      },
      showVoters: (entryId) => setVoteVotersEntryId(entryId),
      setReplyDraft: (entryId, text) => {
        if (!targetPlayerId) return;
        setReplyDraftByProfileAndEntry((prev) => ({
          ...prev,
          [targetPlayerId]: { ...(prev[targetPlayerId] ?? {}), [entryId]: text },
        }));
      },
      submitReply: (entryId, text) => {
        const t = text.trim();
        if (!t) return;
        createGuestbookMut.mutate({ body: t, parentEntryId: entryId });
      },
      toggleEdit: (entry) => {
        if (!targetPlayerId) return;
        setReplyOpenEntryByProfileId((prev) => ({ ...prev, [targetPlayerId]: null }));
        setEditDraftByProfileAndEntry((prev) => ({
          ...prev,
          [targetPlayerId]: { ...(prev[targetPlayerId] ?? {}), [entry.id]: entry.body },
        }));
        setEditOpenEntryByProfileId((prev) => ({
          ...prev,
          [targetPlayerId]: prev[targetPlayerId] === entry.id ? null : entry.id,
        }));
      },
      cancelEdit: (entryId) => {
        if (!targetPlayerId) return;
        setEditOpenEntryByProfileId((prev) => ({
          ...prev,
          [targetPlayerId]: prev[targetPlayerId] === entryId ? null : prev[targetPlayerId] ?? null,
        }));
      },
      setEditDraft: (entryId, text) => {
        if (!targetPlayerId) return;
        setEditDraftByProfileAndEntry((prev) => ({
          ...prev,
          [targetPlayerId]: { ...(prev[targetPlayerId] ?? {}), [entryId]: text },
        }));
      },
      submitEdit: (entryId, text) => {
        const t = text.trim();
        if (!t) return;
        editGuestbookMut.mutate({ entryId, body: t });
      },
      toggleCollapse: (entryId) => {
        if (!targetPlayerId) return;
        setCollapsedEntryByProfileId((prev) => {
          const cur = new Set(prev[targetPlayerId] ?? new Set<number>());
          if (cur.has(entryId)) cur.delete(entryId);
          else cur.add(entryId);
          return { ...prev, [targetPlayerId]: cur };
        });
      },
    }),
    [
      guestbookRootsAndChildren.childrenByParent,
      avatarUpdatedAtByPlayerId,
      unreadReplyCountByEntryId,
      replyDraftByEntryId,
      replyOpenEntryId,
      editDraftByEntryId,
      editOpenEntryId,
      collapsedEntryIds,
      canPostGuestbook,
      isGuestbookUnread,
      token,
      role,
      isOwnProfile,
      currentPlayerId,
      targetPlayerId,
      markGuestbookReadMut,
      voteGuestbookMut,
      createGuestbookMut,
      deleteGuestbookMut,
      editGuestbookMut,
      setReplyOpenEntryByProfileId,
      setReplyDraftByProfileAndEntry,
      setEditOpenEntryByProfileId,
      setEditDraftByProfileAndEntry,
      setCollapsedEntryByProfileId,
      setVoteVotersEntryId,
    ]
  );

  // Everything <GuestbookSection/> needs except the player-name placeholder,
  // which the coordinator supplies.
  const sectionProps: Omit<GuestbookSectionProps, "placeholder"> = {
    cardContext: guestbookCardContext,
    roots: guestbookRootsAndChildren.roots,
    loading: guestbookQ.isLoading,
    isEmpty: (guestbookQ.data?.length ?? 0) === 0,
    errors: {
      load: guestbookQ.error,
      readStatus: guestbookReadQ.error,
      post: createGuestbookMut.error,
      remove: deleteGuestbookMut.error,
      markRead: markGuestbookReadMut.error,
      markAll: markGuestbookReadAllMut.error,
      vote: voteGuestbookMut.error,
    },
    unreadCount: unreadGuestbookCount,
    onJumpUnread: () => {
      if (!latestUnreadGuestbookEntryId) return;
      focusGuestbookEntry(latestUnreadGuestbookEntryId, { blink: false });
    },
    onMarkAllRead: () => {
      if (!targetPlayerId || unreadGuestbookIds.length === 0 || markGuestbookReadAllMut.isPending) return;
      const ok = window.confirm(`Mark ${unreadGuestbookIds.length} unread guestbook message(s) as read?`);
      if (!ok) return;
      markGuestbookReadAllMut.mutate();
    },
    markAllPending: markGuestbookReadAllMut.isPending,
    canPost: canPostGuestbook,
    draft: guestbookDraft,
    onDraftChange: (text) => {
      if (!targetPlayerId) return;
      setGuestbookDraftByPlayerId((prev) => ({ ...prev, [targetPlayerId]: text }));
    },
    onPost: () => createGuestbookMut.mutate({ body: guestbookDraft.trim(), parentEntryId: null }),
    posting: createGuestbookMut.isPending,
    postedNonce,
  };

  return {
    guestbookLoading: guestbookQ.isLoading,
    unreadGuestbookCount,
    totalGuestbookCount,
    unreadGuestbookAuthorsText,
    unreadGuestbookAuthorCount,
    latestUnreadGuestbookEntryId,
    focusGuestbookEntry,
    voteVotersEntryId,
    setVoteVotersEntryId,
    sectionProps,
  };
}
