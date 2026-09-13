import { ChevronDown, ChevronUp, MessageSquare, MessagesSquare, Goal, Plus, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sideBy } from "../../helpers";

import Button from "../../ui/primitives/Button";
import FormLabel from "../../ui/primitives/FormLabel";
import FilterSelect from "../../ui/FilterSelect";
import LoadingPlaceholder from "../../ui/primitives/LoadingPlaceholder";
import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { showErrorToast } from "../../ui/primitives/ErrorToast";
import CommentImageCropper from "../../ui/primitives/CommentImageCropper";
import ImageLightbox from "../../ui/primitives/ImageLightbox";
import VoteVotersModal from "../../ui/primitives/VoteVotersModal";
import type { Club, Match, Player } from "../../api/types";
import { clubLabelPartsById } from "../../ui/clubControls";
import { type CommentGoalSide, type CommentGoalTeamOption } from "./CommentCreateComposer";
import { putCommentImage, listTournamentComments, listCommentVoters } from "../../api/comments.api";
import { qk } from "../../api/queryKeys";
import { useAuth } from "../../auth/AuthContext";
import { useSeenSet } from "../../hooks/useSeenComments";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { AddCommentDropdown, type CommentCardContextValue } from "./TournamentCommentParts";
import { useCommentMutations } from "./comments/useCommentMutations";
import CommentFilterBar from "./comments/CommentFilterBar";
import CommentList from "./comments/CommentList";
import {
  type CommentAuthor,
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
  collapsible = true,
  onlyMatchId = null,
  showMatchHeader = true,
  collapsibleHeader = null,
  defaultCollapsed = false,
}: {
  tournamentId: number;
  matches: Match[];
  clubs: Club[];
  players: Player[];
  canWrite: boolean;
  canDelete: boolean;
  focusCommentRequest?: { id: number; nonce: number } | null;
  collapsible?: boolean;
  /** When set, render only this match's comments + composer (used on the match detail page). */
  onlyMatchId?: number | null;
  /** Show the match score/clubs/stars header inside match blocks (off when score is shown elsewhere). */
  showMatchHeader?: boolean;
  /** When set, render a collapse header with this title (e.g. "Match comments"); state persisted. */
  collapsibleHeader?: string | null;
  defaultCollapsed?: boolean;
}) {
  const { token, role, actorPlayerId: currentPlayerId, actorPlayerName: currentPlayerName } = useAuth();
  const canAttachImage = role === "admin" || role === "editor";
  const seen = useSeenSet(tournamentId);

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

  // --- create/edit form state ---
  const [draftAuthor, setDraftAuthor] = useState<"general" | number>(currentPlayerId ?? "general");
  const [draftMode, setDraftMode] = useState<"comment" | "goal" | "shots">("comment");
  const [goalSide, setGoalSide] = useState<CommentGoalSide | null>(null);
  const [goalMinute, setGoalMinute] = useState("");
  const [goalPlayerName, setGoalPlayerName] = useState("");
  const [shotsA, setShotsA] = useState("");
  const [shotsB, setShotsB] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftImageBlob, setDraftImageBlob] = useState<Blob | null>(null);
  const [draftImagePreviewUrl, setDraftImagePreviewUrl] = useState<string | null>(null);
  const [imageCropOpen, setImageCropOpen] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [addTarget, setAddTarget] = useState<CommentScope | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<number | null>(null);
  // Active scope filter for the feed: "all" | "general" | matchId.
  const [filter, setFilter] = useState<"all" | "general" | number>(
    onlyMatchId != null ? onlyMatchId : "all",
  );
  const [flashId, setFlashId] = useState<number | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Collapse state (persisted) for the inline collapse header.
  const collapseKey = `cmt-collapsed:${tournamentId}:${onlyMatchId ?? "all"}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const raw = localStorage.getItem(collapseKey);
    return raw == null ? defaultCollapsed : raw === "1";
  });
  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(collapseKey, next ? "1" : "0");
      return next;
    });
  };
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

  const editingDirty = useMemo(() => {
    if (!editingOriginal) return false;
    const origAuthor = editingOriginal.author.kind === "player" ? editingOriginal.author.playerId : "general";
    const nextAuthor = draftAuthor;
    const origBody = (editingOriginal.body ?? "").trim();
    const nextBody = (draftBody ?? "").trim();
    return origAuthor !== nextAuthor || origBody !== nextBody;
  }, [draftAuthor, draftBody, editingOriginal]);

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
    setAddTarget(null);
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
    setEditingId(null);
    setAddTarget(null);
  }

  function startEdit(c: TournamentComment) {
    setEditingId(c.id);
    setDraftAuthor(c.author.kind === "player" ? c.author.playerId : "general");
    setDraftMode("comment");
    setGoalSide(null);
    setGoalMinute("");
    setGoalPlayerName("");
    setShotsA("");
    setShotsB("");
    setDraftBody(c.body);
    setDraftImageBlob(null);
    setDraftImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setImageCropOpen(false);
    setAddTarget(null);
  }

  function toggleEdit(c: TournamentComment) {
    if (editingId === c.id) {
      resetDraft();
      return;
    }
    startEdit(c);
  }

  const { createMut, patchMut, deleteMut, pinMut, markReadMut, voteMut, actionError } =
    useCommentMutations(tournamentId);

  async function deleteComment(commentId: number) {
    const ok = window.confirm("Delete comment?");
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(commentId);
      if (editingId === commentId) resetDraft();
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

  async function upsertComment(scope: CommentScope) {
    const body = draftBody.trim();
    const hasImage = !!draftImageBlob;
    if (editingId != null) {
      if (!body && !(editingOriginal?.hasImage ?? false)) return;
    } else if (draftMode === "goal") {
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
      if (editingId != null) {
        if (!editingDirty) return;
        const patchPayload: { commentId: number; author_player_id?: number | null; body: string } = {
          commentId: editingId,
          body,
        };
        if (editingOriginal) {
          const originalAuthorId =
            editingOriginal.author.kind === "player" ? editingOriginal.author.playerId : null;
          if (originalAuthorId !== author_player_id) {
            patchPayload.author_player_id = author_player_id;
          }
        } else {
          patchPayload.author_player_id = author_player_id;
        }
        await patchMut.mutateAsync(patchPayload);
        setPendingFocusId(editingId);
      } else {
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
            await putCommentImage(token, created.id, imageBlob, "comment.webp");
          } catch (e: unknown) {
            showErrorToast(e instanceof Error ? e.message : "Image upload failed", "Comment image upload failed");
          }
        }
        setPendingFocusId(created.id);
      }
      resetDraft();
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

  const canSubmit =
    draftMode === "goal"
      ? !!goalPlayerName.trim() &&
        goalSide != null &&
        normalizeGoalMinute(goalMinute) != null &&
        goalScoreForScope(addTarget, goalSide) != null
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

  function handleDraftModeChange(nextMode: "comment" | "goal" | "shots") {
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
    setGoalPlayerName("");
  }

  const addAuthorOptions = useMemo(() => {
    const options: { value: "general" | number; label: string }[] = [];
    if (currentPlayerId != null) {
      options.push({ value: currentPlayerId, label: currentPlayerName || "Me" });
    }
    options.push({ value: "general", label: "General" });
    if (draftAuthor !== "general" && currentPlayerId != null && draftAuthor !== currentPlayerId) {
      options.push({
        value: draftAuthor,
        label: `${playerById.get(draftAuthor) ?? `Player #${draftAuthor}`} (original)`,
      });
    }
    return options;
  }, [currentPlayerId, currentPlayerName, draftAuthor, playerById]);

  const matchIndexById = useMemo(() => {
    const m = new Map<number, number>();
    matchesOrdered.forEach((mt, i) => m.set(mt.id, i + 1));
    return m;
  }, [matchesOrdered]);

  // Open the composer for a scope (resetting draft fields), optionally pre-set to a
  // match-event mode (goal/shots). Match events are only valid on a match scope.
  function openComposer(scope: CommentScope, initialMode: "comment" | "goal" | "shots" = "comment") {
    setEditingId(null);
    setGoalSide(null);
    setGoalMinute("");
    setGoalPlayerName("");
    setShotsA("");
    setShotsB("");
    setDraftBody("");
    setDraftImage(null);
    const mode = scope.kind === "match" ? initialMode : "comment";
    setDraftMode(mode);
    setDraftAuthor(mode === "comment" ? currentPlayerId ?? "general" : "general");
    setAddTarget(scope);
  }
  function changeComposerScope(value: string) {
    const scope: CommentScope =
      value === "general" ? { kind: "tournament" } : { kind: "match", matchId: Number(value.slice(2)) };
    setAddTarget(scope);
    if (scope.kind === "tournament" && draftMode !== "comment") handleDraftModeChange("comment");
  }
  const composerScopeValue =
    addTarget == null ? "general" : addTarget.kind === "tournament" ? "general" : `m-${addTarget.matchId}`;

  // Default scope used when opening the composer from the current filter.
  function defaultAddScope(): CommentScope {
    if (onlyMatchId != null) return { kind: "match", matchId: onlyMatchId };
    if (typeof filter === "number") return { kind: "match", matchId: filter };
    return { kind: "tournament" };
  }

  // --- chips / filtered feed ---
  const generalComments = grouped.tournament;
  const generalUnseen =
    !!token && comments.some((c) => grouped.rootScopeKey.get(c.id) === "general" && !seen.has(c.id));
  const matchBlocksWithComments = grouped.blocks.filter((b) => b.comments.length > 0);
  const totalComments = comments.length;

  const composer = canWrite && addTarget ? (
    <div className="panel-subtle p-3 space-y-3">
      {onlyMatchId == null ? (
        <div className="block">
          <FormLabel>Add to</FormLabel>
          <FilterSelect
            value={composerScopeValue}
            onChange={changeComposerScope}
            ariaLabel="Add comment to"
            options={[
              { value: "general", label: "General (tournament)" },
              ...matchesOrdered.map((m) => ({
                value: `m-${m.id}`,
                label: `Match ${matchIndexById.get(m.id)} — ${sidePlayersLabel(m, "A")} vs ${sidePlayersLabel(m, "B")}`,
              })),
            ]}
          />
        </div>
      ) : null}
      <AddCommentDropdown
        open
        authorOptions={addAuthorOptions}
        draftAuthor={draftAuthor}
        onChangeDraftAuthor={setDraftAuthor}
        draftMode={draftMode}
        onChangeDraftMode={handleDraftModeChange}
        allowMatchEventModes={addTarget.kind === "match"}
        goalTeams={addTarget.kind === "match" ? goalTeamsForScope(addTarget) : []}
        goalSide={goalSide}
        onChangeGoalSide={handleGoalSideChange}
        goalPlayers={addTarget.kind === "match" ? goalPlayersForScope(addTarget, goalSide) : []}
        goalMinute={goalMinute}
        onChangeGoalMinute={setGoalMinute}
        goalPlayerName={goalPlayerName}
        onChangeGoalPlayerName={setGoalPlayerName}
        shotsA={shotsA}
        onChangeShotsA={setShotsA}
        shotsB={shotsB}
        onChangeShotsB={setShotsB}
        draftBody={draftBody}
        onChangeDraftBody={setDraftBody}
        canAttachImage={canAttachImage}
        imagePreviewUrl={draftImagePreviewUrl}
        onOpenImageCropper={() => setImageCropOpen(true)}
        onClearImage={() => setDraftImage(null)}
        onSubmit={() => {
          if (addTarget) void upsertComment(addTarget);
        }}
        onCancel={() => setAddTarget(null)}
        canSubmit={canSubmit}
        surfaceClassName=""
      />
    </div>
  ) : null;

  // Entry point for adding to the feed: on a match scope we surface three equal
  // options (comment / goal / shots); the general thread only takes a comment.
  const entryScope = defaultAddScope();
  const entryAllowsEvents = entryScope.kind === "match";

  // Shared/stable card-level values (viewer permissions, draft/reply/edit state, callbacks)
  // handed to CommentList/CommentCard as one bundle instead of ~30 individual props —
  // mirrors GuestbookCardContextValue in profile/useProfileGuestbook.ts. Built fresh each
  // render (not useMemo'd): several of its callbacks close over plain function declarations
  // above (openReply, submitReply, toggleEdit, deleteComment, upsertComment, authorLabel)
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
    editingDirty,
    pinnedTournamentCommentId,
    flashId,
    draftAuthor,
    draftBody,
    canSubmit,
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
    setDraftAuthor,
    setDraftBody,
    upsertComment: (scope) => void upsertComment(scope),
  };

  const commentsContent = (
    <>
        <ErrorToastOnError error={commentsQ.error} title="Comments loading failed" />
        <ErrorToastOnError error={actionError} title="Comment action failed" />
        {commentsQ.isLoading ? <LoadingPlaceholder /> : null}

        <div className="space-y-3">
          {/* Scope filter chips */}
          {onlyMatchId == null ? (
            <CommentFilterBar
              filter={filter}
              onChange={setFilter}
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
          ) : null}

          {/* Add entry: comment / goal / shots (matches) or just a comment (general). */}
          {canWrite ? (
            addTarget ? (
              composer
            ) : entryAllowsEvents ? (
              <div className="grid grid-cols-3 gap-2">
                <Button type="button" variant="ghost" className="h-10 px-2 inline-flex items-center justify-center gap-1.5" onClick={() => openComposer(entryScope, "comment")} title="Add comment">
                  <MessageSquare size={14} aria-hidden="true" />
                  <span className="truncate">Add comment</span>
                </Button>
                <Button type="button" variant="ghost" className="h-10 px-2 inline-flex items-center justify-center gap-1.5" onClick={() => openComposer(entryScope, "goal")} title="Enter goal">
                  <Goal size={14} aria-hidden="true" />
                  <span className="truncate">Enter goal</span>
                </Button>
                <Button type="button" variant="ghost" className="h-10 px-2 inline-flex items-center justify-center gap-1.5" onClick={() => openComposer(entryScope, "shots")} title="Enter shots">
                  <Target size={14} aria-hidden="true" />
                  <span className="truncate">Enter Shots</span>
                </Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" onClick={() => openComposer(entryScope, "comment")}>
                <Plus size={14} className="mr-1.5 inline-block align-[-2px]" aria-hidden="true" />
                Add comment
              </Button>
            )
          ) : null}

          {/* Feed */}
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
            setCollapsedBlocks={setCollapsedBlocks}
            toggleBlock={toggleBlock}
            collapsedThreads={collapsedThreads}
            toggleThread={toggleThread}
            ctx={commentCardCtx}
          />
        </div>
    </>
  );

  const collapseHeader = collapsibleHeader ? (
    <button
      type="button"
      onClick={toggleCollapsed}
      className="focus-ring flex w-full items-center justify-between gap-2 rounded-xl bg-bg-card-chip/30 px-3 py-3 text-left transition hover:bg-bg-card-chip/45"
      aria-expanded={!collapsed}
    >
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-text-normal">
        <MessagesSquare size={14} className="text-text-muted" aria-hidden="true" />
        {collapsibleHeader}
        <span className="rounded-full bg-bg-card-chip/70 px-1.5 text-xs font-normal tabular-nums text-text-muted">{comments.length}</span>
      </span>
      {collapsed ? <ChevronDown size={14} className="text-text-muted" aria-hidden="true" /> : <ChevronUp size={14} className="text-text-muted" aria-hidden="true" />}
    </button>
  ) : null;

  return (
    <>
    {collapsibleHeader ? (
      <div className="space-y-3">
        {collapseHeader}
        {!collapsed ? commentsContent : null}
      </div>
    ) : collapsible ? (
      <CollapsibleCard title="Comments" defaultOpen={true} variant="card" bodyVariant="none" bodyClassName="space-y-3">
        {commentsContent}
      </CollapsibleCard>
    ) : (
      <div className="space-y-3">{commentsContent}</div>
    )}
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
