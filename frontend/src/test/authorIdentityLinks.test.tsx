/**
 * Q-F — an author's identity is a link, in the guestbook and in the tournament
 * comments feed, as it already was on the Ideas board (N4, `AGENTS.md` §9).
 *
 * The part worth a test is not that a link exists: it is the **guestbook row's two
 * meanings**. That row's `onClick` marks an unread message read — a pointer shortcut
 * Roli decided to keep on 2026-09-23 — and the author's name now sits inside it.
 * `PlayerLink` stops the click from reaching the row, so tapping the name opens the
 * profile and leaves the message unread, while every other pixel of the row still
 * marks it read. A regression in either direction is invisible on screen.
 *
 * The comments feed's rule is the other half: only a *named* author has a profile.
 * "General" is a real category and not a person, so it stays a plain `<div>`.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import GuestbookEntryCard, {
  GuestbookCardProvider,
  type GuestbookCardContextValue,
} from "../pages/profile/GuestbookEntryCard";
import { CommentCard, type CommentCardContextValue } from "../pages/live/TournamentCommentParts";
import type { CommentAuthor, TournamentComment } from "../pages/live/tournamentCommentTypes";
import type { PlayerGuestbookEntry } from "../api/types";

const AUTHOR_ID = 4;

function entry(over: Partial<PlayerGuestbookEntry> = {}): PlayerGuestbookEntry {
  return {
    id: 11,
    profile_player_id: 1,
    author_player_id: AUTHOR_ID,
    author_display_name: "Berni",
    parent_entry_id: null,
    body: "the body of the message",
    created_at: "2026-09-23T10:00:00",
    updated_at: "2026-09-23T10:00:00",
    upvotes: 0,
    downvotes: 0,
    my_vote: 0,
    can_edit: false,
    subject: null,
    ...over,
  };
}

function guestbookContext(over: Partial<GuestbookCardContextValue> = {}): GuestbookCardContextValue {
  return {
    childrenByParent: new Map(),
    avatarUpdatedAtByPlayerId: new Map(),
    unreadReplyCountByEntryId: new Map(),
    replyDraftByEntryId: {},
    replyOpenEntryId: null,
    editDraftByEntryId: {},
    editOpenEntryId: null,
    collapsedEntryIds: new Set<number>(),
    canPostGuestbook: false,
    isUnread: () => true,
    canDelete: () => false,
    canEditEntry: () => false,
    readPending: false,
    votePending: false,
    createPending: false,
    editPending: false,
    voteEnabled: false,
    markRead: () => {},
    toggleReply: () => {},
    cancelReply: () => {},
    toggleEdit: () => {},
    setEditDraft: () => {},
    submitEdit: () => {},
    toggleCollapse: () => {},
    requestDelete: () => {},
    vote: () => {},
    showVoters: () => {},
    viewSubject: () => {},
    setReplyDraft: () => {},
    submitReply: () => {},
    ...over,
  };
}

function renderGuestbook(ctx: GuestbookCardContextValue, row: PlayerGuestbookEntry = entry()) {
  return render(
    <MemoryRouter>
      <GuestbookCardProvider value={ctx}>
        <GuestbookEntryCard entry={row} />
      </GuestbookCardProvider>
    </MemoryRouter>,
  );
}

function comment(over: Partial<TournamentComment> = {}): TournamentComment {
  return {
    id: 5,
    parentId: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    scope: { kind: "tournament" },
    author: { kind: "player", playerId: AUTHOR_ID },
    body: "a comment",
    hasImage: false,
    imageUpdatedAt: null,
    upvotes: 0,
    downvotes: 0,
    myVote: 0,
    canEdit: false,
    ...over,
  };
}

function commentContext(): CommentCardContextValue {
  return {
    seen: { has: () => true },
    canWrite: false,
    canDelete: false,
    players: [],
    currentPlayerId: null,
    currentPlayerName: null,
    avatarUpdatedAtByPlayerId: new Map(),
    authorLabel: (a: CommentAuthor) => (a.kind === "player" ? "Berni" : "General"),
    editingId: null,
    editAuthor: "general",
    editBody: "",
    canSaveEdit: false,
    pinnedTournamentCommentId: null,
    flashId: null,
    replyToId: null,
    replyDraft: "",
    replySubmitting: false,
    onMarkSeen: () => {},
    onTogglePin: () => {},
    onVote: () => {},
    onOpenVoters: () => {},
    onOpenImage: () => {},
    openReply: () => {},
    cancelReply: () => {},
    submitReply: () => {},
    setReplyDraft: () => {},
    toggleEdit: () => {},
    deleteComment: () => {},
    setEditAuthor: () => {},
    setEditBody: () => {},
    saveEdit: () => {},
  };
}

function renderComment(c: TournamentComment) {
  return render(
    <MemoryRouter>
      <CommentCard
        c={c}
        isEditing={false}
        isPinned={false}
        isUnseen={false}
        onMarkSeen={() => {}}
        canPin={false}
        onTogglePin={null}
        canEdit={false}
        onReply={() => {}}
        replyOpen={false}
        onSubmitReply={() => {}}
        childCount={0}
        collapsed={false}
        onToggleCollapse={() => {}}
        onToggleEdit={() => {}}
        onDelete={() => {}}
        onVote={() => {}}
        onOpenVoters={() => {}}
        onSave={() => {}}
        canSubmit={false}
        flash={false}
        ctx={commentContext()}
      />
    </MemoryRouter>,
  );
}

describe("a message's author is a door to their profile (Q-F)", () => {
  it("links the guestbook author's name, and hides the avatar's duplicate link from assistive tech", () => {
    const { container } = renderGuestbook(guestbookContext());

    const named = screen.getByRole("link", { name: "Berni" });
    expect(named).toHaveAttribute("href", `/profiles/${AUTHOR_ID}`);

    const links = Array.from(container.querySelectorAll("a[href^='/profiles/']"));
    expect(links).toHaveLength(2); // the avatar and the name
    const decorative = container.querySelector('a[aria-hidden="true"]');
    expect(decorative).toHaveAttribute("href", `/profiles/${AUTHOR_ID}`);
    expect(decorative).toHaveAttribute("tabindex", "-1");
    // …so only one of the two is a name in the accessibility tree.
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("tapping the author navigates instead of silently marking the message read", () => {
    const markRead = vi.fn();
    renderGuestbook(guestbookContext({ markRead }));

    fireEvent.click(screen.getByRole("link", { name: "Berni" }));
    expect(markRead).not.toHaveBeenCalled();
  });

  it("but the rest of the row still marks it read — Roli kept that shortcut", () => {
    const markRead = vi.fn();
    renderGuestbook(guestbookContext({ markRead }));

    fireEvent.click(screen.getByText("the body of the message"));
    expect(markRead).toHaveBeenCalledWith(11);
  });

  it("links a named comment author the same way", () => {
    const { container } = renderComment(comment());

    expect(screen.getByRole("link", { name: "Berni" })).toHaveAttribute("href", `/profiles/${AUTHOR_ID}`);
    expect(container.querySelectorAll("a[href^='/profiles/']")).toHaveLength(2);
  });

  it("leaves an unattributed comment author as plain text — 'General' is not a person", () => {
    const { container } = renderComment(comment({ author: { kind: "general" } }));

    expect(screen.getByText("General")).toBeTruthy();
    expect(container.querySelectorAll("a[href^='/profiles/']")).toHaveLength(0);
  });

  it("never nests a link in a link, in either feed", () => {
    const gb = renderGuestbook(guestbookContext());
    expect(gb.container.querySelectorAll("a a")).toHaveLength(0);
    gb.unmount();

    const cm = renderComment(comment());
    expect(cm.container.querySelectorAll("a a")).toHaveLength(0);
  });
});
