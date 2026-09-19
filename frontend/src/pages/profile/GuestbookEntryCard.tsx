import { ChevronDown, ChevronRight, ChevronUp, Mail, Pencil, Reply, Trash2, Users } from "lucide-react";
import { createContext, useContext, useState, type JSX } from "react";

import Button from "../../ui/primitives/Button";
import Textarea from "../../ui/primitives/Textarea";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import VoteButton from "../../ui/primitives/VoteButton";
import type { PlayerGuestbookEntry, PlayerGuestbookSubject } from "../../api/types";
import { fmtCount, fmtDateTime } from "../../utils/format";
import { guestbookSubjectImageUrl } from "../../api/players.api";
import { SUBJECT_ICON, subjectCitationLabel, subjectCitationTitle, subjectExcerpt } from "./guestbookSubjects";

/**
 * Everything a GuestbookEntryCard needs, provided via context so the
 * recursive tree of cards doesn't have to thread ~18 props through each level.
 * The action callbacks are thin wrappers that preserve the original behaviour.
 */
export type GuestbookCardContextValue = {
  childrenByParent: Map<number, PlayerGuestbookEntry[]>;
  avatarUpdatedAtByPlayerId: Map<number, string | null>;
  unreadReplyCountByEntryId: Map<number, number>;
  replyDraftByEntryId: Record<number, string>;
  replyOpenEntryId: number | null;
  editDraftByEntryId: Record<number, string>;
  editOpenEntryId: number | null;
  collapsedEntryIds: Set<number>;
  canPostGuestbook: boolean;
  isUnread: (id: number) => boolean;
  canDelete: (entry: PlayerGuestbookEntry) => boolean;
  canEditEntry: (entry: PlayerGuestbookEntry) => boolean;
  readPending: boolean;
  votePending: boolean;
  createPending: boolean;
  editPending: boolean;
  voteEnabled: boolean;
  markRead: (entryId: number) => void;
  toggleReply: (entryId: number) => void;
  cancelReply: (entryId: number) => void;
  toggleEdit: (entry: PlayerGuestbookEntry) => void;
  cancelEdit: (entryId: number) => void;
  setEditDraft: (entryId: number, text: string) => void;
  submitEdit: (entryId: number, text: string) => void;
  toggleCollapse: (entryId: number) => void;
  /** Ask to delete: the dialog that names the cost belongs to the section, not to
   *  each of the recursive cards (R2). */
  requestDelete: (entry: PlayerGuestbookEntry) => void;
  vote: (entryId: number, value: -1 | 0 | 1) => void;
  showVoters: (entryId: number) => void;
  /** Open the snapshot a subject chip names — the pinned copy, never the live item. */
  viewSubject: (subject: PlayerGuestbookSubject) => void;
  setReplyDraft: (entryId: number, text: string) => void;
  submitReply: (entryId: number, text: string) => void;
};

const GuestbookCardContext = createContext<GuestbookCardContextValue | null>(null);

export function GuestbookCardProvider({
  value,
  children,
}: {
  value: GuestbookCardContextValue;
  children: React.ReactNode;
}) {
  return <GuestbookCardContext.Provider value={value}>{children}</GuestbookCardContext.Provider>;
}

function useGuestbookCard(): GuestbookCardContextValue {
  const ctx = useContext(GuestbookCardContext);
  if (!ctx) throw new Error("GuestbookEntryCard must be used within GuestbookCardProvider");
  return ctx;
}

/**
 * What a tagged entry is about, shown rather than only named (Q-B): the **pinned copy**,
 * as a thumbnail for the two pictures and as a quoted excerpt for the About text — so an
 * entry cites its subject the way a reply quotes a message, instead of asking the reader
 * to tap a word to find out what is meant.
 *
 * Three rules it must not lose:
 * - **The word stays.** A thumbnail cannot say whether it is a header image or an avatar,
 *   and an excerpt cannot say it is the About text — that is the M8 lesson, and it is also
 *   what is left when the picture does not load. The caption is never dropped for the
 *   picture's sake.
 * - **`Earlier …` is the server's answer** (`subject.current`), rendered and never
 *   re-derived (the A10 rule). It is the whole reason the copy was pinned: the citation
 *   shows what the reader is looking at *and* says it is no longer on the profile.
 * - **One tap target, not two.** The thumbnail, the caption and the quote are one
 *   `<button>` opening the same snapshot viewers the chip opened — a picture that is
 *   tappable beside a word that is tappable is two mechanisms for one job (rule 8).
 *
 * The thumbnail keeps the source's own shape — 16:9 for the banner, square for the avatar
 * — because a header image center-cropped to a square is a different picture. Both are
 * 40px tall, one `inset` radius step, and lazy: the bytes are the full pinned copy (there
 * is no thumbnail endpoint and this batch adds no backend), but the URL carries the
 * snapshot id and is served `immutable`, so two entries about one version cost one request
 * and a return visit costs none.
 */
function SubjectCitation({
  subject,
  onOpen,
}: {
  subject: PlayerGuestbookSubject;
  onOpen: (subject: PlayerGuestbookSubject) => void;
}): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);
  const Icon = SUBJECT_ICON[subject.kind];
  const label = subjectCitationLabel(subject);
  const title = subjectCitationTitle(subject);
  const excerpt = subject.kind === "about" ? subjectExcerpt(subject.text) : "";
  // A square avatar and a 16:9 banner, sized by their aspect off one height.
  const thumbShape = `h-10 shrink-0 rounded-xl ring-1 ring-inset ring-border-card-chip/55 ${
    subject.kind === "avatar" ? "aspect-square" : "aspect-[16/9]"
  }`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen(subject);
      }}
      className="row-tap focus-ring mt-2 flex w-full items-center gap-2 p-1 text-left"
      title={title}
      aria-label={`${label}. ${title}`}
      data-subject={subject.kind}
      data-subject-current={subject.current || undefined}
    >
      {subject.has_image ? (
        imageFailed ? (
          // The picture is gone or unreachable; the citation still says what it is about.
          <span className={`${thumbShape} grid place-items-center bg-bg-card-chip/50`} data-subject-thumb="missing">
            <Icon size={16} className="text-text-muted" aria-hidden="true" />
          </span>
        ) : (
          <img
            src={guestbookSubjectImageUrl(subject.snapshot_id, subject.captured_at)}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setImageFailed(true)}
            className={`${thumbShape} object-cover`}
            data-subject-thumb="image"
          />
        )
      ) : null}
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs text-text-muted">
          <Icon size={12} aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
        {excerpt ? (
          <span className="mt-0.5 line-clamp-2 break-anywhere text-xs italic text-text-normal" data-subject-excerpt="">
            {`“${excerpt}”`}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export default function GuestbookEntryCard({
  entry,
  depth = 0,
}: {
  entry: PlayerGuestbookEntry;
  depth?: number;
}): JSX.Element {
  const ctx = useGuestbookCard();
  const children = ctx.childrenByParent.get(entry.id) ?? [];
  const authorAvatarUpdatedAt = ctx.avatarUpdatedAtByPlayerId.get(entry.author_player_id) ?? null;
  const canDeleteEntry = ctx.canDelete(entry);
  const isUnseen = ctx.isUnread(entry.id);
  const unreadReplies = ctx.unreadReplyCountByEntryId.get(entry.id) ?? 0;
  const myVote = entry.my_vote ?? 0;
  const upvotes = Number(entry.upvotes ?? 0);
  const downvotes = Number(entry.downvotes ?? 0);
  const replyDraft = ctx.replyDraftByEntryId[entry.id] ?? "";
  const replyOpen = ctx.replyOpenEntryId === entry.id;
  const canEditThis = ctx.canEditEntry(entry);
  const editOpen = ctx.editOpenEntryId === entry.id;
  const editDraft = ctx.editDraftByEntryId[entry.id] ?? entry.body;
  const isCollapsed = ctx.collapsedEntryIds.has(entry.id);
  // Inside the feed's one card (DESIGN.md §9b), so a message is the level-2 `inset`
  // row and a reply is flat and tighter on that card's own surface, hanging off an
  // accent rule — the comment feed's shape exactly. A root used to be a second `card`
  // inside the page and a reply an `inset` inside that, which is one surface too many
  // in both directions (A8).
  const surfaceClass = depth === 0 ? "inset p-3" : "px-3 py-2";

  return (
    <div key={entry.id} className={depth === 0 ? "space-y-2" : "space-y-1"}>
      <div
        id={`guestbook-entry-${entry.id}`}
        className={`${surfaceClass} scroll-mt-28 sm:scroll-mt-32`}
        onClick={() => {
          if (!isUnseen || ctx.readPending) return;
          ctx.markRead(entry.id);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            <AvatarCircle
              playerId={entry.author_player_id}
              name={entry.author_display_name}
              updatedAt={authorAvatarUpdatedAt}
              sizeClass="h-8 w-8"
              fallbackClassName="text-xs font-semibold text-text-muted"
            />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-text-normal">{entry.author_display_name}</div>
              <div className="text-xs text-text-muted">
                {fmtDateTime(entry.created_at)}
                {entry.updated_at !== entry.created_at ? " · edited" : ""}
              </div>
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {children.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  ctx.toggleCollapse(entry.id);
                }}
                title={isCollapsed ? `Show ${fmtCount(children.length, "reply", "replies")}` : "Hide replies"}
                className="h-8 px-2 p-0 inline-flex items-center justify-center gap-1"
              >
                {isCollapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                <span className="text-xs tabular-nums">{children.length}</span>
              </Button>
            ) : null}
            {isUnseen ? (
              <Button
                type="button"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (ctx.readPending) return;
                  ctx.markRead(entry.id);
                }}
                title="Mark as read"
                className="h-8 w-8 p-0 inline-flex items-center justify-center"
              >
                <Mail size={14} className="text-accent motion-safe:animate-pulse" aria-hidden="true" />
              </Button>
            ) : null}
            {!isUnseen && unreadReplies > 0 ? (
              <span
                title={`Unread replies: ${unreadReplies}`}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-border-card-inner bg-bg-card-chip/25 px-2 text-xs"
              >
                <Reply size={12} className="text-accent" aria-hidden="true" />
                <span className="tabular-nums text-text-normal">{unreadReplies}</span>
              </span>
            ) : null}
            {ctx.canPostGuestbook ? (
              <Button
                type="button"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  ctx.toggleReply(entry.id);
                }}
                title="Reply"
                className="h-8 w-8 p-0 inline-flex items-center justify-center"
              >
                <Reply size={14} aria-hidden="true" />
              </Button>
            ) : null}
            {canEditThis ? (
              <Button
                type="button"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  ctx.toggleEdit(entry);
                }}
                title={editOpen ? "Cancel edit" : "Edit message"}
                className="h-8 w-8 p-0 inline-flex items-center justify-center"
              >
                {editOpen ? <ChevronUp size={14} aria-hidden="true" /> : <Pencil size={14} aria-hidden="true" />}
              </Button>
            ) : null}
            {canDeleteEntry ? (
              <Button
                type="button"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  ctx.requestDelete(entry);
                }}
                title="Delete message"
                className="h-8 w-8 p-0 inline-flex items-center justify-center"
              >
                <Trash2 size={14} aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
        {/* What this message is about, as it was then — the pinned copy itself, with the
            word beside it (M8), saying "Earlier …" once the profile moved on. A reply
            never has one: its subject is its root's (K1's 400). */}
        {entry.subject ? <SubjectCitation subject={entry.subject} onOpen={ctx.viewSubject} /> : null}
        {editOpen ? (
          <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
            <Textarea
              label="Edit message"
              value={editDraft}
              onChange={(e) => ctx.setEditDraft(entry.id, e.target.value)}
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => ctx.cancelEdit(entry.id)} title="Cancel">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => ctx.submitEdit(entry.id, editDraft)}
                disabled={ctx.editPending || !editDraft.trim()}
                title="Save"
              >
                {ctx.editPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm whitespace-pre-wrap">{entry.body}</div>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
          <VoteButton
            direction="up"
            active={myVote === 1}
            count={upvotes}
            onVote={() => {
              if (!ctx.voteEnabled) return;
              const next: -1 | 0 | 1 = myVote === 1 ? 0 : 1;
              ctx.vote(entry.id, next);
            }}
            voteDisabled={!ctx.voteEnabled}
            title="Upvote"
          />
          <VoteButton
            direction="down"
            active={myVote === -1}
            count={downvotes}
            onVote={() => {
              if (!ctx.voteEnabled) return;
              const next: -1 | 0 | 1 = myVote === -1 ? 0 : -1;
              ctx.vote(entry.id, next);
            }}
            voteDisabled={!ctx.voteEnabled}
            title="Downvote"
          />
          <Button
            type="button"
            variant="ghost"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              ctx.showVoters(entry.id);
            }}
            title="Show voters"
            className="h-8 w-8 p-0 inline-flex items-center justify-center"
          >
            <Users size={14} className="text-text-muted" aria-hidden="true" />
          </Button>
        </div>

        {replyOpen && ctx.canPostGuestbook ? (
          <div
            className="mt-2 space-y-2 border-l-2 border-accent/30 pl-2"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <Textarea
              label={`Reply to ${entry.author_display_name}`}
              value={replyDraft}
              onChange={(e) => ctx.setReplyDraft(entry.id, e.target.value)}
              placeholder="Write a reply…"
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => ctx.cancelReply(entry.id)} title="Cancel">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => ctx.submitReply(entry.id, replyDraft)}
                disabled={ctx.createPending || !replyDraft.trim()}
                title="Post reply"
              >
                {ctx.createPending ? "Posting…" : "Reply"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {children.length > 0 && !isCollapsed ? (
        <div className="ml-2 space-y-1 border-l-2 border-accent/25 pl-2 sm:pl-3">
          {children.map((child) => (
            <GuestbookEntryCard key={child.id} entry={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
