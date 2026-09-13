import { CornerDownRight, MessagesSquare } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sideBy } from "../../helpers";

import FilterSelect from "../../ui/FilterSelect";
import { Chip } from "../../ui/primitives/Chip";
import LoadingPlaceholder from "../../ui/primitives/LoadingPlaceholder";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { showErrorToast } from "../../ui/primitives/ErrorToast";
import CommentImageCropper from "../../ui/primitives/CommentImageCropper";
import ImageLightbox from "../../ui/primitives/ImageLightbox";
import VoteVotersModal from "../../ui/primitives/VoteVotersModal";
import type { Club, Match, Player } from "../../api/types";
import { clubLabelPartsById } from "../../ui/clubControls";
import { listTournamentComments, listCommentVoters } from "../../api/comments.api";
import { qk } from "../../api/queryKeys";
import { useAuth } from "../../auth/AuthContext";
import { useSeenSet } from "../../hooks/useSeenComments";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { type CommentCardContextValue } from "./TournamentCommentParts";
import CommentComposer from "./comments/CommentComposer";
import { useCommentMutations } from "./comments/useCommentMutations";
import CommentFilterBar from "./comments/CommentFilterBar";
import CommentList from "./comments/CommentList";
import {
  type CommentAuthor,
  type CommentCreateMode,
  type CommentGoalSide,
  type CommentGoalTeamOption,
  type CommentScope,
  type TournamentComment,
} from "./tournamentCommentTypes";

export default function TournamentCommentsCard({
  tournamentId,
  matches,
  clubs,
  players,
  canWrite,
  canDelete,
  focusCommentRequest,
  onlyMatchId = null,
  showMatchHeader = true,
  title = "Comments",
}: {
  tournamentId: number;
  matches: Match[];
  clubs: Club[];
  players: Player[];
  canWrite: boolean;
  canDelete: boolean;
  focusCommentRequest?: { id: number; nonce: number } | null;
  /** When set, render only this match's comments + composer (used on the match detail page). */
  onlyMatchId?: number | null;
  /** Show the match score/clubs/stars header inside match blocks (off when score is shown elsewhere). */
  showMatchHeader?: boolean;
  /** Heading of the feed's card — the section is never collapsible (DESIGN.md §9b). */
  title?: string;
}) {
  const { token, role, actorPlayerId: currentPlayerId, actorPlayerName: currentPlayerName } = useAuth();
  const canAttachImage = role === "admin" || role === "editor";
  const seen = useSeenSet(tournamentId);
  const goalPlayersListId = useId();

  const { avatarUpdatedAtById: avatarUpdatedAtByPlayerId } = usePlayerAvatarMap();

  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p.display_name])), [players]);

  function sidePlayersLabel(m: Match, side: "A" | "B") {
    const s = sideBy(m, side);
    const names = (s?.players ?? []).map((p) => p.display_name).filter(Boolean);
    if (!names.length) return "—";
    // Use "/" to avoid the "Foo & Bar" look.
    return names.join("/");
  }

  // --- composer state (the chat row at the bottom of the feed) ---
  const [draftAuthor, setDraftAuthor] = useState<"general" | number>(currentPlayerId ?? "general");
  const [draftModeState, setDraftMode] = useState<CommentCreateMode>("comment");
  const [goalSide, setGoalSide] = useState<CommentGoalSide | null>(null);
  const [goalMinute, setGoalMinute] = useState("");
  const [goalPlayerName, setGoalPlayerName] = useState("");
  const [shotsA, setShotsA] = useState("");
  const [shotsB, setShotsB] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftImageBlob, setDraftImageBlob] = useState<Blob | null>(null);
  const [draftImagePreviewUrl, setDraftImagePreviewUrl] = useState<string | null>(null);
  const [imageCropOpen, setImageCropOpen] = useState(false);

  // --- inline edit state (a comment card, independent of the composer) ---
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAuthor, setEditAuthor] = useState<"general" | number>("general");
  const [editBody, setEditBody] = useState("");

  /** Set only when the user picks a different scope than the feed's own filter. */
  const [scopeOverride, setScopeOverride] = useState<CommentScope | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<number | null>(null);
  /** Bumped after a comment is posted, to put the caret back in the composer. */
  const [composerFocusNonce, setComposerFocusNonce] = useState(0);
  // Active scope filter for the feed: "all" | "general" | matchId.
  const [filter, setFilter] = useState<"all" | "general" | number>(
    onlyMatchId != null ? onlyMatchId : "all",
  );
  const [flashId, setFlashId] = useState<number | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const [voteVotersCommentId, setVoteVotersCommentId] = useState<number | null>(null);

  // Reply composer (per parent comment) + collapsed reply subtrees.
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [collapsedThreads, setCollapsedThreads] = useState<Set<number>>(new Set());
  const toggleThread = (id: number) =>
    setCollapsedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Per-group collapse within the feed (key: "general" | `m-${matchId}`).
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());
  const toggleBlock = (key: string) =>
    setCollapsedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const commentsQ = useQuery({
    queryKey: qk.commentsTournamentFull(tournamentId, token),
    queryFn: () => listTournamentComments(tournamentId, token),
    enabled: !!tournamentId,
  });

  const pinnedTournamentCommentId = commentsQ.data?.pinned_comment_id ?? null;

  const comments: TournamentComment[] = useMemo(() => {
    const raw = commentsQ.data?.comments ?? [];
    return raw.map((c) => ({
      id: c.id,
      parentId: c.parent_comment_id ?? null,
      createdAt: Date.parse(c.created_at),
      updatedAt: Date.parse(c.updated_at),
      scope: c.match_id == null ? { kind: "tournament" } : { kind: "match", matchId: c.match_id },
      author: c.author_player_id == null ? { kind: "general" } : { kind: "player", playerId: c.author_player_id },
      body: c.body ?? "",
      hasImage: !!c.has_image,
      imageUpdatedAt: c.image_updated_at ?? null,
      upvotes: Number(c.upvotes ?? 0),
      downvotes: Number(c.downvotes ?? 0),
      myVote: (c.my_vote ?? 0) as -1 | 0 | 1,
      canEdit: !!c.can_edit,
    }));
  }, [commentsQ.data]);

  const editingOriginal = useMemo(() => {
    if (editingId == null) return null;
    return comments.find((c) => c.id === editingId) ?? null;
  }, [comments, editingId]);

  const editDirty = useMemo(() => {
    if (!editingOriginal) return false;
    const origAuthor = editingOriginal.author.kind === "player" ? editingOriginal.author.playerId : "general";
    const origBody = (editingOriginal.body ?? "").trim();
    return origAuthor !== editAuthor || origBody !== (editBody ?? "").trim();
  }, [editAuthor, editBody, editingOriginal]);

  const canSaveEdit =
    editingId != null &&
    editDirty &&
    (!!editBody.trim() || !!(editingOriginal?.hasImage ?? false));

  useEffect(() => {
    // Reset UI state when switching tournaments.
    /* eslint-disable react-hooks/set-state-in-effect */
    setDraftAuthor(currentPlayerId ?? "general");
    setDraftMode("comment");
    setGoalSide(null);
    setGoalMinute("");
    setGoalPlayerName("");
    setShotsA("");
    setShotsB("");
    setDraftBody("");
    setDraftImageBlob(null);
    setDraftImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setImageCropOpen(false);
    setEditingId(null);
    setEditAuthor("general");
    setEditBody("");
    setScopeOverride(null);
    setPendingFocusId(null);
    setFlashId(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [tournamentId, currentPlayerId]);

  useEffect(() => {
    return () => {
      if (draftImagePreviewUrl) URL.revokeObjectURL(draftImagePreviewUrl);
    };
  }, [draftImagePreviewUrl]);

  useEffect(() => {
    if (!focusCommentRequest) return;
    const cid = Number(focusCommentRequest.id);
    if (!Number.isFinite(cid) || cid <= 0) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    // Reset to "All" so the target comment is never hidden by an active filter.
    if (onlyMatchId == null) setFilter("all");
    setPendingFocusId(Math.trunc(cid));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [focusCommentRequest, onlyMatchId]);

  useEffect(() => {
    if (!pendingFocusId) return;

    let cancelled = false;
    let tries = 0;

    const tryScroll = () => {
      if (cancelled) return;
      const commentEl = document.getElementById(`comment-${pendingFocusId}`);

      // Wait for query refresh to render the target comment into the DOM.
      if (!commentEl && tries < 240) {
        tries += 1;
        requestAnimationFrame(tryScroll);
        return;
      }

      if (commentEl) {
        commentEl.scrollIntoView({ block: "center", behavior: "smooth" });
        setFlashId(null);
        requestAnimationFrame(() => setFlashId(pendingFocusId));
        window.setTimeout(() => setFlashId(null), 1800);
      }

      setPendingFocusId(null);
    };

    requestAnimationFrame(tryScroll);
    return () => {
      cancelled = true;
    };
  }, [comments, pendingFocusId]);

  /** Clear the composer after a successful post (the scope stays where it was). */
  function resetDraft() {
    setDraftAuthor(currentPlayerId ?? "general");
    setDraftMode("comment");
    setGoalSide(null);
    setGoalMinute("");
    setGoalPlayerName("");
    setShotsA("");
    setShotsB("");
    setDraftBody("");
    setDraftImageBlob(null);
    setDraftImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setImageCropOpen(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditAuthor("general");
    setEditBody("");
  }

  function toggleEdit(c: TournamentComment) {
    if (editingId === c.id) {
      cancelEdit();
      return;
    }
    setEditingId(c.id);
    setEditAuthor(c.author.kind === "player" ? c.author.playerId : "general");
    setEditBody(c.body);
  }

  const { createMut, putImageMut, patchMut, deleteMut, pinMut, markReadMut, voteMut, actionError } =
    useCommentMutations(tournamentId);

  async function deleteComment(commentId: number) {
    const ok = window.confirm("Delete comment?");
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(commentId);
      if (editingId === commentId) cancelEdit();
    } catch {
      // handled by deleteMut.error (shown in UI)
    }
  }

  function openReply(parent: TournamentComment) {
    setEditingId(null);
    setReplyDraft("");
    setReplyToId((prev) => (prev === parent.id ? null : parent.id));
  }
  function cancelReply() {
    setReplyToId(null);
    setReplyDraft("");
  }
  async function submitReply(parent: TournamentComment) {
    const body = replyDraft.trim();
    if (!body || !token) return;
    try {
      const created = await createMut.mutateAsync({
        scope: parent.scope,
        parent_comment_id: parent.id,
        author_player_id: currentPlayerId ?? null,
        body,
        has_image: false,
      });
      setReplyToId(null);
      setReplyDraft("");
      // Make sure the new reply's subtree is visible.
      setCollapsedThreads((prev) => {
        if (!prev.has(parent.id)) return prev;
        const next = new Set(prev);
        next.delete(parent.id);
        return next;
      });
      if (created && typeof created.id === "number") setPendingFocusId(created.id);
    } catch {
      // surfaced via createMut.error
    }
  }

  /** Post whatever the composer currently holds (comment, goal or shots entry). */
  async function postComment() {
    const scope = composerScope;
    const body = draftBody.trim();
    const hasImage = !!draftImageBlob;

    if (draftMode === "goal") {
      if (
        goalSide == null ||
        !goalPlayerName.trim() ||
        normalizeGoalMinute(goalMinute) == null ||
        goalScoreForScope(scope, goalSide) == null
      ) {
        return;
      }
    } else if (draftMode === "shots") {
      if (normalizeShots(shotsA) == null || normalizeShots(shotsB) == null) return;
    } else if (!body && !hasImage) {
      return;
    }

    const author_player_id = draftAuthor === "general" ? null : draftAuthor;

    try {
      const created = await createMut.mutateAsync(
        draftMode === "goal"
          ? {
              scope,
              author_player_id,
              body,
              has_image: false,
              event_type: "goal",
              goal_minute: normalizeGoalMinute(goalMinute) ?? undefined,
              goal_player_name: goalPlayerName.trim(),
              result_score_a: goalScoreForScope(scope, goalSide)?.a,
              result_score_b: goalScoreForScope(scope, goalSide)?.b,
            }
          : draftMode === "shots"
            ? {
                scope,
                author_player_id,
                body: "",
                has_image: false,
                event_type: "shots",
                result_score_a: normalizeShots(shotsA) ?? undefined,
                result_score_b: normalizeShots(shotsB) ?? undefined,
              }
            : { scope, author_player_id, body, has_image: hasImage },
      );
      const imageBlob = draftImageBlob;
      if (draftMode === "comment" && hasImage && token && imageBlob) {
        try {
          await putImageMut.mutateAsync({ commentId: created.id, blob: imageBlob });
        } catch (e: unknown) {
          showErrorToast(e instanceof Error ? e.message : "Image upload failed", "Comment image upload failed");
        }
      }
      setPendingFocusId(created.id);
      resetDraft();
      if (draftMode === "comment") setComposerFocusNonce((n) => n + 1);
    } catch {
      // handled by mutation errors (shown in UI)
    }
  }

  /** Save the comment being edited inline in its card. */
  async function saveEdit() {
    if (editingId == null || !canSaveEdit) return;
    const body = editBody.trim();
    const author_player_id = editAuthor === "general" ? null : editAuthor;

    const patchPayload: { commentId: number; author_player_id?: number | null; body: string } = {
      commentId: editingId,
      body,
    };
    if (editingOriginal) {
      const originalAuthorId =
        editingOriginal.author.kind === "player" ? editingOriginal.author.playerId : null;
      if (originalAuthorId !== author_player_id) patchPayload.author_player_id = author_player_id;
    } else {
      patchPayload.author_player_id = author_player_id;
    }

    try {
      await patchMut.mutateAsync(patchPayload);
      setPendingFocusId(editingId);
      cancelEdit();
    } catch {
      // handled by mutation errors (shown in UI)
    }
  }

  function scopeLabel(scope: CommentScope) {
    if (scope.kind === "tournament") return "Tournament";
    const m = matchById.get(scope.matchId);
    const idx = m ? m.order_index + 1 : null;
    return idx ? `Match #${idx}` : `Match #${scope.matchId}`;
  }

  function authorLabel(author: CommentAuthor) {
    if (author.kind === "general") return "General";
    return playerById.get(author.playerId) ?? `Player #${author.playerId}`;
  }

  const matchesOrdered = useMemo(
    () => matches.slice().sort((a, b) => a.order_index - b.order_index),
    [matches],
  );

  const grouped = useMemo(() => {
    // Build the reply tree. Roots (no parent, or parent not in this payload) are grouped
    // by scope; replies render nested under their parent regardless of their own scope.
    const byId = new Map<number, TournamentComment>();
    for (const c of comments) byId.set(c.id, c);
    const childrenByParent = new Map<number, TournamentComment[]>();
    const roots: TournamentComment[] = [];
    for (const c of comments) {
      const pid = c.parentId;
      if (pid != null && byId.has(pid)) {
        const arr = childrenByParent.get(pid) ?? [];
        arr.push(c);
        childrenByParent.set(pid, arr);
      } else {
        roots.push(c);
      }
    }
    for (const [k, arr] of childrenByParent.entries()) {
      arr.sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
      childrenByParent.set(k, arr);
    }

    // Map every comment to the scope key of its root, so per-group counts and
    // unread badges account for nested replies too.
    const rootScopeKey = new Map<number, string>();
    const keyForScope = (c: TournamentComment) => (c.scope.kind === "tournament" ? "general" : `m-${c.scope.matchId}`);
    for (const c of comments) {
      let cur: TournamentComment | undefined = c;
      const guard = new Set<number>();
      while (cur && cur.parentId != null && byId.has(cur.parentId) && !guard.has(cur.id)) {
        guard.add(cur.id);
        cur = byId.get(cur.parentId);
      }
      rootScopeKey.set(c.id, keyForScope(cur ?? c));
    }

    const tournament = roots
      .filter((c) => c.scope.kind === "tournament")
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);

    const byMatch = new Map<number, TournamentComment[]>();
    for (const c of roots) {
      if (c.scope.kind !== "match") continue;
      const arr = byMatch.get(c.scope.matchId) ?? [];
      arr.push(c);
      byMatch.set(c.scope.matchId, arr);
    }
    for (const [k, arr] of byMatch.entries()) {
      arr.sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
      byMatch.set(k, arr);
    }

    const blocks: { matchId: number; comments: TournamentComment[] }[] = [];
    const seen = new Set<number>();
    for (const m of matchesOrdered) {
      const arr = byMatch.get(m.id) ?? [];
      blocks.push({ matchId: m.id, comments: arr });
      seen.add(m.id);
    }

    // Any match comments that reference matches not in this tournament payload (should be rare).
    const leftovers = Array.from(byMatch.entries())
      .filter(([mid, arr]) => !seen.has(mid) && arr.length)
      .sort(([a], [b]) => a - b);
    for (const [mid, arr] of leftovers) blocks.push({ matchId: mid, comments: arr });

    return { tournament, blocks, childrenByParent, rootScopeKey };
  }, [comments, matchesOrdered]);
  const childrenByParent = grouped.childrenByParent;

  const pinnedTournamentComment = useMemo(() => {
    if (!pinnedTournamentCommentId) return null;
    return grouped.tournament.find((c) => c.id === pinnedTournamentCommentId) ?? null;
  }, [grouped.tournament, pinnedTournamentCommentId]);

  function matchHeaderMeta(matchId: number) {
    const m = matchById.get(matchId);
    if (!m) return null;
    const a = sideBy(m, "A");
    const b = sideBy(m, "B");
    const aClubId = a?.club_id ?? null;
    const bClubId = b?.club_id ?? null;
    const aClub = clubLabelPartsById(clubs, aClubId);
    const bClub = clubLabelPartsById(clubs, bClubId);

    const rawAG = a?.goals;
    const rawBG = b?.goals;
    const scoreDash = m.state === "scheduled" && rawAG == null && rawBG == null;
    const aGoals = scoreDash ? null : Number(rawAG ?? 0);
    const bGoals = scoreDash ? null : Number(rawBG ?? 0);

    return {
      title: scopeLabel({ kind: "match", matchId }),
      aPlayers: sidePlayersLabel(m, "A"),
      bPlayers: sidePlayersLabel(m, "B"),
      aGoals,
      bGoals,
      aClub: { ...aClub, present: !!aClubId },
      bClub: { ...bClub, present: !!bClubId },
    };
  }

  function goalTeamsForScope(scope: CommentScope | null | undefined): CommentGoalTeamOption[] {
    if (!scope || scope.kind !== "match") return [];
    const match = matchById.get(scope.matchId);
    if (!match) return [];
    const current = currentScorelineForScope(scope);
    if (!current) return [];
    return match.sides
      .slice()
      .sort((left, right) => left.side.localeCompare(right.side))
      .map((side) => ({
        side: side.side as CommentGoalSide,
        label: sidePlayersLabel(match, side.side as CommentGoalSide),
        nextScoreline:
          side.side === "A" ? `${current.a + 1}-${current.b}` : `${current.a}-${current.b + 1}`,
      }));
  }

  function normalizeGoalMinute(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const minute = Number(trimmed);
    if (!Number.isFinite(minute)) return null;
    const normalized = Math.trunc(minute);
    if (normalized <= 0 || normalized > 999) return null;
    return normalized;
  }

  function normalizeShots(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return null;
    const v = Math.trunc(n);
    if (v < 0 || v > 999) return null;
    return v;
  }

  function currentScorelineForScope(scope: CommentScope | null | undefined): { a: number; b: number } | null {
    if (!scope || scope.kind !== "match") return null;
    const match = matchById.get(scope.matchId);
    if (!match) return null;
    const sideA = sideBy(match, "A");
    const sideB = sideBy(match, "B");
    const aGoals = Number(sideA?.goals ?? 0);
    const bGoals = Number(sideB?.goals ?? 0);
    if (!Number.isFinite(aGoals) || !Number.isFinite(bGoals)) return null;
    return { a: aGoals, b: bGoals };
  }

  function goalPlayersForScope(
    scope: CommentScope | null | undefined,
    side: CommentGoalSide | null | undefined,
  ): { label: string }[] {
    if (!scope || scope.kind !== "match" || side == null) return [];
    const match = matchById.get(scope.matchId);
    if (!match) return [];
    const team = sideBy(match, side);
    return (team?.players ?? []).map((player) => ({ label: player.display_name }));
  }

  function goalScoreForScope(
    scope: CommentScope | null | undefined,
    side: CommentGoalSide | null | undefined,
  ): { a: number; b: number } | null {
    const current = currentScorelineForScope(scope);
    if (!current || side == null) return null;
    return side === "A" ? { a: current.a + 1, b: current.b } : { a: current.a, b: current.b + 1 };
  }

  // The composer posts where you are looking: the match detail page pins it to its
  // match, the feed's scope filter decides otherwise, and the "Post to" selector
  // overrides both until the filter changes again.
  function defaultAddScope(): CommentScope {
    if (onlyMatchId != null) return { kind: "match", matchId: onlyMatchId };
    if (typeof filter === "number") return { kind: "match", matchId: filter };
    return { kind: "tournament" };
  }
  const composerScope: CommentScope = scopeOverride ?? defaultAddScope();
  // A goal or shots entry only exists on a match: if the scope moves back to the
  // tournament (by selector *or* by the feed's filter), the row is a comment again.
  const draftMode: CommentCreateMode = composerScope.kind === "match" ? draftModeState : "comment";
  const composerScopeValue =
    composerScope.kind === "tournament" ? "general" : `m-${composerScope.matchId}`;

  function changeComposerScope(value: string) {
    const scope: CommentScope =
      value === "general" ? { kind: "tournament" } : { kind: "match", matchId: Number(value.slice(2)) };
    setScopeOverride(scope);
    if (scope.kind === "tournament" && draftMode !== "comment") handleDraftModeChange("comment");
  }

  function changeFilter(next: "all" | "general" | number) {
    setFilter(next);
    // The composer follows the feed again once the reader changes what they look at.
    setScopeOverride(null);
  }

  const canSubmit =
    draftMode === "goal"
      ? !!goalPlayerName.trim() &&
        goalSide != null &&
        normalizeGoalMinute(goalMinute) != null &&
        goalScoreForScope(composerScope, goalSide) != null
      : draftMode === "shots"
        ? normalizeShots(shotsA) != null && normalizeShots(shotsB) != null
        : !!draftBody.trim() || !!draftImageBlob;

  function setDraftImage(blob: Blob | null) {
    setDraftImageBlob(blob);
    setDraftImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
  }

  function handleDraftModeChange(nextMode: CommentCreateMode) {
    setDraftMode(nextMode);
    if (nextMode === "comment") {
      if (currentPlayerId != null) setDraftAuthor(currentPlayerId);
    } else {
      // goal/shots are informational match events → posted as General by default.
      setDraftAuthor("general");
    }
    if (nextMode !== "goal") {
      setGoalSide(null);
      setGoalMinute("");
      setGoalPlayerName("");
    }
    if (nextMode !== "shots") {
      setShotsA("");
      setShotsB("");
    }
    if (nextMode !== "comment") {
      setDraftImageBlob(null);
      setDraftImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }

  function handleGoalSideChange(nextSide: CommentGoalSide) {
    setGoalSide(nextSide);
    // A 1v1 side has exactly one player — prefill the scorer instead of asking for it.
    const players = goalPlayersForScope(composerScope, nextSide);
    setGoalPlayerName(players.length === 1 ? (players[0]?.label ?? "") : "");
  }

  const matchIndexById = useMemo(() => {
    const m = new Map<number, number>();
    matchesOrdered.forEach((mt, i) => m.set(mt.id, i + 1));
    return m;
  }, [matchesOrdered]);

  // --- chips / filtered feed ---
  const generalComments = grouped.tournament;
  const generalUnseen =
    !!token && comments.some((c) => grouped.rootScopeKey.get(c.id) === "general" && !seen.has(c.id));
  const matchBlocksWithComments = grouped.blocks.filter((b) => b.comments.length > 0);
  const totalComments = comments.length;

  const composer = canWrite ? (
    <CommentComposer
      mode={draftMode}
      onModeChange={handleDraftModeChange}
      allowMatchEventModes={composerScope.kind === "match"}
      scopeControl={
        onlyMatchId == null ? (
          <FilterSelect
            value={composerScopeValue}
            onChange={changeComposerScope}
            ariaLabel="Post to"
            className="py-1.5"
            leading={<CornerDownRight size={14} aria-hidden="true" />}
            options={[
              { value: "general", label: "General (tournament)" },
              ...matchesOrdered.map((m) => ({
                value: `m-${m.id}`,
                label: `Match ${matchIndexById.get(m.id)} — ${sidePlayersLabel(m, "A")} vs ${sidePlayersLabel(m, "B")}`,
              })),
            ]}
          />
        ) : null
      }
      authorControl={
        currentPlayerId != null ? (
          <Chip
            selected={draftAuthor !== "general"}
            onClick={() => setDraftAuthor(draftAuthor === "general" ? currentPlayerId : "general")}
            className="shrink-0"
            title="Post as yourself or as General"
            ariaLabel={`Posted as ${draftAuthor === "general" ? "General" : currentPlayerName || "me"}`}
          >
            {draftAuthor === "general" ? "General" : currentPlayerName || "Me"}
          </Chip>
        ) : null
      }
      goalTeams={composerScope.kind === "match" ? goalTeamsForScope(composerScope) : []}
      goalSide={goalSide}
      onGoalSideChange={handleGoalSideChange}
      goalPlayers={composerScope.kind === "match" ? goalPlayersForScope(composerScope, goalSide) : []}
      goalMinute={goalMinute}
      onGoalMinuteChange={setGoalMinute}
      goalPlayerName={goalPlayerName}
      onGoalPlayerNameChange={setGoalPlayerName}
      shotsA={shotsA}
      onShotsAChange={setShotsA}
      shotsB={shotsB}
      onShotsBChange={setShotsB}
      draftBody={draftBody}
      onChangeDraftBody={setDraftBody}
      canAttachImage={canAttachImage}
      imagePreviewUrl={draftImagePreviewUrl}
      onOpenImageCropper={() => setImageCropOpen(true)}
      onClearImage={() => setDraftImage(null)}
      onSubmit={() => void postComment()}
      canSubmit={canSubmit}
      submitting={createMut.isPending}
      playersListId={goalPlayersListId}
      focusNonce={composerFocusNonce}
    />
  ) : null;

  // Shared/stable card-level values (viewer permissions, draft/reply/edit state, callbacks)
  // handed to CommentList/CommentCard as one bundle instead of ~30 individual props —
  // mirrors GuestbookCardContextValue in profile/useProfileGuestbook.ts. Built fresh each
  // render (not useMemo'd): several of its callbacks close over plain function declarations
  // above (openReply, submitReply, toggleEdit, deleteComment, saveEdit, authorLabel)
  // that are recreated every render, so memoizing here would either recompute every render
  // anyway or — if under-declared as deps — reintroduce the stale-closure trap fixed in F1.
  const commentCardCtx: CommentCardContextValue = {
    token,
    seen,
    canWrite,
    canDelete,
    players,
    currentPlayerId,
    currentPlayerName,
    avatarUpdatedAtByPlayerId,
    authorLabel,
    editingId,
    editAuthor,
    editBody,
    canSaveEdit,
    pinnedTournamentCommentId,
    flashId,
    replyToId,
    replyDraft,
    replySubmitting: createMut.isPending,
    onMarkSeen: (id) => {
      if (!token || markReadMut.isPending) return;
      markReadMut.mutate(id);
    },
    onTogglePin: (c) => {
      const next = pinnedTournamentCommentId === c.id ? null : c.id;
      void pinMut.mutateAsync(next);
    },
    onVote: (id, value) => {
      if (!token || voteMut.isPending) return;
      voteMut.mutate({ commentId: id, value });
    },
    onOpenVoters: (id) => setVoteVotersCommentId(id),
    onOpenImage: (src) => setLightboxSrc(src),
    openReply,
    cancelReply,
    submitReply: (c) => void submitReply(c),
    setReplyDraft,
    toggleEdit,
    deleteComment: (id) => void deleteComment(id),
    setEditAuthor,
    setEditBody,
    saveEdit: () => void saveEdit(),
  };

  // "Collapse all" folds the match blocks of the full feed — a different thing from the
  // section collapse T3 removed, so it stays, as the header's one action.
  const blockKeys = matchBlocksWithComments.map((b) => `m-${b.matchId}`);
  const allBlocksCollapsed = blockKeys.length > 0 && blockKeys.every((k) => collapsedBlocks.has(k));
  const showCollapseAll = onlyMatchId == null && filter === "all" && blockKeys.length > 0;
  // The count says what this feed shows: a match-scoped card counts that match's thread.
  const headerCount =
    onlyMatchId == null
      ? totalComments
      : comments.filter((c) => grouped.rootScopeKey.get(c.id) === `m-${onlyMatchId}`).length;

  return (
    <>
    {/* Feed and composer are one card (DESIGN.md §9b): a header row, the feed, a hairline,
        and the composer attached to the card's bottom edge — never a collapsible. */}
    <section className="card min-w-0 p-0" data-comments-feed>
      <div className="flex items-center justify-between gap-2 border-b border-border-card-outer/55 px-3 py-2.5">
        <h2 className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-text-normal">
          <MessagesSquare size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
          <span className="truncate">{title}</span>
          <span className="shrink-0 text-xs font-normal tabular-nums text-text-muted">{headerCount}</span>
        </h2>
        {showCollapseAll ? (
          <button
            type="button"
            onClick={() => setCollapsedBlocks(allBlocksCollapsed ? new Set() : new Set(blockKeys))}
            className="focus-ring shrink-0 rounded-full px-1 text-xs text-text-muted transition hover:text-text-normal"
          >
            {allBlocksCollapsed ? "Expand all" : "Collapse all"}
          </button>
        ) : null}
      </div>

      <ErrorToastOnError error={commentsQ.error} title="Comments loading failed" />
      <ErrorToastOnError error={actionError} title="Comment action failed" />

      {onlyMatchId == null ? (
        <div className="border-b border-border-card-outer/55 px-3 py-2">
          <CommentFilterBar
            filter={filter}
            onChange={changeFilter}
            totalCount={totalComments}
            generalCount={generalComments.length}
            generalUnseen={generalUnseen}
            matchChips={matchBlocksWithComments.map((b) => ({
              matchId: b.matchId,
              label: `Match ${matchIndexById.get(b.matchId) ?? b.matchId}`,
              count: b.comments.length,
              unseen: !!token && b.comments.some((c) => !seen.has(c.id)),
            }))}
          />
        </div>
      ) : null}

      {commentsQ.isLoading ? (
        <div className="px-3 py-3">
          <LoadingPlaceholder />
        </div>
      ) : null}

      <CommentList
        onlyMatchId={onlyMatchId}
        filter={filter}
        blocks={grouped.blocks}
        matchBlocksWithComments={matchBlocksWithComments}
        generalComments={generalComments}
        pinnedTournamentComment={pinnedTournamentComment}
        comments={comments}
        totalComments={totalComments}
        childrenByParent={childrenByParent}
        rootScopeKey={grouped.rootScopeKey}
        matchHeaderMeta={matchHeaderMeta}
        showMatchHeader={showMatchHeader}
        collapsedBlocks={collapsedBlocks}
        toggleBlock={toggleBlock}
        collapsedThreads={collapsedThreads}
        toggleThread={toggleThread}
        ctx={commentCardCtx}
      />

      {/* The composer is the card's last row, chat-style. */}
      {composer}
    </section>
    <CommentImageCropper
      open={imageCropOpen}
      title="Attach comment image"
      onClose={() => setImageCropOpen(false)}
      onApply={(blob) => setDraftImage(blob)}
    />
    <VoteVotersModal
      open={voteVotersCommentId != null}
      title="Comment votes"
      queryKey={["comments", "voters", voteVotersCommentId ?? "none"]}
      queryFn={() => listCommentVoters(voteVotersCommentId as number)}
      onClose={() => setVoteVotersCommentId(null)}
    />
    <ImageLightbox open={!!lightboxSrc} src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </>
  );
}
