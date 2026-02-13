import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import Button from "../../ui/primitives/Button";
import Textarea from "../../ui/primitives/Textarea";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import type { Club, Match, Player } from "../../api/types";
import { clubLabelPartsById } from "../../ui/clubControls";
import { StarsFA } from "../../ui/primitives/StarsFA";
import {
  createTournamentComment,
  deleteComment as apiDeleteComment,
  listTournamentComments,
  patchComment as apiPatchComment,
  setPinnedTournamentComment,
} from "../../api/comments.api";
import { useAuth } from "../../auth/AuthContext";
import { listPlayerAvatarMeta, playerAvatarUrl } from "../../api/playerAvatars.api";
import { useSeenSet } from "../../hooks/useSeenComments";
import { markCommentSeen } from "../../seenComments";

type CommentScope =
  | { kind: "tournament" }
  | { kind: "match"; matchId: number };

type CommentAuthor =
  | { kind: "general" }
  | { kind: "player"; playerId: number };

type TournamentComment = {
  id: number;
  createdAt: number;
  updatedAt: number;
  scope: CommentScope;
  author: CommentAuthor;
  body: string;
};

function sameScope(a: CommentScope | null | undefined, b: CommentScope) {
  if (!a) return false;
  if (a.kind !== b.kind) return false;
  if (b.kind === "tournament") return true;
  return (a as any).matchId === (b as any).matchId;
}

function fmtTs(ms: number) {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ScopeActionButton({
  open,
  onClick,
  titleOpen,
  titleClosed,
}: {
  open: boolean;
  onClick: () => void;
  titleOpen: string;
  titleClosed: string;
}) {
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={onClick}
      title={open ? titleOpen : titleClosed}
      className="h-9 w-9 p-0 inline-flex items-center justify-center"
    >
      <i className={`fa-solid ${open ? "fa-chevron-up" : "fa-plus"}`} aria-hidden="true" />
    </Button>
  );
}

function AddCommentDropdown({
  open,
  players,
  draftAuthor,
  onChangeDraftAuthor,
  draftBody,
  onChangeDraftBody,
  onSubmit,
  canSubmit,
  surfaceClassName = "panel-subtle",
}: {
  open: boolean;
  players: Player[];
  draftAuthor: "general" | number;
  onChangeDraftAuthor: (v: "general" | number) => void;
  draftBody: string;
  onChangeDraftBody: (v: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  surfaceClassName?: string;
}) {
  if (!open) return null;
  return (
    <div className={surfaceClassName + " p-3 space-y-2"}>
      <div className="grid gap-2">
        <label className="block">
          <div className="input-label">Posted as</div>
          <select
            className="select-field"
            value={draftAuthor === "general" ? "general" : String(draftAuthor)}
            onChange={(e) => onChangeDraftAuthor(e.target.value === "general" ? "general" : Number(e.target.value))}
          >
            <option value="general">General</option>
            {players.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Textarea
        label="Comment"
        placeholder="Write a comment…"
        value={draftBody}
        onChange={(e) => onChangeDraftBody(e.target.value)}
      />

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          title="Post comment"
          className="h-10 w-10 p-0 inline-flex items-center justify-center md:w-auto md:px-4 md:py-2"
        >
          <i className="fa-solid fa-paper-plane md:hidden" aria-hidden="true" />
          <span className="hidden md:inline">Post</span>
        </Button>
      </div>
    </div>
  );
}

function CommentCard({
  c,
  isEditing,
  isPinned,
  isUnseen,
  onMarkSeen,
  canPin,
  onTogglePin,
  canWrite,
  canDelete,
  players,
  authorLabel,
  onToggleEdit,
  onDelete,
  draftAuthor,
  onChangeDraftAuthor,
  draftBody,
  onChangeDraftBody,
  onSave,
  canSubmit,
  flash,
  surfaceClassName = "panel-subtle",
  avatarUpdatedAt,
}: {
  c: TournamentComment;
  isEditing: boolean;
  isPinned: boolean;
  isUnseen: boolean;
  onMarkSeen: () => void;
  canPin: boolean;
  onTogglePin: (() => void) | null;
  canWrite: boolean;
  canDelete: boolean;
  players: Player[];
  authorLabel: (a: CommentAuthor) => string;
  onToggleEdit: () => void;
  onDelete: () => void;
  draftAuthor: "general" | number;
  onChangeDraftAuthor: (v: "general" | number) => void;
  draftBody: string;
  onChangeDraftBody: (v: string) => void;
  onSave: () => void;
  canSubmit: boolean;
  flash: boolean;
  surfaceClassName?: string;
  avatarUpdatedAt?: string | null;
}) {
  const edited = c.updatedAt > c.createdAt;

  return (
    <div
      id={`comment-${c.id}`}
      className={
        surfaceClassName +
        " p-3 scroll-mt-28 sm:scroll-mt-32 " +
        (flash ? "comment-attn" : "")
      }
      style={
        isEditing || isPinned
          ? {
              borderColor: "rgb(var(--color-accent))",
              boxShadow: "0 0 0 2px rgb(var(--color-accent) / 0.20)",
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* Row 1: poster */}
          <div className="flex flex-wrap items-center gap-2">
            {c.author.kind === "player" ? (
              <span className="panel-subtle inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full shrink-0">
                {avatarUpdatedAt ? (
                  <img
                    src={playerAvatarUrl(c.author.playerId, avatarUpdatedAt)}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="text-[12px] font-semibold text-text-muted">
                    {(authorLabel(c.author) || "?").trim().slice(0, 1).toUpperCase()}
                  </span>
                )}
              </span>
            ) : null}
            <div className="text-xs font-semibold text-text-normal">{authorLabel(c.author)}</div>
            {isPinned ? <span className="card-chip text-[10px] py-1 px-2">pinned</span> : null}
            {isEditing ? <span className="card-chip text-[10px] py-1 px-2">editing</span> : null}
          </div>
          {/* Row 2: timestamp (+ edited) */}
          <div className="mt-0.5 text-[11px] text-text-muted">
            {fmtTs(c.createdAt)}
            {edited ? ` · edited ${fmtTs(c.updatedAt)}` : ""}
          </div>
        </div>

        {canWrite || isUnseen ? (
          <div className="shrink-0 flex items-center gap-2">
            {isUnseen ? (
              <Button
                variant="ghost"
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onMarkSeen();
                }}
                title="Mark as read"
                className="h-9 w-9 p-0 inline-flex items-center justify-center"
              >
                <i className="fa-solid fa-envelope text-accent motion-safe:animate-pulse" aria-hidden="true" />
              </Button>
            ) : null}
            {canPin && onTogglePin ? (
              <Button
                variant="ghost"
                type="button"
                onClick={onTogglePin}
                title={isPinned ? "Unpin" : "Pin"}
                className="h-9 w-9 p-0 inline-flex items-center justify-center"
              >
                <i
                  className={`fa-solid ${isPinned ? "fa-thumbtack-slash" : "fa-thumbtack"}`}
                  aria-hidden="true"
                />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              type="button"
              onClick={onToggleEdit}
              title={isEditing ? "Cancel edit" : "Edit comment"}
              className="h-9 w-9 p-0 inline-flex items-center justify-center md:w-auto md:px-3 md:py-1.5"
            >
              <i className={`fa-solid ${isEditing ? "fa-chevron-up" : "fa-pen"} md:hidden`} aria-hidden="true" />
              <span className="hidden md:inline">{isEditing ? "Close" : "Edit"}</span>
            </Button>
            {canDelete ? (
              <Button
                variant="ghost"
                type="button"
                onClick={onDelete}
                title="Delete comment"
                className="h-9 w-9 p-0 inline-flex items-center justify-center md:w-auto md:px-3 md:py-1.5"
              >
                <i className="fa-solid fa-trash md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">Delete</span>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {isEditing ? (
        <div className="mt-2 space-y-2">
          <label className="block">
            <div className="input-label">Posted as</div>
            <select
              className="select-field"
              value={draftAuthor === "general" ? "general" : String(draftAuthor)}
              onChange={(e) => onChangeDraftAuthor(e.target.value === "general" ? "general" : Number(e.target.value))}
            >
              <option value="general">General</option>
              {players.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.display_name}
                </option>
              ))}
            </select>
          </label>

          <Textarea
            label="Edit"
            value={draftBody}
            onChange={(e) => onChangeDraftBody(e.target.value)}
            className="min-h-[88px]"
          />

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              onClick={onSave}
              disabled={!canSubmit}
              title="Save"
              className="h-10 w-10 p-0 inline-flex items-center justify-center md:w-auto md:px-4 md:py-2"
            >
              <i className="fa-solid fa-floppy-disk md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Save</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 whitespace-pre-wrap text-sm">{c.body}</div>
      )}
    </div>
  );
}

export default function TournamentCommentsCard({
  tournamentId,
  matches,
  clubs,
  players,
  canWrite,
  canDelete,
}: {
  tournamentId: number;
  matches: Match[];
  clubs: Club[];
  players: Player[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const qc = useQueryClient();
  const { token } = useAuth();
  const seen = useSeenSet(tournamentId);

  const avatarMetaQ = useQuery({ queryKey: ["players", "avatars"], queryFn: listPlayerAvatarMeta });
  const avatarUpdatedAtByPlayerId = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of avatarMetaQ.data ?? []) m.set(r.player_id, r.updated_at);
    return m;
  }, [avatarMetaQ.data]);

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
  const [draftAuthor, setDraftAuthor] = useState<"general" | number>("general");
  const [draftBody, setDraftBody] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [addTarget, setAddTarget] = useState<CommentScope | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<number | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);

  const commentsQ = useQuery({
    queryKey: ["comments", tournamentId],
    queryFn: () => listTournamentComments(tournamentId),
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
    setDraftAuthor("general");
    setDraftBody("");
    setEditingId(null);
    setAddTarget(null);
    setPendingFocusId(null);
    setFlashId(null);
  }, [tournamentId]);

  useEffect(() => {
    if (!pendingFocusId) return;

    let cancelled = false;
    let tries = 0;

    const tryScroll = () => {
      if (cancelled) return;
      const focus = comments.find((c) => c.id === pendingFocusId) ?? null;
      const scope = focus?.scope ?? null;
      const blockId =
        scope?.kind === "tournament"
          ? "comments-block-tournament"
          : scope?.kind === "match"
            ? `comments-block-match-${scope.matchId}`
            : null;
      const blockEl = blockId ? document.getElementById(blockId) : null;
      const commentEl = document.getElementById(`comment-${pendingFocusId}`);

      // Wait for query refresh to render the new/updated comment into the DOM.
      if ((!commentEl || (blockId != null && !blockEl)) && tries < 240) {
        tries += 1;
        requestAnimationFrame(tryScroll);
        return;
      }

      if (blockEl || commentEl) {
        // Primary: scroll to the beginning of the relevant block (Tournament / Match #n).
        // Fallback: scroll to the comment itself if the block id isn't found.
        const anchor = blockEl ?? commentEl!;
        anchor.scrollIntoView({ block: "start", behavior: "smooth" });

        // Ensure the focused comment is actually visible (without overriding the block alignment too much).
        if (commentEl) {
          requestAnimationFrame(() => {
            const r = commentEl.getBoundingClientRect();
            const nav = document.querySelector(".nav-shell") as HTMLElement | null;
            const navH = nav?.getBoundingClientRect().height ?? 0;
            const topLimit = navH + 6;
            const bottomLimit = window.innerHeight - 10;
            if (r.top < topLimit || r.bottom > bottomLimit) {
              commentEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }

            setFlashId(null);
            requestAnimationFrame(() => setFlashId(pendingFocusId));
            window.setTimeout(() => setFlashId(null), 1800);
          });

          // Second pass: after layout settles (edit UI collapsing, images/fonts, etc.)
          // ensure the anchor (block start) is still aligned near the top.
          window.setTimeout(() => {
            const blockEl2 = blockId ? document.getElementById(blockId) : null;
            const commentEl2 = document.getElementById(`comment-${pendingFocusId}`);
            const anchor2 = blockEl2 ?? commentEl2;
            if (!anchor2) return;

            const nav = document.querySelector(".nav-shell") as HTMLElement | null;
            const navH = nav?.getBoundingClientRect().height ?? 0;
            const rr = anchor2.getBoundingClientRect();
            if (rr.top < navH + 4 || rr.top > navH + 40) {
              anchor2.scrollIntoView({ block: "start", behavior: "smooth" });
            }
          }, 250);
        }
      }

      setPendingFocusId(null);
    };

    requestAnimationFrame(tryScroll);
    return () => {
      cancelled = true;
    };
  }, [comments, pendingFocusId]);

  function resetDraft() {
    setDraftAuthor("general");
    setDraftBody("");
    setEditingId(null);
    setAddTarget(null);
  }

  function startEdit(c: TournamentComment) {
    setEditingId(c.id);
    setDraftAuthor(c.author.kind === "player" ? c.author.playerId : "general");
    setDraftBody(c.body);
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
    mutationFn: async (payload: { scope: CommentScope; author_player_id: number | null; body: string }) => {
      if (!token) throw new Error("Not logged in");
      return createTournamentComment(token, tournamentId, {
        match_id: payload.scope.kind === "match" ? payload.scope.matchId : null,
        author_player_id: payload.author_player_id,
        body: payload.body,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["comments", tournamentId] });
    },
  });

  const patchMut = useMutation({
    mutationFn: async (payload: { commentId: number; author_player_id: number | null; body: string }) => {
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

  const actionError = (createMut.error ?? patchMut.error ?? deleteMut.error ?? pinMut.error) as any;

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
    if (!body) return;

    const author_player_id = draftAuthor === "general" ? null : draftAuthor;

    try {
      if (editingId != null) {
        if (!editingDirty) return;
        await patchMut.mutateAsync({ commentId: editingId, author_player_id, body });
        setPendingFocusId(editingId);
      } else {
        const created = await createMut.mutateAsync({ scope, author_player_id, body });
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

  const canSubmit = !!draftBody.trim();

  function startAdd(scope: CommentScope) {
    setEditingId(null);
    setDraftAuthor("general");
    setDraftBody("");
    setAddTarget((cur) => {
      const same =
        cur?.kind === scope.kind && (scope.kind === "tournament" || (cur as any).matchId === (scope as any).matchId);
      return same ? null : scope;
    });
  }

  return (
    <CollapsibleCard title="Comments" defaultOpen={true} variant="outer" bodyVariant="none" bodyClassName="space-y-3">
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
                players={players}
                draftAuthor={draftAuthor}
                onChangeDraftAuthor={setDraftAuthor}
                draftBody={draftBody}
                onChangeDraftBody={setDraftBody}
                onSubmit={() => upsertComment({ kind: "tournament" })}
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
                    isUnseen={!seen.has(c!.id)}
                    onMarkSeen={() => markCommentSeen(tournamentId, c!.id)}
                    flash={flashId === c!.id}
                    surfaceClassName="panel"
                    avatarUpdatedAt={
                      c!.author.kind === "player" ? avatarUpdatedAtByPlayerId.get(c!.author.playerId) ?? null : null
                    }
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
                    authorLabel={authorLabel}
                    onToggleEdit={() => toggleEdit(c!)}
                    onDelete={() => deleteComment(c!.id)}
                    draftAuthor={draftAuthor}
                    onChangeDraftAuthor={setDraftAuthor}
                    draftBody={draftBody}
                    onChangeDraftBody={setDraftBody}
                    onSave={() => upsertComment(c!.scope)}
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
                    players={players}
                    draftAuthor={draftAuthor}
                    onChangeDraftAuthor={setDraftAuthor}
                    draftBody={draftBody}
                    onChangeDraftBody={setDraftBody}
                    onSubmit={() => upsertComment({ kind: "match", matchId: b.matchId })}
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
                        isUnseen={!seen.has(c.id)}
                        onMarkSeen={() => markCommentSeen(tournamentId, c.id)}
                        flash={flashId === c.id}
                        surfaceClassName="panel-subtle"
                        avatarUpdatedAt={
                          c.author.kind === "player" ? avatarUpdatedAtByPlayerId.get(c.author.playerId) ?? null : null
                        }
                        canPin={false}
                        onTogglePin={null}
                        canWrite={canWrite}
                        canDelete={canDelete}
                        players={players}
                        authorLabel={authorLabel}
                        onToggleEdit={() => toggleEdit(c)}
                        onDelete={() => deleteComment(c.id)}
                        draftAuthor={draftAuthor}
                        onChangeDraftAuthor={setDraftAuthor}
                        draftBody={draftBody}
                        onChangeDraftBody={setDraftBody}
                        onSave={() => upsertComment(c.scope)}
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
    </CollapsibleCard>
  );
}
