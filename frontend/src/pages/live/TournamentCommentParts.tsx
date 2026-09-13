import { ChevronDown, ChevronRight, ChevronUp, Mail, Pencil, Pin, PinOff, Plus, Reply, Save, Trash2, Users } from "lucide-react";

import Button from "../../ui/primitives/Button";
import FormLabel from "../../ui/primitives/FormLabel";
import Textarea from "../../ui/primitives/Textarea";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import VoteButton from "../../ui/primitives/VoteButton";
import type { Player } from "../../api/types";
import { commentImageUrl } from "../../api/comments.api";
import CommentCreateComposer, { type CommentGoalSide, type CommentGoalTeamOption } from "./CommentCreateComposer";
import { fmtTs } from "../../utils/format";
import type { CommentAuthor, CommentScope, TournamentComment } from "./tournamentCommentTypes";

/**
 * Shared/stable card-level values for rendering a comment: the viewer's
 * permissions, the shared draft/reply/edit state, and the callbacks a card
 * can trigger. Bundled into one object (built once via useMemo in
 * TournamentCommentsCard) so CommentList and CommentCard don't have to relay
 * ~30 individual props; only the comment-specific values (the comment
 * itself, depth/reply nesting, etc.) stay as separate props. Mirrors
 * `GuestbookCardContextValue` in profile/GuestbookEntryCard.tsx.
 */
export type CommentCardContextValue = {
  // --- viewer / permissions ---
  token: string | null;
  seen: { has: (id: number) => boolean };
  canWrite: boolean;
  canDelete: boolean;
  players: Player[];
  currentPlayerId: number | null;
  currentPlayerName: string | null;
  avatarUpdatedAtByPlayerId: Map<number, string>;
  authorLabel: (a: CommentAuthor) => string;

  // --- card state ---
  editingId: number | null;
  editingDirty: boolean;
  pinnedTournamentCommentId: number | null;
  flashId: number | null;
  draftAuthor: "general" | number;
  draftBody: string;
  canSubmit: boolean;
  replyToId: number | null;
  replyDraft: string;
  replySubmitting: boolean;

  // --- card callbacks ---
  onMarkSeen: (id: number) => void;
  onTogglePin: (c: TournamentComment) => void;
  onVote: (id: number, value: -1 | 0 | 1) => void;
  onOpenVoters: (id: number) => void;
  onOpenImage: (src: string) => void;
  openReply: (c: TournamentComment) => void;
  cancelReply: () => void;
  submitReply: (c: TournamentComment) => void;
  setReplyDraft: (v: string) => void;
  toggleEdit: (c: TournamentComment) => void;
  deleteComment: (id: number) => void;
  setDraftAuthor: (v: "general" | number) => void;
  setDraftBody: (v: string) => void;
  upsertComment: (scope: CommentScope) => void;
};


export function ScopeActionButton({
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
      {open ? <ChevronUp size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
    </Button>
  );
}

export function AddCommentDropdown({
  open,
  authorOptions,
  draftAuthor,
  onChangeDraftAuthor,
  draftMode,
  onChangeDraftMode,
  allowMatchEventModes,
  goalTeams,
  goalSide,
  onChangeGoalSide,
  goalPlayers,
  goalMinute,
  onChangeGoalMinute,
  goalPlayerName,
  onChangeGoalPlayerName,
  shotsA,
  onChangeShotsA,
  shotsB,
  onChangeShotsB,
  draftBody,
  onChangeDraftBody,
  canAttachImage = false,
  imagePreviewUrl = null,
  onOpenImageCropper,
  onClearImage,
  onSubmit,
  onCancel,
  canSubmit,
  surfaceClassName = "panel-subtle",
}: {
  open: boolean;
  authorOptions: { value: "general" | number; label: string }[];
  draftAuthor: "general" | number;
  onChangeDraftAuthor: (v: "general" | number) => void;
  draftMode: "comment" | "goal" | "shots";
  onChangeDraftMode: (mode: "comment" | "goal" | "shots") => void;
  allowMatchEventModes: boolean;
  goalTeams: CommentGoalTeamOption[];
  goalSide: CommentGoalSide | null;
  onChangeGoalSide: (side: CommentGoalSide) => void;
  goalPlayers: { label: string }[];
  goalMinute: string;
  onChangeGoalMinute: (value: string) => void;
  goalPlayerName: string;
  onChangeGoalPlayerName: (value: string) => void;
  shotsA: string;
  onChangeShotsA: (value: string) => void;
  shotsB: string;
  onChangeShotsB: (value: string) => void;
  draftBody: string;
  onChangeDraftBody: (v: string) => void;
  canAttachImage?: boolean;
  imagePreviewUrl?: string | null;
  onOpenImageCropper?: () => void;
  onClearImage?: () => void;
  onSubmit: () => void;
  onCancel?: () => void;
  canSubmit: boolean;
  surfaceClassName?: string;
}) {
  if (!open) return null;
  return (
    <CommentCreateComposer
      authorOptions={authorOptions}
      authorValue={draftAuthor}
      onAuthorChange={onChangeDraftAuthor}
      mode={draftMode}
      onModeChange={onChangeDraftMode}
      allowMatchEventModes={allowMatchEventModes}
      goalTeams={goalTeams}
      goalSide={goalSide}
      onGoalSideChange={onChangeGoalSide}
      goalPlayers={goalPlayers}
      goalMinute={goalMinute}
      onGoalMinuteChange={onChangeGoalMinute}
      goalPlayerName={goalPlayerName}
      onGoalPlayerNameChange={onChangeGoalPlayerName}
      shotsA={shotsA}
      onShotsAChange={onChangeShotsA}
      shotsB={shotsB}
      onShotsBChange={onChangeShotsB}
      draftBody={draftBody}
      onChangeDraftBody={onChangeDraftBody}
      canAttachImage={canAttachImage}
      imagePreviewUrl={imagePreviewUrl}
      onOpenImageCropper={onOpenImageCropper}
      onClearImage={onClearImage}
      onSubmit={onSubmit}
      onCancel={onCancel}
      canSubmit={canSubmit}
      surfaceClassName={surfaceClassName}
    />
  );
}

export function CommentCard({
  c,
  isEditing,
  isPinned,
  isUnseen,
  onMarkSeen,
  canPin,
  onTogglePin,
  canEdit,
  onReply,
  replyOpen,
  onSubmitReply,
  childCount,
  collapsed,
  onToggleCollapse,
  onToggleEdit,
  onDelete,
  onVote,
  onOpenVoters,
  onSave,
  canSubmit,
  flash,
  surfaceClassName = "panel-subtle",
  avatarUpdatedAt,
  ctx,
}: {
  c: TournamentComment;
  isEditing: boolean;
  isPinned: boolean;
  isUnseen: boolean;
  onMarkSeen: () => void;
  canPin: boolean;
  onTogglePin: (() => void) | null;
  canEdit: boolean;
  onReply: () => void;
  replyOpen: boolean;
  onSubmitReply: () => void;
  childCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onToggleEdit: () => void;
  onDelete: () => void;
  onVote: (value: -1 | 0 | 1) => void;
  onOpenVoters: () => void;
  onSave: () => void;
  canSubmit: boolean;
  flash: boolean;
  surfaceClassName?: string;
  avatarUpdatedAt?: string | null;
  ctx: CommentCardContextValue;
}) {
  const {
    canDelete,
    canWrite: canReply,
    players,
    currentPlayerId,
    currentPlayerName,
    authorLabel,
    draftAuthor,
    setDraftAuthor: onChangeDraftAuthor,
    draftBody,
    setDraftBody: onChangeDraftBody,
    replyDraft,
    setReplyDraft: onChangeReplyDraft,
    cancelReply: onCancelReply,
    replySubmitting,
    onOpenImage,
  } = ctx;
  const showActions =
    canEdit || canDelete || (canPin && !!onTogglePin) || canReply || isUnseen || childCount > 0;
  const edited = c.updatedAt > c.createdAt;
  const foreignAuthorId =
    draftAuthor !== "general" && currentPlayerId != null && draftAuthor !== currentPlayerId ? draftAuthor : null;
  const foreignAuthorName = foreignAuthorId != null ? players.find((p) => p.id === foreignAuthorId)?.display_name : null;

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
              <AvatarCircle
                playerId={c.author.playerId}
                name={authorLabel(c.author)}
                updatedAt={avatarUpdatedAt}
                sizeClass="h-7 w-7"
                fallbackClassName="text-[12px] font-semibold text-text-muted"
              />
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

        {showActions ? (
          <div className="shrink-0 flex items-center gap-2">
            {childCount > 0 ? (
              <Button
                variant="ghost"
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleCollapse();
                }}
                title={collapsed ? `Show ${childCount} repl${childCount === 1 ? "y" : "ies"}` : "Hide replies"}
                className="h-9 px-2 p-0 inline-flex items-center justify-center gap-1"
              >
                {collapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                <span className="text-[11px] tabular-nums">{childCount}</span>
              </Button>
            ) : null}
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
                <Mail size={14} className="text-accent motion-safe:animate-pulse" aria-hidden="true" />
              </Button>
            ) : null}
            {canReply ? (
              <Button
                variant="ghost"
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onReply();
                }}
                title="Reply"
                className="h-9 w-9 p-0 inline-flex items-center justify-center"
              >
                <Reply size={14} aria-hidden="true" />
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
                {isPinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                variant="ghost"
                type="button"
                onClick={onToggleEdit}
                title={isEditing ? "Cancel edit" : "Edit comment"}
                className="h-9 w-9 p-0 inline-flex items-center justify-center md:w-auto md:px-3 md:py-1.5"
              >
                {isEditing ? <ChevronUp size={14} className="md:hidden" aria-hidden="true" /> : <Pencil size={14} className="md:hidden" aria-hidden="true" />}
                <span className="hidden md:inline">{isEditing ? "Close" : "Edit"}</span>
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant="ghost"
                type="button"
                onClick={onDelete}
                title="Delete comment"
                className="h-9 w-9 p-0 inline-flex items-center justify-center md:w-auto md:px-3 md:py-1.5"
              >
                <Trash2 size={14} className="md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">Delete</span>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {isEditing ? (
        <div className="mt-2 space-y-2">
          <label className="block">
            <FormLabel>Posted as</FormLabel>
            <select
              className="select-field"
              value={draftAuthor === "general" ? "general" : String(draftAuthor)}
              onChange={(e) => onChangeDraftAuthor(e.target.value === "general" ? "general" : Number(e.target.value))}
            >
              {currentPlayerId != null ? (
                <option value={String(currentPlayerId)}>{currentPlayerName || "Me"}</option>
              ) : null}
              <option value="general">General</option>
              {foreignAuthorId != null ? (
                <option value={String(foreignAuthorId)}>
                  {(foreignAuthorName ?? `Player #${foreignAuthorId}`) + " (original)"}
                </option>
              ) : null}
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
              <Save size={16} className="md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Save</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {c.body ? <div className="whitespace-pre-wrap text-sm">{c.body}</div> : null}
          {c.hasImage ? (
            <div className="panel-subtle p-2">
              <button
                type="button"
                className="block w-full"
                onClick={() => onOpenImage(commentImageUrl(c.id, c.imageUpdatedAt))}
                title="Open image"
              >
                <img
                  src={commentImageUrl(c.id, c.imageUpdatedAt)}
                  alt=""
                  className="w-full rounded-lg object-cover aspect-[4/3] cursor-zoom-in"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            </div>
          ) : null}
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <VoteButton
              direction="up"
              active={c.myVote === 1}
              count={c.upvotes}
              onVote={() => onVote(c.myVote === 1 ? 0 : 1)}
              title="Upvote"
            />
            <VoteButton
              direction="down"
              active={c.myVote === -1}
              count={c.downvotes}
              onVote={() => onVote(c.myVote === -1 ? 0 : -1)}
              title="Downvote"
            />
            <Button
              type="button"
              variant="ghost"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenVoters();
              }}
              title="Show voters"
              className="h-8 w-8 p-0 inline-flex items-center justify-center"
            >
              <Users size={14} className="text-text-muted" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {replyOpen ? (
        <div className="mt-2 panel-inner p-2 space-y-2" onClick={(e) => e.stopPropagation()}>
          <Textarea
            label={`Reply to ${authorLabel(c.author)}`}
            value={replyDraft}
            onChange={(e) => onChangeReplyDraft(e.target.value)}
            placeholder="Write a reply…"
          />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancelReply} title="Cancel">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onSubmitReply}
              disabled={replySubmitting || !replyDraft.trim()}
              title="Post reply"
            >
              {replySubmitting ? "Posting…" : "Reply"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
