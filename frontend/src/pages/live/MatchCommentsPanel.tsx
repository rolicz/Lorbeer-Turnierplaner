import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import Button from "../../ui/primitives/Button";
import Textarea from "../../ui/primitives/Textarea";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { showErrorToast } from "../../ui/primitives/ErrorToast";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import CommentImageCropper from "../../ui/primitives/CommentImageCropper";
import ImageLightbox from "../../ui/primitives/ImageLightbox";
import VoteButton from "../../ui/primitives/VoteButton";
import VoteVotersModal from "../../ui/primitives/VoteVotersModal";
import type { Player } from "../../api/types";
import CommentCreateComposer, { type CommentGoalSide, type CommentGoalTeamOption } from "./CommentCreateComposer";
import {
  commentImageUrl,
  createTournamentComment,
  deleteComment as apiDeleteComment,
  listCommentVoters,
  listTournamentComments,
  markCommentRead,
  patchComment as apiPatchComment,
  putCommentImage,
  voteComment,
} from "../../api/comments.api";
import { useAuth } from "../../auth/AuthContext";
import { useSeenSet } from "../../hooks/useSeenComments";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { fmtTs } from "../../utils/format";

export default function MatchCommentsPanel({
  tournamentId,
  matchId,
  canWrite,
  canDelete,
  playersInMatch,
  teamALabel,
  teamAPlayers,
  teamBLabel,
  teamBPlayers,
  currentScoreA = 0,
  currentScoreB = 0,
}: {
  tournamentId: number;
  matchId: number;
  canWrite: boolean;
  canDelete: boolean;
  playersInMatch: Player[];
  teamALabel: string;
  teamAPlayers: Player[];
  teamBLabel: string;
  teamBPlayers: Player[];
  currentScoreA?: number;
  currentScoreB?: number;
}) {
  const qc = useQueryClient();
  const { token, role, actorPlayerId: currentPlayerId, actorPlayerName: currentPlayerName } = useAuth();
  const canAttachImage = role === "admin" || role === "editor";
  const seen = useSeenSet(tournamentId);

  const [postAsGeneral, setPostAsGeneral] = useState(false);
  const [composerMode, setComposerMode] = useState<"comment" | "goal">("comment");
  const [goalSide, setGoalSide] = useState<CommentGoalSide | null>(null);
  const [goalMinute, setGoalMinute] = useState("");
  const [goalPlayerName, setGoalPlayerName] = useState("");
  const [text, setText] = useState("");
  const [draftImageBlob, setDraftImageBlob] = useState<Blob | null>(null);
  const [draftImagePreviewUrl, setDraftImagePreviewUrl] = useState<string | null>(null);
  const [imageCropOpen, setImageCropOpen] = useState(false);
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [voteVotersCommentId, setVoteVotersCommentId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAuthor, setEditAuthor] = useState<"general" | number>(currentPlayerId ?? "general");
  const [editBody, setEditBody] = useState("");

  const idsOk =
    typeof tournamentId === "number" &&
    Number.isFinite(tournamentId) &&
    tournamentId > 0 &&
    typeof matchId === "number" &&
    Number.isFinite(matchId) &&
    matchId > 0;

  const commentsQ = useQuery({
    queryKey: ["comments", tournamentId, token ?? "none"],
    queryFn: () => listTournamentComments(tournamentId, token),
    enabled: Number.isFinite(tournamentId) && tournamentId > 0,
  });

  const { avatarUpdatedAtById: avatarUpdatedAtByPlayerId } = usePlayerAvatarMap();

  function setDraftImage(blob: Blob | null) {
    setDraftImageBlob(blob);
    setDraftImagePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
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

  useEffect(() => {
    return () => {
      if (draftImagePreviewUrl) URL.revokeObjectURL(draftImagePreviewUrl);
    };
  }, [draftImagePreviewUrl]);

  const matchComments = useMemo(() => {
    const raw = commentsQ.data?.comments ?? [];
    return raw
      .filter((c) => c.match_id === matchId)
      .slice()
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);
  }, [commentsQ.data, matchId]);

  const byId = useMemo(() => new Map(playersInMatch.map((p) => [p.id, p.display_name])), [playersInMatch]);
  const goalTeams = useMemo<CommentGoalTeamOption[]>(
    () => [
      {
        side: "A",
        label: teamALabel,
        nextScoreline: `${currentScoreA + 1}-${currentScoreB}`,
      },
      {
        side: "B",
        label: teamBLabel,
        nextScoreline: `${currentScoreA}-${currentScoreB + 1}`,
      },
    ],
    [currentScoreA, currentScoreB, teamALabel, teamBLabel],
  );
  const goalPlayers = useMemo(() => {
    const players = goalSide === "A" ? teamAPlayers : goalSide === "B" ? teamBPlayers : [];
    return players.map((player) => ({ label: player.display_name }));
  }, [goalSide, teamAPlayers, teamBPlayers]);
  const authorOptions = useMemo(() => {
    const options: { value: "general" | number; label: string }[] = [];
    if (currentPlayerId != null) {
      options.push({ value: currentPlayerId, label: currentPlayerName || "Me" });
    }
    options.push({ value: "general", label: "General" });
    return options;
  }, [currentPlayerId, currentPlayerName]);
  const authorLabel = (authorPlayerId: number | null) =>
    authorPlayerId == null ? "General" : byId.get(authorPlayerId) ?? `#${authorPlayerId}`;
  const editingOriginal = useMemo(() => {
    if (editingId == null) return null;
    return matchComments.find((c) => c.id === editingId) ?? null;
  }, [editingId, matchComments]);
  const editingDirty = useMemo(() => {
    if (!editingOriginal) return false;
    const originalAuthor = editingOriginal.author_player_id == null ? "general" : editingOriginal.author_player_id;
    const originalBody = (editingOriginal.body ?? "").trim();
    return originalAuthor !== editAuthor || originalBody !== editBody.trim();
  }, [editAuthor, editBody, editingOriginal]);

  const createMut = useMutation({
    mutationFn: async (payload: {
      authorPlayerId: number | null;
      body: string;
      hasImage: boolean;
      eventType?: "goal";
      goalMinute?: number;
      goalPlayerName?: string;
      resultScoreA?: number;
      resultScoreB?: number;
    }) => {
      if (!Number.isFinite(tournamentId) || tournamentId <= 0) throw new Error("Missing tournament id");
      if (!Number.isFinite(matchId) || matchId <= 0) throw new Error("Missing match id");
      if (!token) throw new Error("Not logged in");
      if (payload.authorPlayerId !== null && (!Number.isFinite(payload.authorPlayerId) || payload.authorPlayerId <= 0)) {
        throw new Error("Missing player identity");
      }
      const created = await createTournamentComment(token, tournamentId, {
        match_id: matchId,
        author_player_id: payload.authorPlayerId,
        body: payload.body,
        has_image: payload.hasImage,
        event_type: payload.eventType,
        goal_minute: payload.goalMinute,
        goal_player_name: payload.goalPlayerName,
        result_score_a: payload.resultScoreA,
        result_score_b: payload.resultScoreB,
      });
      if (payload.eventType == null && draftImageBlob) {
        try {
          await putCommentImage(token, created.id, draftImageBlob, "comment.webp");
        } catch (e: unknown) {
          showErrorToast(e instanceof Error ? e.message : "Image upload failed", "Comment image upload failed");
        }
      }
      return created;
    },
    onSuccess: async (created) => {
      setPendingScrollId(created.id);
      setComposerMode("comment");
      setGoalSide(null);
      setGoalMinute("");
      setGoalPlayerName("");
      setText("");
      setDraftImage(null);
      setPostAsGeneral(false);
      setImageCropOpen(false);
      setComposerOpen(false);
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

  function resetEditState() {
    setEditingId(null);
    setEditAuthor(currentPlayerId ?? "general");
    setEditBody("");
  }

  function startEdit(commentId: number) {
    const row = matchComments.find((c) => c.id === commentId);
    if (!row) return;
    setEditingId(commentId);
    setEditAuthor(row.author_player_id == null ? "general" : row.author_player_id);
    setEditBody(row.body ?? "");
  }

  function toggleEdit(commentId: number) {
    if (editingId === commentId) {
      resetEditState();
      return;
    }
    startEdit(commentId);
  }

  async function saveEdit(commentId: number) {
    if (!editingOriginal || editingId !== commentId) return;
    if (!editingDirty) return;
    const nextBody = editBody.trim();
    if (!nextBody && !editingOriginal.has_image) return;
    const nextAuthor = editAuthor === "general" ? null : editAuthor;
    const originalAuthor = editingOriginal.author_player_id ?? null;
    const payload: { commentId: number; author_player_id?: number | null; body: string } = {
      commentId,
      body: nextBody,
    };
    if (originalAuthor !== nextAuthor) payload.author_player_id = nextAuthor;
    try {
      await patchMut.mutateAsync(payload);
      setPendingScrollId(commentId);
      resetEditState();
    } catch {
      // handled by patchMut.error
    }
  }

  async function deleteComment(commentId: number) {
    if (!window.confirm("Delete comment?")) return;
    try {
      await deleteMut.mutateAsync(commentId);
      if (editingId === commentId) resetEditState();
    } catch {
      // handled by deleteMut.error
    }
  }

  function handleComposerModeChange(nextMode: "comment" | "goal") {
    setComposerMode(nextMode);
    if (nextMode === "comment") {
      if (currentPlayerId != null) {
        setPostAsGeneral(false);
      }
      setGoalSide(null);
      setGoalPlayerName("");
    }
    if (nextMode === "goal") {
      setPostAsGeneral(true);
    }
    if (nextMode !== "comment") {
      setDraftImage(null);
    }
  }

  function handleGoalSideChange(nextSide: CommentGoalSide) {
    setGoalSide(nextSide);
    setGoalPlayerName("");
  }

  function goalScoreForSide(side: CommentGoalSide | null): { a: number; b: number } | null {
    if (side === "A") return { a: currentScoreA + 1, b: currentScoreB };
    if (side === "B") return { a: currentScoreA, b: currentScoreB + 1 };
    return null;
  }

  useEffect(() => {
    if (!pendingScrollId) return;
    const section = document.getElementById(`current-match-comments-${matchId}`);
    const el = document.getElementById(`match-comment-${pendingScrollId}`);
    if (!section || !el) return;

    // Defer until layout stabilizes (composer collapsing + query refresh).
    requestAnimationFrame(() => {
      // Scroll so the new comment ends up at the bottom of the viewport (nice for quickly reading it).
      requestAnimationFrame(() => {
        const bottomPad = 10;
        const r = el.getBoundingClientRect();
        const yBottom = window.scrollY + r.bottom - (window.innerHeight - bottomPad);
        window.scrollTo({ top: Math.max(0, yBottom), behavior: "smooth" });

        setFlashId(null);
        requestAnimationFrame(() => setFlashId(pendingScrollId));
        window.setTimeout(() => setFlashId(null), 1800);
        setPendingScrollId(null);
      });
    });
  }, [matchId, pendingScrollId, commentsQ.dataUpdatedAt]);

  return (
    <>
    <div id={`current-match-comments-${matchId}`}>
      <CollapsibleCard
        title="Match comments"
        defaultOpen={false}
        className="panel-subtle"
        variant="none"
        bodyClassName="space-y-2"
        right={
          matchComments.length ? (
            <span className="text-xs text-text-muted">{matchComments.length}</span>
          ) : null
        }
      >
        <div className="space-y-2">
        <ErrorToastOnError error={commentsQ.error} title="Comments loading failed" />
        <ErrorToastOnError error={createMut.error} title="Could not post comment" />
        <ErrorToastOnError error={patchMut.error} title="Could not save comment" />
        <ErrorToastOnError error={deleteMut.error} title="Could not delete comment" />
        {commentsQ.isLoading ? (
          <div className="text-sm text-text-muted">Loading…</div>
        ) : matchComments.length === 0 ? (
          <div className="text-sm text-text-muted">No comments yet.</div>
        ) : (
          <div className="space-y-2">
	            {matchComments.map((c) => {
                const myVote = c.my_vote ?? 0;
                const upvotes = Number(c.upvotes ?? 0);
                const downvotes = Number(c.downvotes ?? 0);
                return (
	              <div
	                key={c.id}
	                id={`match-comment-${c.id}`}
	                className={
	                  "panel-subtle p-3 scroll-mt-28 sm:scroll-mt-32 " + (flashId === c.id ? "comment-attn" : "")
	                }
                  style={
                    editingId === c.id
                      ? {
                          borderColor: "rgb(var(--color-accent))",
                          boxShadow: "0 0 0 2px rgb(var(--color-accent) / 0.20)",
                        }
                      : undefined
                  }
	              >
	                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
	                  {c.author_player_id != null ? (
                      <AvatarCircle
                        playerId={c.author_player_id}
                        name={authorLabel(c.author_player_id)}
                        updatedAt={avatarUpdatedAtByPlayerId.get(c.author_player_id) ?? null}
                        sizeClass="h-7 w-7"
                        fallbackClassName="text-[12px] font-semibold text-text-muted"
                      />
	                  ) : null}
	                  <div className="text-xs font-semibold text-text-normal truncate">{authorLabel(c.author_player_id)}</div>
                      {editingId === c.id ? <span className="card-chip text-[10px] py-1 px-2">editing</span> : null}
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {!!token && !seen.has(c.id) ? (
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (markReadMut.isPending) return;
                            markReadMut.mutate(c.id);
                          }}
                          title="Mark as read"
                          className="h-8 w-8 p-0 inline-flex items-center justify-center"
                        >
                          <i className="fa-solid fa-envelope text-accent motion-safe:animate-pulse" aria-hidden="true" />
                        </Button>
                      ) : null}
                      {canWrite ? (
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleEdit(c.id);
                          }}
                          title={editingId === c.id ? "Cancel edit" : "Edit comment"}
                          className="h-8 w-8 p-0 inline-flex items-center justify-center md:w-auto md:px-3 md:py-1.5"
                        >
                          <i className={`fa-solid ${editingId === c.id ? "fa-chevron-up" : "fa-pen"} md:hidden`} aria-hidden="true" />
                          <span className="hidden md:inline">{editingId === c.id ? "Close" : "Edit"}</span>
                        </Button>
                      ) : null}
                      {canDelete ? (
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void deleteComment(c.id);
                          }}
                          title="Delete comment"
                          className="h-8 w-8 p-0 inline-flex items-center justify-center md:w-auto md:px-3 md:py-1.5"
                        >
                          <i className="fa-solid fa-trash md:hidden" aria-hidden="true" />
                          <span className="hidden md:inline">Delete</span>
                        </Button>
                      ) : null}
                    </div>
	                </div>
	                <div className="mt-0.5 text-[11px] text-text-muted">
	                  {fmtTs(Date.parse(c.created_at))}
	                  {Date.parse(c.updated_at) > Date.parse(c.created_at) ? (
	                    <span className="ml-2">edited</span>
                  ) : null}
                </div>
                {editingId === c.id ? (
                  <div className="mt-2 space-y-2">
                    <label className="block">
                      <div className="input-label">Posted as</div>
                      <select
                        className="select-field"
                        value={editAuthor === "general" ? "general" : String(editAuthor)}
                        onChange={(e) => setEditAuthor(e.target.value === "general" ? "general" : Number(e.target.value))}
                        disabled={patchMut.isPending}
                      >
                        {currentPlayerId != null ? <option value={String(currentPlayerId)}>{currentPlayerName || "Me"}</option> : null}
                        <option value="general">General</option>
                        {editAuthor !== "general" && currentPlayerId != null && editAuthor !== currentPlayerId ? (
                          <option value={String(editAuthor)}>
                            {(byId.get(editAuthor) ?? `Player #${editAuthor}`) + " (original)"}
                          </option>
                        ) : null}
                      </select>
                    </label>

                    <Textarea
                      label="Edit"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      className="min-h-[88px]"
                      disabled={patchMut.isPending}
                    />

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        onClick={() => void saveEdit(c.id)}
                        disabled={!editingDirty || patchMut.isPending || (!editBody.trim() && !c.has_image)}
                        title="Save"
                        className="h-10 w-10 p-0 inline-flex items-center justify-center md:w-auto md:px-4 md:py-2"
                      >
                        <i className="fa-solid fa-floppy-disk md:hidden" aria-hidden="true" />
                        <span className="hidden md:inline">Save</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-2 space-y-2">
                      {c.body ? <div className="whitespace-pre-wrap text-sm">{c.body}</div> : null}
                      {c.has_image ? (
                        <div className="panel-subtle p-2">
                          <button
                            type="button"
                            className="block w-full"
                            onClick={() => setLightboxSrc(commentImageUrl(c.id, c.image_updated_at ?? null))}
                            title="Open image"
                          >
                            <img
                              src={commentImageUrl(c.id, c.image_updated_at ?? null)}
                              alt=""
                              className="w-full rounded-lg object-cover aspect-[4/3] cursor-zoom-in"
                              loading="lazy"
                              decoding="async"
                            />
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-text-muted">
                      <VoteButton
                        direction="up"
                        active={myVote === 1}
                        count={upvotes}
                        onVote={() => {
                          if (!token || voteMut.isPending) return;
                          const next: -1 | 0 | 1 = myVote === 1 ? 0 : 1;
                          voteMut.mutate({ commentId: c.id, value: next });
                        }}
                        voteDisabled={!token || voteMut.isPending}
                        title="Upvote"
                      />
                      <VoteButton
                        direction="down"
                        active={myVote === -1}
                        count={downvotes}
                        onVote={() => {
                          if (!token || voteMut.isPending) return;
                          const next: -1 | 0 | 1 = myVote === -1 ? 0 : -1;
                          voteMut.mutate({ commentId: c.id, value: next });
                        }}
                        voteDisabled={!token || voteMut.isPending}
                        title="Downvote"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setVoteVotersCommentId(c.id);
                        }}
                        title="Show voters"
                        className="h-8 w-8 p-0 inline-flex items-center justify-center"
                      >
                        <i className="fa-solid fa-users text-text-muted" aria-hidden="true" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            );
            })}
          </div>
        )}

        {canWrite ? (
          <div className="space-y-2">
            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setComposerOpen((v) => {
                    const next = !v;
                    if (!next) {
                      // Treat "collapse" as cancel.
                      setComposerMode("comment");
                      setGoalSide(null);
                      setGoalMinute("");
                      setGoalPlayerName("");
                      setText("");
                      setDraftImage(null);
                      setImageCropOpen(false);
                      setPostAsGeneral(false);
                    }
                    return next;
                  });
                }}
                title={composerOpen ? "Collapse" : "Add comment"}
                className="h-10 px-3 inline-flex items-center justify-center gap-2"
              >
                {composerOpen ? (
                  <i className="fa-solid fa-chevron-up text-sm md:hidden" aria-hidden="true" />
                ) : (
                  <i className="fa-solid fa-plus text-sm md:hidden" aria-hidden="true" />
                )}
                <span className="hidden md:inline">{composerOpen ? "Collapse" : "Add comment"}</span>
              </Button>
            </div>

            {composerOpen ? (
              <CommentCreateComposer
                authorOptions={authorOptions}
                authorValue={postAsGeneral ? "general" : currentPlayerId ?? "general"}
                onAuthorChange={(value) => setPostAsGeneral(value === "general")}
                mode={composerMode}
                onModeChange={handleComposerModeChange}
                allowMatchEventModes={true}
                goalTeams={goalTeams}
                goalSide={goalSide}
                onGoalSideChange={handleGoalSideChange}
                goalPlayers={goalPlayers}
                goalMinute={goalMinute}
                onGoalMinuteChange={setGoalMinute}
                goalPlayerName={goalPlayerName}
                onGoalPlayerNameChange={setGoalPlayerName}
                draftBody={text}
                onChangeDraftBody={setText}
                canAttachImage={canAttachImage}
                imagePreviewUrl={draftImagePreviewUrl}
                onOpenImageCropper={() => setImageCropOpen(true)}
                onClearImage={() => setDraftImage(null)}
                onSubmit={() =>
                  void createMut.mutateAsync(
                    composerMode === "goal"
                      ? {
                          authorPlayerId: postAsGeneral ? null : currentPlayerId ?? null,
                          body: text.trim(),
                          hasImage: false,
                          eventType: "goal",
                          goalMinute: normalizeGoalMinute(goalMinute) ?? undefined,
                          goalPlayerName: goalPlayerName.trim(),
                          resultScoreA: goalScoreForSide(goalSide)?.a,
                          resultScoreB: goalScoreForSide(goalSide)?.b,
                        }
                      : {
                          authorPlayerId: postAsGeneral ? null : currentPlayerId ?? null,
                          body: text.trim(),
                          hasImage: !!draftImageBlob,
                        },
                  )
                }
                canSubmit={
                  idsOk &&
                  (composerMode === "goal"
                    ? !!goalPlayerName.trim() &&
                      goalSide != null &&
                      normalizeGoalMinute(goalMinute) != null &&
                      goalScoreForSide(goalSide) != null
                    : !!text.trim() || !!draftImageBlob)
                }
                disabled={createMut.isPending}
                surfaceClassName="panel-subtle"
              />
            ) : null}
          </div>
        ) : null}
      </div>
      </CollapsibleCard>
    </div>
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
