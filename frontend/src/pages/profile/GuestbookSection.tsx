import { Mail, MailOpen, Send } from "lucide-react";

import Button from "../../ui/primitives/Button";
import EmptyState from "../../ui/primitives/EmptyState";
import LoadingPlaceholder from "../../ui/primitives/LoadingPlaceholder";
import Textarea from "../../ui/primitives/Textarea";
import { Pill } from "../../ui/primitives/Pill";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
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
  placeholder,
}: GuestbookSectionProps) {
  return (
    <div className="space-y-3">
      {unreadCount > 0 ? (
        <div className="flex items-center justify-end gap-2">
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
        </div>
      ) : null}
      <ErrorToastOnError error={errors.load} title="Guestbook loading failed" />
      <ErrorToastOnError error={errors.readStatus} title="Guestbook read-status loading failed" />
      <ErrorToastOnError error={errors.post} title="Could not post guestbook message" />
      <ErrorToastOnError error={errors.remove} title="Could not delete guestbook message" />
      <ErrorToastOnError error={errors.markRead} title="Could not mark guestbook entry as read" />
      <ErrorToastOnError error={errors.markAll} title="Could not mark guestbook as read" />
      <ErrorToastOnError error={errors.vote} title="Could not vote guestbook message" />

      {canPost ? (
        <div className="card space-y-2">
          <Textarea
            label="Leave a message"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder={placeholder}
          />
          <div className="flex justify-end">
            <Button type="button" onClick={onPost} disabled={posting || !draft.trim()} title="Post message">
              <Send size={14} className="md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">{posting ? "Posting…" : "Post"}</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="card text-sm text-text-muted">Login as a player to post guestbook messages.</div>
      )}

      {loading ? <LoadingPlaceholder /> : null}
      {!loading && isEmpty ? (
        <EmptyState title="No messages yet." className="card" />
      ) : null}

      <GuestbookCardProvider value={cardContext}>
        <div className="space-y-2">
          {roots.map((entry) => (
            <GuestbookEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      </GuestbookCardProvider>
    </div>
  );
}
