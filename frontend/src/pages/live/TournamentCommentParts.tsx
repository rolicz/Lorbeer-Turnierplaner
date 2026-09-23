import { ChevronDown, ChevronRight, ChevronUp, Mail, Pencil, Pin, PinOff, Reply, Save, Trash2, Users } from "lucide-react";

import Button from "../../ui/primitives/Button";
import FormLabel from "../../ui/primitives/FormLabel";
import Textarea from "../../ui/primitives/Textarea";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import PlayerLink from "../../ui/primitives/PlayerLink";
import VoteButton from "../../ui/primitives/VoteButton";
import type { Player } from "../../api/types";
import { commentImageUrl } from "../../api/comments.api";
import { CommentSendRow } from "./comments/CommentComposer";
import { fmtCount, fmtTs } from "../../utils/format";
import type { CommentAuthor, TournamentComment } from "./tournamentCommentTypes";

/**
 * A picture in the feed is drawn at the comment column's width, and used to download the
 * original to do it: the three images on tournament 8 are 3,461,835 / 158,952 / 2,208,930
 * bytes and are drawn 292px wide on a phone (measured). The `srcset` treatment is the
 * banner's, for the same reason — this box follows the viewport, so there is no single
 * rung to ask for. Measured widths of the `<img>` itself: 222 / 292 / 332 at 320 / 390 /
 * 430 (viewport − 98), 534 / 662 / 794 at 640 / 768 / 900 (viewport − 106), and
 * 670 / 926 / 1038 at 1024 / 1280 / 1440+, where the page column caps it. `sizes`
 * over-states each of those by 2px, because too small is a blurry picture and too large
 * costs one rung.
 *
 * The lightbox this picture opens keeps the **original**, with no `w=` at all: it zooms,
 * and that is the full-size use.
 */
const COMMENT_IMAGE_WIDTHS = [384, 768, 1152, 1536] as const;
const COMMENT_IMAGE_SIZES = "(min-width: 1024px) 1040px, (min-width: 640px) calc(100vw - 104px), calc(100vw - 96px)";

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
  /** The comment being edited inline in its card (independent of the composer draft). */
  editingId: number | null;
  editAuthor: "general" | number;
  editBody: string;
  canSaveEdit: boolean;
  pinnedTournamentCommentId: number | null;
  flashId: number | null;
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
  /** Ask to delete: the dialog naming what goes with it lives on the card (R2). */
  deleteComment: (c: TournamentComment) => void;
  setEditAuthor: (v: "general" | number) => void;
  setEditBody: (v: string) => void;
  saveEdit: () => void;
};


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
  surfaceClassName = "inset",
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
    editAuthor,
    setEditAuthor,
    editBody,
    setEditBody,
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
    editAuthor !== "general" && currentPlayerId != null && editAuthor !== currentPlayerId ? editAuthor : null;
  const foreignAuthorName = foreignAuthorId != null ? players.find((p) => p.id === foreignAuthorId)?.display_name : null;

  return (
    <div
      id={`comment-${c.id}`}
      className={surfaceClassName + " scroll-mt-28 sm:scroll-mt-32 " + (flash ? "comment-attn" : "")}
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
            {/* Identity is a link (N4, Q-F): a named author's avatar and byline open that
                profile, exactly as the Ideas board's comments do. The avatar is
                `decorative` — the same door as the name, so only one of the two is a name
                in the accessibility tree — and its wrapper is `inline-flex` so the `<a>`
                does not open a line box and hand the row the font's descender space.
                An unattributed author is a real category here, but it is **not a name**:
                it has no profile to open, so it stays a quiet `<div>`, which is also what
                keeps the bylines that *are* names reading as names. */}
            {c.author.kind === "player" ? (
              <PlayerLink
                playerId={c.author.playerId}
                name={authorLabel(c.author)}
                decorative
                className="inline-flex shrink-0 rounded-full"
              >
                <AvatarCircle
                  playerId={c.author.playerId}
                  name={authorLabel(c.author)}
                  updatedAt={avatarUpdatedAt}
                  sizeClass="h-7 w-7"
                  fallbackClassName="text-xs font-semibold text-text-muted"
                />
              </PlayerLink>
            ) : null}
            {c.author.kind === "player" ? (
              <PlayerLink
                playerId={c.author.playerId}
                name={authorLabel(c.author)}
                className="text-xs font-semibold text-text-normal"
              >
                {authorLabel(c.author)}
              </PlayerLink>
            ) : (
              <div className="text-xs text-text-muted">{authorLabel(c.author)}</div>
            )}
            {isPinned ? <span className="chip">pinned</span> : null}
            {isEditing ? <span className="chip">editing</span> : null}
          </div>
          {/* Row 2: timestamp (+ edited) */}
          <div className="mt-0.5 text-xs text-text-muted">
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
                title={collapsed ? `Show ${fmtCount(childCount, "reply", "replies")}` : "Hide replies"}
                className="h-9 px-2 p-0 inline-flex items-center justify-center gap-1"
              >
                {collapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                <span className="text-xs tabular-nums">{childCount}</span>
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
              value={editAuthor === "general" ? "general" : String(editAuthor)}
              onChange={(e) => setEditAuthor(e.target.value === "general" ? "general" : Number(e.target.value))}
            >
              {currentPlayerId != null ? (
                <option value={String(currentPlayerId)}>{currentPlayerName || "Me"}</option>
              ) : null}
              <option value="general">Anonymous</option>
              {foreignAuthorId != null ? (
                <option value={String(foreignAuthorId)}>
                  {(foreignAuthorName ?? `Player #${foreignAuthorId}`) + " (original)"}
                </option>
              ) : null}
            </select>
          </label>

          <Textarea
            label="Edit"
            aria-label="Edit comment body"
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
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
            <div className="inset p-2">
              <button
                type="button"
                className="block w-full"
                onClick={() => onOpenImage(commentImageUrl(c.id, c.imageUpdatedAt))}
                title="Open image"
              >
                <img
                  src={commentImageUrl(c.id, c.imageUpdatedAt, 1152)}
                  srcSet={COMMENT_IMAGE_WIDTHS.map((w) => `${commentImageUrl(c.id, c.imageUpdatedAt, w)} ${w}w`).join(", ")}
                  sizes={COMMENT_IMAGE_SIZES}
                  alt=""
                  className="w-full rounded-xl object-cover aspect-[4/3] cursor-zoom-in"
                  loading="lazy"
                  decoding="async"
                  data-comment-image
                />
              </button>
            </div>
          ) : null}
          <div className="flex items-center gap-2 text-xs text-text-muted">
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
        <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
          <CommentSendRow
            value={replyDraft}
            onChange={onChangeReplyDraft}
            onSubmit={onSubmitReply}
            canSubmit={!!replyDraft.trim()}
            submitting={replySubmitting}
            autoFocus
            ariaLabel={`Reply to ${authorLabel(c.author)}`}
            placeholder={`Reply to ${authorLabel(c.author)}…`}
            sendLabel="Post reply"
            trailing={
              <Button
                type="button"
                variant="ghost"
                onClick={onCancelReply}
                title="Cancel reply"
                aria-label="Cancel reply"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
              >
                <ChevronUp size={16} aria-hidden="true" />
              </Button>
            }
          />
        </div>
      ) : null}
    </div>
  );
}
