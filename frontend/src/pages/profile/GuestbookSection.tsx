import { Mail, MailOpen } from "lucide-react";

import Button from "../../ui/primitives/Button";
import ConfirmDialog from "../../ui/primitives/ConfirmDialog";
import EmptyState from "../../ui/primitives/EmptyState";
import ImageLightbox from "../../ui/primitives/ImageLightbox";
import LoadingPlaceholder from "../../ui/primitives/LoadingPlaceholder";
import Modal from "../../ui/primitives/Modal";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { CommentSendRow, ModeBadge } from "../live/comments/CommentComposer";
import { guestbookSubjectImageUrl } from "../../api/players.api";
import { fmtDateTime } from "../../utils/format";
import type { GuestbookSubjectKind, PlayerGuestbookEntry, PlayerGuestbookSubject } from "../../api/types";
import { SUBJECT_ICON, SUBJECT_LABEL } from "./guestbookSubjects";
import { SECTION_HEAD_ACTION_CLASS } from "./SubjectCommentTrigger";
import GuestbookEntryCard, {
  GuestbookCardProvider,
  type GuestbookCardContextValue,
} from "./GuestbookEntryCard";

export type GuestbookSectionProps = {
  cardContext: GuestbookCardContextValue;
  roots: PlayerGuestbookEntry[];
  loading: boolean;
  isEmpty: boolean;
  errors: {
    load: unknown;
    readStatus: unknown;
    post: unknown;
    remove: unknown;
    markRead: unknown;
    markAll: unknown;
    vote: unknown;
  };
  unreadCount: number;
  onJumpUnread: () => void;
  /** Ask; the dialog below decides. `useProfileGuestbook` is a hook and cannot render it. */
  onRequestMarkAllRead: () => void;
  markAllAsked: boolean;
  markAllCount: number;
  onCancelMarkAllRead: () => void;
  onConfirmMarkAllRead: () => void;
  markAllPending: boolean;
  /** The message whose delete was asked for, with the replies that would go with it. */
  pendingDelete: PlayerGuestbookEntry | null;
  pendingDeleteReplyCount: number;
  deletePending: boolean;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  canPost: boolean;
  draft: string;
  onDraftChange: (text: string) => void;
  onPost: () => void;
  posting: boolean;
  /** Bumped after a posted message and when the composer is armed, to put the caret in the field. */
  composerNonce?: number;
  /** What the composer is armed for, shown as the badge above the send row (K2). */
  subjectDraft?: GuestbookSubjectKind | null;
  onClearSubject?: () => void;
  /** The snapshot a chip asked to see; the lightbox or the modal below renders it. */
  viewedSubject?: PlayerGuestbookSubject | null;
  onCloseSubject?: () => void;
  placeholder: string;
};

export default function GuestbookSection({
  cardContext,
  roots,
  loading,
  isEmpty,
  errors,
  unreadCount,
  onJumpUnread,
  onRequestMarkAllRead,
  markAllAsked,
  markAllCount,
  onCancelMarkAllRead,
  onConfirmMarkAllRead,
  markAllPending,
  pendingDelete,
  pendingDeleteReplyCount,
  deletePending,
  onCancelDelete,
  onConfirmDelete,
  canPost,
  draft,
  onDraftChange,
  onPost,
  posting,
  composerNonce,
  subjectDraft = null,
  onClearSubject,
  viewedSubject = null,
  onCloseSubject,
  placeholder,
}: GuestbookSectionProps) {
  // Total messages, replies included — the number the header states.
  const total = roots.length + Array.from(cardContext.childrenByParent.values()).reduce((n, list) => n + list.length, 0);

  const doomedReplies = pendingDeleteReplyCount;

  /* **A feed inside a tabbed page is flat** (G1, Roli's decision, `DESIGN.md` §9b).
     This was the profile's one boxed tab: Overview, Stats and Matches carry no `card` at
     all and start at the page gutter, while the guestbook wrapped everything in one, so
     switching to this tab stepped the text 25px inward and took 50px of line width off it
     (measured at 390px: x=41 / 308px against x=16 / 358px), through a surface stack of
     page → card → inset → chip where the siblings have page → row. So the head is a
     `section-head` like every other section on this page, the messages are hairline-
     separated rows at the gutter (`list-divided` + this page's own row, `AGENTS.md` §9),
     and the chat row stays sticky at the end of the feed. The tournament's comments feed
     keeps its card: it *is* its page, 6950px tall, and its edges are never on screen. */
  return (
    <>
    <section className="min-w-0 space-y-2" data-guestbook-feed>
      <div className="section-head" data-guestbook-head>
        <h2 className="section-label inline-flex min-w-0 items-center gap-2">
          <span className="truncate">Guestbook</span>
          <span className="shrink-0 font-normal tabular-nums">{total}</span>
        </h2>
        {unreadCount > 0 ? (
          /* Two actions, one treatment (Q-A): both are the `h-8` ghost button the profile's
             heads already wear, so the head is 32px and neither control invents a size.
             The jump used to be a bare `<button>` with no class at all — 56×24px, no focus
             ring — wrapping a status `Pill`, with a `title` on each of them, so the reader
             got two tooltips for one action. `Pill` is a status tag and this is an action
             (`DESIGN.md` §7). */
          <span className="order-1 shrink-0 inline-flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              onClick={onJumpUnread}
              title="Jump to the latest unread message"
              aria-label={`Jump to the latest unread message · ${unreadCount} unread`}
              className={SECTION_HEAD_ACTION_CLASS}
            >
              <Mail size={14} className="text-accent" aria-hidden="true" />
              <span className="tabular-nums">{unreadCount}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onRequestMarkAllRead}
              title="Mark all unread guestbook messages as read"
              disabled={markAllPending}
              className={SECTION_HEAD_ACTION_CLASS}
            >
              <MailOpen size={14} className="md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Read all</span>
            </Button>
          </span>
        ) : null}
      </div>

      <ErrorToastOnError error={errors.load} title="Guestbook loading failed" />
      <ErrorToastOnError error={errors.readStatus} title="Guestbook read-status loading failed" />
      <ErrorToastOnError error={errors.post} title="Could not post guestbook message" />
      <ErrorToastOnError error={errors.remove} title="Could not delete guestbook message" />
      <ErrorToastOnError error={errors.markRead} title="Could not mark guestbook entry as read" />
      <ErrorToastOnError error={errors.markAll} title="Could not mark guestbook as read" />
      <ErrorToastOnError error={errors.vote} title="Could not vote guestbook message" />

      {loading ? <div className="py-3"><LoadingPlaceholder /></div> : null}
      {!loading && isEmpty ? <EmptyState title="No messages yet." className="py-6" /> : null}

      {roots.length ? (
        <GuestbookCardProvider value={cardContext}>
          {/* A message carries an author row, a citation, a body and a vote row, so it is
              `list-divided` plus this page's own row rather than a `ListRow` (§7). The
              hairline runs between whole threads: a reply belongs to the message above it. */}
          <div className="list-divided">
            {roots.map((entry) => (
              <GuestbookEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </GuestbookCardProvider>
      ) : null}

      {/* You write at the end of the feed, in the same chat row as the comments
          (T3 / DESIGN.md §9b) — never behind a button, never above what you read.
          `bottom-nav-clear` and `lg:bottom-0` are load-bearing and never hand-spelled:
          they are what collapses this box with the mobile tab bar when the keyboard
          comes up (Q2) and what keeps Q14's bottom reservation honest. Flat, the strip
          paints the page's own background instead of the card's. */}
      {canPost ? (
        <div
          className="sticky bottom-nav-clear z-10 border-t border-border-card-chip/40 bg-bg-default py-2 lg:bottom-0"
          data-guestbook-composer
        >
          <div className="space-y-2">
            {/* Armed: the composer says what the next message is about, with the way out
                beside it — the goal/shots chip generalised (DESIGN.md §9b). */}
            {subjectDraft
              ? (() => {
                  const Icon = SUBJECT_ICON[subjectDraft];
                  return (
                    <ModeBadge
                      label={SUBJECT_LABEL[subjectDraft]}
                      icon={<Icon size={12} aria-hidden="true" />}
                      onLeave={() => onClearSubject?.()}
                      leaveLabel="Remove the subject"
                    />
                  );
                })()
              : null}
            <CommentSendRow
              value={draft}
              onChange={onDraftChange}
              onSubmit={onPost}
              canSubmit={!!draft.trim()}
              submitting={posting}
              ariaLabel="Guestbook message"
              placeholder={placeholder}
              sendLabel="Post message"
              focusNonce={composerNonce}
            />
          </div>
        </div>
      ) : (
        <div className="border-t border-border-card-chip/40 py-2.5 text-sm text-text-muted">
          Log in as a player to post guestbook messages.
        </div>
      )}
    </section>

    {/* Both confirmations the guestbook needs (R2). The hook asks; this renders. */}
    <ConfirmDialog
      open={!!pendingDelete}
      title="Delete this message?"
      subtitle={
        pendingDelete
          ? `From ${pendingDelete.author_display_name} · ${fmtDateTime(pendingDelete.created_at)}`
          : undefined
      }
      confirmLabel="Delete message"
      busy={deletePending}
      onCancel={onCancelDelete}
      onConfirm={onConfirmDelete}
    >
      {doomedReplies > 0 ? (
        <div>
          {doomedReplies === 1
            ? "The one reply below it is deleted too."
            : `All ${doomedReplies} replies below it are deleted too.`}
        </div>
      ) : null}
      <div>Its votes go with it.</div>
      <div>This cannot be undone.</div>
    </ConfirmDialog>

    <ConfirmDialog
      open={markAllAsked}
      title="Mark the guestbook as read?"
      subtitle={
        markAllCount === 1
          ? "The one unread message counts as read — for you only, and nothing is deleted."
          : `All ${markAllCount} unread messages count as read — for you only, and nothing is deleted.`
      }
      confirmLabel={`Mark ${markAllCount} as read`}
      busyLabel="Marking…"
      busy={markAllPending}
      onCancel={onCancelMarkAllRead}
      onConfirm={onConfirmMarkAllRead}
    />

    {/* A citation always opens the *snapshot*, never the live item: once the profile has
        moved on, the banner is the wrong picture, and while it has not, the pinned copy
        is the banner. No `footer` here — the trigger belongs to the live picture (K3). */}
    <ImageLightbox
      open={!!viewedSubject && viewedSubject.kind !== "about"}
      src={
        viewedSubject && viewedSubject.kind !== "about"
          ? guestbookSubjectImageUrl(viewedSubject.snapshot_id, viewedSubject.captured_at)
          : null
      }
      onClose={() => onCloseSubject?.()}
    />
    <Modal
      open={!!viewedSubject && viewedSubject.kind === "about"}
      title="About text"
      subtitle={
        viewedSubject
          ? `As of ${fmtDateTime(viewedSubject.captured_at)}${viewedSubject.current ? "" : " · changed since"}`
          : undefined
      }
      onClose={() => onCloseSubject?.()}
      maxWidth="max-w-md"
    >
      <div className="whitespace-pre-wrap text-sm text-text-normal">{viewedSubject?.text}</div>
    </Modal>
    </>
  );
}
