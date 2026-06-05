import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { showErrorToast } from "../../ui/primitives/ErrorToast";
import CommentImageCropper from "../../ui/primitives/CommentImageCropper";
import ImageLightbox from "../../ui/primitives/ImageLightbox";
import VoteVotersModal from "../../ui/primitives/VoteVotersModal";
import type { Club, Match, Player } from "../../api/types";
import { clubLabelPartsById } from "../../ui/clubControls";
import { StarsFA } from "../../ui/primitives/StarsFA";
import { type CommentGoalSide, type CommentGoalTeamOption } from "./CommentCreateComposer";
import {
  createTournamentComment,
  putCommentImage,
  deleteComment as apiDeleteComment,
  listTournamentComments,
  listCommentVoters,
  markCommentRead,
  patchComment as apiPatchComment,
  setPinnedTournamentComment,
  voteComment,
} from "../../api/comments.api";
import { useAuth } from "../../auth/AuthContext";
import { useSeenSet } from "../../hooks/useSeenComments";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { AddCommentDropdown, CommentCard, ScopeActionButton } from "./TournamentCommentParts";
import {
  sameScope,
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
}: {
  tournamentId: number;
  matches: Match[];
  clubs: Club[];
  players: Player[];
  canWrite: boolean;
  canDelete: boolean;
  focusCommentRequest?: { id: number; nonce: number } | null;
  collapsible?: boolean;
}) {
  const qc = useQueryClient();
  const { token, role, actorPlayerId: currentPlayerId, actorPlayerName: currentPlayerName } = useAuth();
  const canAttachImage = role === "admin" || role === "editor";
  const seen = useSeenSet(tournamentId);

  const { avatarUpdatedAtById: avatarUpdatedAtByPlayerId } = usePlayerAvatarMap();

  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p.display_name])), [players]);

  function sideBy(m: Match, side: "A" | "B") {
    return m.sides.find((s) => s.side === side);
  }

  function sidePlayersLabel(m: Match, side: "A" | "B") {
    const s = sideBy(m, side);
    const names = (s?.players ?? []).map((p) => p.display_name).filter(Boolean);
    if (!names.length) return "—";
    // Use "/" to avoid the "Foo & Bar" look.
    return names.join("/");
  }

  // --- create/edit form state ---
  const [draftAuthor, setDraftAuthor] = useState<"general" | number>(currentPlayerId ?? "general");
  const [draftMode, setDraftMode] = useState<"comment" | "goal">("comment");
  const [goalSide, setGoalSide] = useState<CommentGoalSide | null>(null);
  const [goalMinute, setGoalMinute] = useState("");
  const [goalPlayerName, setGoalPlayerName] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftImageBlob, setDraftImageBlob] = useState<Blob | null>(null);
  const [draftImagePreviewUrl, setDraftImagePreviewUrl] = useState<string | null>(null);
  const [imageCropOpen, setImageCropOpen] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [addTarget, setAddTarget] = useState<CommentScope | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<number | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [voteVotersCommentId, setVoteVotersCommentId] = useState<number | null>(null);

  const commentsQ = useQuery({
    queryKey: ["comments", tournamentId, token ?? "none"],
    queryFn: () => listTournamentComments(tournamentId, token),
    enabled: !!tournamentId,
  });

  const pinnedTournamentCommentId = commentsQ.data?.pinned_comment_id ?? null;

  const comments: TournamentComment[] = useMemo(() => {
    const raw = commentsQ.data?.comments ?? [];
    return raw.map((c) => ({
      id: c.id,
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
    setPendingFocusId(Math.trunc(cid));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [focusCommentRequest]);

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

  const createMut = useMutation({
    mutationFn: async (payload: {
      scope: CommentScope;
      author_player_id: number | null;
      body: string;
      has_image: boolean;
      event_type?: "goal";
      goal_minute?: number;
      goal_player_name?: string;
      result_score_a?: number;
      result_score_b?: number;
    }) => {
      if (!token) throw new Error("Not logged in");
      return createTournamentComment(token, tournamentId, {
        match_id: payload.scope.kind === "match" ? payload.scope.matchId : null,
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
      await qc.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      await qc.invalidateQueries({ queryKey: ["comments", tournamentId] });
      await qc.invalidateQueries({ queryKey: ["comments", "read", tournamentId, token ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["comments", "read-map", token ?? "none"] });
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
      await qc.invalidateQueries({ queryKey: ["comments", tournamentId] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (commentId: number) => {
      if (!token) throw new Error("Not logged in");
      return apiDeleteComment(token, commentId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["comments", tournamentId] });
      await qc.invalidateQueries({ queryKey: ["comments", "read", tournamentId, token ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["comments", "read-map", token ?? "none"] });
    },
  });

  const pinMut = useMutation({
    mutationFn: async (commentId: number | null) => {
      if (!token) throw new Error("Not logged in");
      return setPinnedTournamentComment(token, tournamentId, commentId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["comments", tournamentId] });
    },
  });

  const markReadMut = useMutation({
    mutationFn: async (commentId: number) => {
      if (!token) throw new Error("Not logged in");
      return markCommentRead(token, commentId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["comments", "read", tournamentId, token ?? "none"] });
      await qc.invalidateQueries({ queryKey: ["comments", "read-map", token ?? "none"] });
    },
  });
  const voteMut = useMutation({
    mutationFn: async (payload: { commentId: number; value: -1 | 0 | 1 }) => {
      if (!token) throw new Error("Not logged in");
      return voteComment(token, payload.commentId, payload.value);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["comments", tournamentId] });
    },
  });

  const actionError: unknown =
    createMut.error ?? patchMut.error ?? deleteMut.error ?? pinMut.error ?? markReadMut.error ?? voteMut.error;

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

  const grouped = useMemo(() => {
    const tournament = comments
      .filter((c) => c.scope.kind === "tournament")
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);

    const byMatch = new Map<number, TournamentComment[]>();
    for (const c of comments) {
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
    const matchesOrdered = matches.slice().sort((a, b) => a.order_index - b.order_index);
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

    return { tournament, blocks };
  }, [comments, matches]);

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
      : !!draftBody.trim() || !!draftImageBlob;

  function startAdd(scope: CommentScope) {
    setEditingId(null);
    setDraftAuthor(currentPlayerId ?? "general");
    setDraftMode("comment");
    setGoalSide(null);
    setGoalMinute("");
    setGoalPlayerName("");
    setDraftBody("");
    setDraftImageBlob(null);
    setDraftImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setAddTarget((cur) => {
      const same = sameScope(cur, scope);
      return same ? null : scope;
    });
  }

  function setDraftImage(blob: Blob | null) {
    setDraftImageBlob(blob);
    setDraftImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
  }

  function handleDraftModeChange(nextMode: "comment" | "goal") {
    setDraftMode(nextMode);
    if (nextMode === "comment") {
      if (currentPlayerId != null) {
        setDraftAuthor(currentPlayerId);
      }
      setGoalSide(null);
      setGoalPlayerName("");
    }
    if (nextMode === "goal") {
      setDraftAuthor("general");
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

  const commentsContent = (
    <>
        <ErrorToastOnError error={commentsQ.error} title="Comments loading failed" />
        <ErrorToastOnError error={actionError} title="Comment action failed" />
        {commentsQ.isLoading ? (
          <div className="panel-subtle px-3 py-2 text-sm text-text-muted">Loading comments…</div>
        ) : null}

        <div className="space-y-2">
          <div id="comments-block-tournament" className="panel-subtle p-3 scroll-mt-28 sm:scroll-mt-32">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">Tournament</div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-text-muted">{grouped.tournament.length}</div>
                {canWrite ? (
                  <ScopeActionButton
                    open={sameScope(addTarget, { kind: "tournament" })}
                    onClick={() => startAdd({ kind: "tournament" })}
                    titleClosed="Add tournament comment"
                    titleOpen="Cancel"
                  />
                ) : null}
              </div>
            </div>

            <div className="mt-3">
              <AddCommentDropdown
                open={canWrite && sameScope(addTarget, { kind: "tournament" })}
                authorOptions={addAuthorOptions}
                draftAuthor={draftAuthor}
                onChangeDraftAuthor={setDraftAuthor}
                draftMode={draftMode}
                onChangeDraftMode={handleDraftModeChange}
                allowMatchEventModes={false}
                goalTeams={[]}
                goalSide={goalSide}
                onChangeGoalSide={handleGoalSideChange}
                goalPlayers={[]}
                goalMinute={goalMinute}
                onChangeGoalMinute={setGoalMinute}
                goalPlayerName={goalPlayerName}
                onChangeGoalPlayerName={setGoalPlayerName}
                draftBody={draftBody}
                onChangeDraftBody={setDraftBody}
                canAttachImage={canAttachImage}
                imagePreviewUrl={draftImagePreviewUrl}
                onOpenImageCropper={() => setImageCropOpen(true)}
                onClearImage={() => setDraftImage(null)}
                onSubmit={() => {
                  void upsertComment({ kind: "tournament" });
                }}
                canSubmit={canSubmit}
                surfaceClassName="panel"
              />
            </div>

            <div className="mt-3 border-t border-border-card-inner/50 pt-3 space-y-2">
              {grouped.tournament.length ? (
                [pinnedTournamentComment, ...grouped.tournament.filter((c) => c.id !== pinnedTournamentComment?.id)]
                  .filter(Boolean)
                  .map((c: TournamentComment | null) => (
                  <CommentCard
                    key={c!.id}
                    c={c!}
                    isEditing={editingId === c!.id}
                    isPinned={pinnedTournamentCommentId === c!.id}
                    isUnseen={!!token && !seen.has(c!.id)}
                    onMarkSeen={() => {
                      if (!token || markReadMut.isPending) return;
                      markReadMut.mutate(c!.id);
                    }}
                    flash={flashId === c!.id}
                    surfaceClassName="panel"
                    avatarUpdatedAt={
                      c!.author.kind === "player" ? avatarUpdatedAtByPlayerId.get(c!.author.playerId) ?? null : null
                    }
                    onOpenImage={(src) => setLightboxSrc(src)}
                    canPin={
                      c!.scope.kind === "tournament" &&
                      canWrite &&
                      (pinnedTournamentCommentId == null || pinnedTournamentCommentId === c!.id)
                    }
                    onTogglePin={
                      c!.scope.kind === "tournament" &&
                      canWrite &&
                      (pinnedTournamentCommentId == null || pinnedTournamentCommentId === c!.id)
                        ? () => {
                            const next = pinnedTournamentCommentId === c!.id ? null : c!.id;
                            void pinMut.mutateAsync(next);
                          }
                        : null
                    }
                    canWrite={canWrite}
                    canDelete={canDelete}
                    players={players}
                    currentPlayerId={currentPlayerId}
                    currentPlayerName={currentPlayerName}
                    authorLabel={authorLabel}
                    onToggleEdit={() => toggleEdit(c!)}
                    onDelete={() => {
                      void deleteComment(c!.id);
                    }}
                    onVote={(value) => {
                      if (!token || voteMut.isPending) return;
                      voteMut.mutate({ commentId: c!.id, value });
                    }}
                    onOpenVoters={() => setVoteVotersCommentId(c!.id)}
                    draftAuthor={draftAuthor}
                    onChangeDraftAuthor={setDraftAuthor}
                    draftBody={draftBody}
                    onChangeDraftBody={setDraftBody}
                    onSave={() => {
                      void upsertComment(c!.scope);
                    }}
                    canSubmit={canSubmit && (editingId !== c!.id || editingDirty)}
                  />
                ))
              ) : (
                <div className="text-sm text-text-muted">No tournament comments yet.</div>
              )}
            </div>
          </div>

          {grouped.blocks.map((b) => {
            const h = matchHeaderMeta(b.matchId);
            const addOpenForMatch = canWrite && sameScope(addTarget, { kind: "match", matchId: b.matchId });
            return (
              <div
                key={b.matchId}
                id={`comments-block-match-${b.matchId}`}
                className="card-inner-flat scroll-mt-28 sm:scroll-mt-32"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold">{h?.title ?? `Match #${b.matchId}`}</div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-text-muted">{b.comments.length}</div>
                    {canWrite ? (
                      <ScopeActionButton
                        open={addOpenForMatch}
                        onClick={() => startAdd({ kind: "match", matchId: b.matchId })}
                        titleClosed="Add match comment"
                        titleOpen="Cancel"
                      />
                    ) : null}
                  </div>
                </div>

                {h ? (
                  <div className="mt-2 space-y-1">
                    {/* Row 3: players + result */}
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                      <div className="min-w-0 truncate text-sm text-text-normal">{h.aPlayers}</div>
                      <div className="card-chip justify-self-center flex items-center justify-center gap-2">
                        {h.aGoals == null || h.bGoals == null ? (
                          <span className="text-sm font-semibold tabular-nums text-text-muted">—</span>
                        ) : (
                          <>
                            <span className="text-sm font-semibold tabular-nums">{h.aGoals}</span>
                            <span className="text-text-muted">:</span>
                            <span className="text-sm font-semibold tabular-nums">{h.bGoals}</span>
                          </>
                        )}
                      </div>
                      <div className="min-w-0 truncate text-sm text-right text-text-normal">{h.bPlayers}</div>
                    </div>

                    {/* Row 4: clubs */}
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-xs text-text-muted">
                      <div className="min-w-0 whitespace-normal break-words leading-tight">
                        {h.aClub.present ? h.aClub.name : "—"}
                      </div>
                      <div />
                      <div className="min-w-0 text-right whitespace-normal break-words leading-tight">
                        {h.bClub.present ? h.bClub.name : "—"}
                      </div>
                    </div>

                    {/* Row 5: stars */}
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-[11px] text-text-muted">
                      <div className="min-w-0">
                        {h.aClub.present ? (
                          <StarsFA rating={h.aClub.rating ?? 0} textClassName="text-text-muted" />
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </div>
                      <div />
                      <div className="min-w-0 flex justify-end">
                        {h.bClub.present ? (
                          <StarsFA rating={h.bClub.rating ?? 0} textClassName="text-text-muted" />
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-3">
                  <AddCommentDropdown
                    open={addOpenForMatch}
                    authorOptions={addAuthorOptions}
                    draftAuthor={draftAuthor}
                    onChangeDraftAuthor={setDraftAuthor}
                    draftMode={draftMode}
                    onChangeDraftMode={handleDraftModeChange}
                    allowMatchEventModes={true}
                    goalTeams={goalTeamsForScope({ kind: "match", matchId: b.matchId })}
                    goalSide={goalSide}
                    onChangeGoalSide={handleGoalSideChange}
                    goalPlayers={goalPlayersForScope({ kind: "match", matchId: b.matchId }, goalSide)}
                    goalMinute={goalMinute}
                    onChangeGoalMinute={setGoalMinute}
                    goalPlayerName={goalPlayerName}
                    onChangeGoalPlayerName={setGoalPlayerName}
                    draftBody={draftBody}
                    onChangeDraftBody={setDraftBody}
                    canAttachImage={canAttachImage}
                    imagePreviewUrl={draftImagePreviewUrl}
                    onOpenImageCropper={() => setImageCropOpen(true)}
                    onClearImage={() => setDraftImage(null)}
                    onSubmit={() => {
                      void upsertComment({ kind: "match", matchId: b.matchId });
                    }}
                    canSubmit={canSubmit}
                    surfaceClassName="panel-subtle"
                  />
                </div>

                <div className="mt-3 border-t border-border-card-inner/50 pt-3 space-y-2">
                  {b.comments.length ? (
                    b.comments.map((c) => (
                      <CommentCard
                        key={c.id}
                        c={c}
                        isEditing={editingId === c.id}
                        isPinned={false}
                        isUnseen={!!token && !seen.has(c.id)}
                        onMarkSeen={() => {
                          if (!token || markReadMut.isPending) return;
                          markReadMut.mutate(c.id);
                        }}
                          flash={flashId === c.id}
                          surfaceClassName="panel-subtle"
                          avatarUpdatedAt={
                            c.author.kind === "player" ? avatarUpdatedAtByPlayerId.get(c.author.playerId) ?? null : null
                          }
                          onOpenImage={(src) => setLightboxSrc(src)}
                          canPin={false}
                        onTogglePin={null}
                        canWrite={canWrite}
                        canDelete={canDelete}
                        players={players}
                        currentPlayerId={currentPlayerId}
                        currentPlayerName={currentPlayerName}
                        authorLabel={authorLabel}
                        onToggleEdit={() => toggleEdit(c)}
                        onDelete={() => {
                          void deleteComment(c.id);
                        }}
                        onVote={(value) => {
                          if (!token || voteMut.isPending) return;
                          voteMut.mutate({ commentId: c.id, value });
                        }}
                        onOpenVoters={() => setVoteVotersCommentId(c.id)}
                        draftAuthor={draftAuthor}
                        onChangeDraftAuthor={setDraftAuthor}
                        draftBody={draftBody}
                        onChangeDraftBody={setDraftBody}
                        onSave={() => {
                          void upsertComment(c.scope);
                        }}
                        canSubmit={canSubmit && (editingId !== c.id || editingDirty)}
                      />
                    ))
                  ) : (
                    <div className="text-sm text-text-muted">No comments yet.</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
    </>
  );

  return (
    <>
    {collapsible ? (
      <CollapsibleCard title="Comments" defaultOpen={true} variant="outer" bodyVariant="none" bodyClassName="space-y-3">
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
