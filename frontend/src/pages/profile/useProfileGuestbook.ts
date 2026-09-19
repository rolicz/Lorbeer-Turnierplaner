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
import type { GuestbookSubjectKind, PlayerGuestbookEntry, PlayerGuestbookSubject, Role } from "../../api/types";
import { scrollToSectionById } from "../../ui/scrollToSection";
import {
  buildGuestbookTree,
  countGuestbookDescendants,
  countUnreadGuestbookAuthors,
  countUnreadRepliesByEntry,
  latestUnreadGuestbookId,
  summarizeUnreadGuestbookAuthors,
} from "./guestbookTree";
import { countCurrentSubjectEntries } from "./guestbookSubjects";
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

  /**
   * The feed is a public read that carries per-caller answers: `can_edit` and `my_vote`
   * are computed from the bearer token, so reading it anonymously told every logged-in
   * reader they could edit nothing and had voted on nothing (G4). The token therefore goes
   * with the request **and** into the key — the `commentsTournamentFull` / `friendliesList`
   * / `ideas` shape — because `["players","guestbook",id]` alone would let a logged-out
   * payload (or the previous account's) be served after a login, which is the same bug with
   * an extra step. Every invalidation in this file keeps using the short prefix, which
   * matches every token's entry.
   */
  const guestbookQ = useQuery({
    queryKey: qk.playerGuestbookFull(targetPlayerId ?? "none", token),
    queryFn: () => listPlayerGuestbook(targetPlayerId as number, token),
    enabled: Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });
  const guestbookReadQ = useQuery({
    queryKey: qk.playerGuestbookReadIds(targetPlayerId ?? "none", token),
    queryFn: () => listPlayerGuestbookReadIds(token as string, targetPlayerId as number),
    enabled: !!token && Number.isFinite(targetPlayerId) && (targetPlayerId ?? 0) > 0,
  });

  const [guestbookDraftByPlayerId, setGuestbookDraftByPlayerId] = useState<Record<number, string>>({});
  // What the composer is armed for, per profile — the `guestbookDraftByPlayerId` shape, so
  // switching profiles keeps each wall's own arming instead of carrying one across.
  const [subjectDraftByPlayerId, setSubjectDraftByPlayerId] = useState<Record<number, GuestbookSubjectKind | null>>({});
  /** The snapshot a chip asked to see — the lightbox or the modal renders it (K2). */
  const [viewedSubject, setViewedSubject] = useState<PlayerGuestbookSubject | null>(null);
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
  // Both confirmations live here as intent, not as a native browser dialog (R2): this
  // is a hook, so it cannot render a `ConfirmDialog` — it says *what was asked for*,
  // and <GuestbookSection/> renders it.
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<PlayerGuestbookEntry | null>(null);
  const [markAllReadAsked, setMarkAllReadAsked] = useState(false);

  const guestbookDraft = targetPlayerId != null ? (guestbookDraftByPlayerId[targetPlayerId] ?? "") : "";
  const subjectDraft = targetPlayerId != null ? (subjectDraftByPlayerId[targetPlayerId] ?? null) : null;
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
  /**
   * Bumped whenever the caret belongs in the composer: after a posted message, and when
   * an item's trigger arms it for a subject. `AutoTextarea`'s focus effect also runs on
   * mount while the nonce is non-zero, so arming from another tab focuses the field the
   * moment the feed mounts.
   */
  const [composerNonce, setComposerNonce] = useState(0);
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

  /**
   * Arm the composer for a subject — what an item's trigger does (K3). The caret follows
   * via the nonce, so a trigger tapped on another tab lands in a focused field.
   */
  const armSubject = useCallback(
    (kind: GuestbookSubjectKind) => {
      if (!targetPlayerId) return;
      setSubjectDraftByPlayerId((prev) => ({ ...prev, [targetPlayerId]: kind }));
      setComposerNonce((n) => n + 1);
    },
    [targetPlayerId],
  );
  const clearSubject = useCallback(() => {
    if (!targetPlayerId) return;
    setSubjectDraftByPlayerId((prev) => ({ ...prev, [targetPlayerId]: null }));
  }, [targetPlayerId]);

  /** Per kind, the roots about the version the profile shows *now* — the items' counts. */
  const currentSubjectCounts = useMemo(
    () => countCurrentSubjectEntries(guestbookQ.data ?? []),
    [guestbookQ.data],
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
      subjectKind,
    }: {
      body: string;
      parentEntryId: number | null;
      /** Roots only — the server answers 400 for a reply that carries one. */
      subjectKind: GuestbookSubjectKind | null;
    }) => {
      if (!token) throw new Error("Not logged in");
      if (!targetPlayerId) throw new Error("Invalid player");
      return createPlayerGuestbookEntry(
        token,
        targetPlayerId,
        body,
        parentEntryId,
        actorPlayerId ?? null,
        subjectKind,
      );
    },
    onSuccess: async (_result, vars) => {
      if (targetPlayerId && vars.parentEntryId == null) {
        setGuestbookDraftByPlayerId((prev) => ({ ...prev, [targetPlayerId]: "" }));
        // The subject is spent with the message it was posted on: the next one is an
        // ordinary entry until an item arms the composer again.
        setSubjectDraftByPlayerId((prev) => ({ ...prev, [targetPlayerId]: null }));
        // Send moves focus to the button, which then disables itself — put the caret
        // back in the field so the next message costs one tap (same as the comments).
        setComposerNonce((n) => n + 1);
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
      // The server owns the rule (`guestbook_can_edit`: the author inside the hour, or an
      // admin) and this never re-derives it — but the flag is computed from the *account*,
      // while "view as lower role" is a frontend-only convenience, so the effective role
      // gates it exactly as `isEditorOrAdmin && !!row.can_edit` does for a tournament and a
      // friendly (A10). `PATCH /players/guestbook/{id}` is editor+, which is what
      // `canPostGuestbook` is.
      canEditEntry: (entry) => canPostGuestbook && !!entry.can_edit,
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
      requestDelete: (entry) => setPendingDeleteEntry(entry),
      vote: (entryId, value) => {
        if (!token || voteGuestbookMut.isPending) return;
        voteGuestbookMut.mutate({ entryId, value });
      },
      showVoters: (entryId) => setVoteVotersEntryId(entryId),
      viewSubject: (subject) => setViewedSubject(subject),
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
        createGuestbookMut.mutate({ body: t, parentEntryId: entryId, subjectKind: null });
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
      editGuestbookMut,
      setReplyOpenEntryByProfileId,
      setReplyDraftByProfileAndEntry,
      setEditOpenEntryByProfileId,
      setEditDraftByProfileAndEntry,
      setCollapsedEntryByProfileId,
      setVoteVotersEntryId,
      setViewedSubject,
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
    onRequestMarkAllRead: () => {
      if (!targetPlayerId || unreadGuestbookIds.length === 0 || markGuestbookReadAllMut.isPending) return;
      setMarkAllReadAsked(true);
    },
    markAllAsked: markAllReadAsked,
    markAllCount: unreadGuestbookIds.length,
    onCancelMarkAllRead: () => setMarkAllReadAsked(false),
    onConfirmMarkAllRead: () => {
      setMarkAllReadAsked(false);
      if (!targetPlayerId || unreadGuestbookIds.length === 0) return;
      markGuestbookReadAllMut.mutate();
    },
    markAllPending: markGuestbookReadAllMut.isPending,
    pendingDelete: pendingDeleteEntry,
    pendingDeleteReplyCount: pendingDeleteEntry
      ? countGuestbookDescendants(guestbookRootsAndChildren.childrenByParent, pendingDeleteEntry.id)
      : 0,
    deletePending: deleteGuestbookMut.isPending,
    onCancelDelete: () => setPendingDeleteEntry(null),
    onConfirmDelete: () => {
      const entry = pendingDeleteEntry;
      setPendingDeleteEntry(null);
      if (!entry) return;
      // `mutate`, not `mutateAsync`: failures are surfaced through errors.remove.
      deleteGuestbookMut.mutate(entry.id);
    },
    canPost: canPostGuestbook,
    draft: guestbookDraft,
    onDraftChange: (text) => {
      if (!targetPlayerId) return;
      setGuestbookDraftByPlayerId((prev) => ({ ...prev, [targetPlayerId]: text }));
    },
    onPost: () =>
      createGuestbookMut.mutate({ body: guestbookDraft.trim(), parentEntryId: null, subjectKind: subjectDraft }),
    posting: createGuestbookMut.isPending,
    composerNonce,
    subjectDraft,
    onClearSubject: clearSubject,
    viewedSubject,
    onCloseSubject: () => setViewedSubject(null),
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
    // The K3 contract: an item's trigger arms this composer, and the items need to know
    // whether there is anyone to arm it for and how many comments they already wrote.
    armSubject,
    canPostGuestbook,
    currentSubjectCounts,
    scrollToGuestbookSection,
  };
}
