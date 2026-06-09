import { createContext, useContext, type JSX } from "react";

import Button from "../../ui/primitives/Button";
import Textarea from "../../ui/primitives/Textarea";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import VoteButton from "../../ui/primitives/VoteButton";
import type { PlayerGuestbookEntry } from "../../api/types";
import { fmtDateTime } from "../../utils/format";

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
  deleteEntry: (entryId: number) => void;
  vote: (entryId: number, value: -1 | 0 | 1) => void;
  showVoters: (entryId: number) => void;
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
  const surfaceClass = depth === 0 ? "panel-subtle" : "panel-inner";
  const indentPx = Math.min(depth, 8) * 14;

  return (
    <div key={entry.id} className="space-y-2" style={indentPx > 0 ? { marginLeft: `${indentPx}px` } : undefined}>
      <div
        id={`guestbook-entry-${entry.id}`}
        className={`${surfaceClass} p-3 scroll-mt-28 sm:scroll-mt-32`}
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
              <div className="text-[11px] text-text-muted">
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
                title={isCollapsed ? `Show ${children.length} repl${children.length === 1 ? "y" : "ies"}` : "Hide replies"}
                className="h-8 px-2 p-0 inline-flex items-center justify-center gap-1"
              >
                <i className={`fa-solid ${isCollapsed ? "fa-chevron-right" : "fa-chevron-down"}`} aria-hidden="true" />
                <span className="text-[11px] tabular-nums">{children.length}</span>
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
                <i className="fa-solid fa-envelope text-accent motion-safe:animate-pulse" aria-hidden="true" />
              </Button>
            ) : null}
            {!isUnseen && unreadReplies > 0 ? (
              <span
                title={`Unread replies: ${unreadReplies}`}
                className="inline-flex h-8 items-center gap-1 rounded-full border border-border-card-inner bg-bg-card-chip/25 px-2 text-[11px]"
              >
                <i className="fa-solid fa-reply text-accent" aria-hidden="true" />
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
                <i className="fa-solid fa-reply" aria-hidden="true" />
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
                <i className={`fa-solid ${editOpen ? "fa-chevron-up" : "fa-pen"}`} aria-hidden="true" />
              </Button>
            ) : null}
            {canDeleteEntry ? (
              <Button
                type="button"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const hasReplies = children.length > 0;
                  const ok = window.confirm(hasReplies ? "Delete this message and all replies?" : "Delete this message?");
                  if (!ok) return;
                  ctx.deleteEntry(entry.id);
                }}
                title="Delete message"
                className="h-8 w-8 p-0 inline-flex items-center justify-center"
              >
                <i className="fa-solid fa-trash" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
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
        <div className="mt-2 flex items-center gap-2 text-[11px] text-text-muted">
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
            <i className="fa-solid fa-users text-text-muted" aria-hidden="true" />
          </Button>
        </div>

        {replyOpen && ctx.canPostGuestbook ? (
          <div
            className="mt-2 panel-inner p-2 space-y-2"
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
        <div className="space-y-2">
          {children.map((child) => (
            <GuestbookEntryCard key={child.id} entry={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
