import { Mail, MailOpen, MessageSquare } from "lucide-react";

import Button from "../../ui/primitives/Button";
import EmptyState from "../../ui/primitives/EmptyState";
import LoadingPlaceholder from "../../ui/primitives/LoadingPlaceholder";
import { Pill } from "../../ui/primitives/Pill";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { CommentSendRow } from "../live/comments/CommentComposer";
import type { PlayerGuestbookEntry } from "../../api/types";
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
  onMarkAllRead: () => void;
  markAllPending: boolean;
  canPost: boolean;
  draft: string;
  onDraftChange: (text: string) => void;
  onPost: () => void;
  posting: boolean;
  /** Bumped after a posted message, to put the caret back in the field. */
  postedNonce?: number;
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
  onMarkAllRead,
  markAllPending,
  canPost,
  draft,
  onDraftChange,
  onPost,
  posting,
  postedNonce,
  placeholder,
}: GuestbookSectionProps) {
  // Total messages, replies included — the number the header states.
  const total = roots.length + Array.from(cardContext.childrenByParent.values()).reduce((n, list) => n + list.length, 0);

  return (
    /* The feed and its composer are one card (DESIGN.md §9b), exactly like the
       tournament comments feed: a header row, the messages as hairline-separated
       level-2 rows, and the chat row attached to the card's bottom edge. It used to be
       a second, floating card over a feed of cards — a card inside a card's worth of
       surfaces, and a composer that belonged to none of them (A8). */
    <section className="card min-w-0 p-0" data-guestbook-feed>
      <div className="flex items-center justify-between gap-2 border-b border-border-card-outer/55 px-3 py-2.5">
        <h2 className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-text-normal">
          <MessageSquare size={14} className="shrink-0 text-text-muted" aria-hidden="true" />
          <span className="truncate">Guestbook</span>
          <span className="shrink-0 text-xs font-normal tabular-nums text-text-muted">{total}</span>
        </h2>
        {unreadCount > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-2">
            <button type="button" title="Jump to latest unread guestbook message" onClick={onJumpUnread}>
              <Pill title="Unread guestbook messages">
                <Mail size={12} className="text-accent" aria-hidden="true" />
                <span className="tabular-nums text-text-normal">{unreadCount}</span>
              </Pill>
            </button>
            <Button
              type="button"
              variant="ghost"
              onClick={onMarkAllRead}
              title="Mark all unread guestbook messages as read"
              disabled={markAllPending}
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

      {loading ? <div className="px-3 py-3"><LoadingPlaceholder /></div> : null}
      {!loading && isEmpty ? <EmptyState title="No messages yet." className="px-3 py-6" /> : null}

      {roots.length ? (
        <GuestbookCardProvider value={cardContext}>
          <div className="space-y-2 px-3 py-3">
            {roots.map((entry) => (
              <GuestbookEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </GuestbookCardProvider>
      ) : null}

      {/* You write at the end of the feed, in the same chat row as the comments
          (T3 / DESIGN.md §9b) — never behind a button, never above what you read. */}
      {canPost ? (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-10 rounded-b-2xl border-t border-border-card-outer/55 bg-bg-card-outer p-2 lg:bottom-0">
          <CommentSendRow
            value={draft}
            onChange={onDraftChange}
            onSubmit={onPost}
            canSubmit={!!draft.trim()}
            submitting={posting}
            ariaLabel="Guestbook message"
            placeholder={placeholder}
            sendLabel="Post message"
            focusNonce={postedNonce}
          />
        </div>
      ) : (
        <div className="border-t border-border-card-outer/55 px-3 py-2.5 text-sm text-text-muted">
          Login as a player to post guestbook messages.
        </div>
      )}
    </section>
  );
}
