/**
 * Q-C: where the chat row lives, and when it floats.
 *
 * Two rules, both of them positional, so both are asserted on the DOM rather than trusted:
 *
 * 1. **The chat row is a sibling of the feed, not its last child.** `position: sticky` can
 *    lift a box no higher than the top of its own containing block, so a composer *inside*
 *    the feed is pinned only while the feed's top is high enough on screen — and a profile's
 *    feed starts under a ~490px header. Measured before this change: 375×667 put the row
 *    11px behind the bottom tab bar, and 1280×900 left 3px of it on screen.
 * 2. **One composer is pinned at a time.** A reply and an edit are the same chat row opened
 *    inside the feed, and a pinned composer is opaque and above them, so it covered the row
 *    being typed in (measured: 28 of a 40px reply field at 390px).
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import GuestbookSection, { type GuestbookSectionProps } from "../pages/profile/GuestbookSection";
import CommentComposer, { CommentSendRow } from "../pages/live/comments/CommentComposer";
import type { GuestbookCardContextValue } from "../pages/profile/GuestbookEntryCard";

function context(over: Partial<GuestbookCardContextValue> = {}): GuestbookCardContextValue {
  return {
    childrenByParent: new Map(),
    avatarUpdatedAtByPlayerId: new Map(),
    unreadReplyCountByEntryId: new Map(),
    replyDraftByEntryId: {},
    replyOpenEntryId: null,
    editDraftByEntryId: {},
    editOpenEntryId: null,
    collapsedEntryIds: new Set<number>(),
    canPostGuestbook: true,
    isUnread: () => false,
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

function props(over: Partial<GuestbookSectionProps> = {}): GuestbookSectionProps {
  return {
    cardContext: context(),
    roots: [],
    loading: false,
    isEmpty: true,
    errors: { load: null, readStatus: null, post: null, remove: null, markRead: null, markAll: null, vote: null },
    unreadCount: 0,
    onJumpUnread: () => {},
    onRequestMarkAllRead: () => {},
    markAllAsked: false,
    markAllCount: 0,
    onCancelMarkAllRead: () => {},
    onConfirmMarkAllRead: () => {},
    markAllPending: false,
    pendingDelete: null,
    pendingDeleteReplyCount: 0,
    deletePending: false,
    onCancelDelete: () => {},
    onConfirmDelete: () => {},
    canPost: true,
    draft: "",
    onDraftChange: () => {},
    onPost: () => {},
    posting: false,
    placeholder: "Write something for Roli…",
    ...over,
  };
}

function renderSection(over: Partial<GuestbookSectionProps> = {}) {
  const { container } = render(<GuestbookSection {...props(over)} />);
  const feed = container.querySelector("[data-guestbook-feed]") as HTMLElement;
  const composer = container.querySelector("[data-guestbook-composer]") as HTMLElement;
  return { container, feed, composer };
}

describe("the guestbook's chat row", () => {
  it("is not inside the feed, so the page column is what it sticks to", () => {
    const { feed, composer } = renderSection();
    expect(feed).toBeTruthy();
    expect(composer).toBeTruthy();
    // The one assertion that matters: a sticky box cannot be lifted above its containing
    // block, and the feed's top is under the profile header.
    expect(feed.contains(composer)).toBe(false);
  });

  it("keeps the feed as the anchor the unread jump scrolls to", () => {
    const { feed } = renderSection();
    expect(feed.id).toBe("profile-section-guestbook");
  });

  it("floats while nothing else is being written", () => {
    const { composer } = renderSection();
    expect(composer.className).toContain("sticky");
    // Q2's keyboard collapse and Q14's bottom reservation ride on these two literals —
    // and it is `pin-clear`, not `nav-clear` (Q-D): a sticky box is pinned to the layout
    // viewport, which iOS does not shrink for the keyboard, so collapsing its offset to 0
    // puts the row *under* the keys. `nav-clear` stays for the `fixed` surfaces.
    expect(composer.className).toContain("bottom-pin-clear");
    expect(composer.className).not.toContain("bottom-nav-clear");
    expect(composer.className).toContain("lg:bottom-0");
    expect(composer.getAttribute("data-pinned")).toBe("");
  });

  it("stops floating while a reply is open, so it cannot cover it", () => {
    const { composer } = renderSection({ cardContext: context({ replyOpenEntryId: 12 }) });
    expect(composer.className).not.toContain("sticky");
    expect(composer.className).not.toContain("bottom-pin-clear");
    expect(composer.getAttribute("data-pinned")).toBe(null);
    // It is still the feed's closing row, hairline and all.
    expect(composer.className).toContain("border-t");
  });

  it("stops floating while an edit is open too", () => {
    const { composer } = renderSection({ cardContext: context({ editOpenEntryId: 12 }) });
    expect(composer.className).not.toContain("sticky");
  });
});

describe("the tournament feed's chat row", () => {
  const base = {
    mode: "comment" as const,
    onModeChange: () => {},
    allowMatchEventModes: false,
    goalTeams: [],
    goalSide: null,
    onGoalSideChange: () => {},
    goalMinute: "",
    onGoalMinuteChange: () => {},
    goalPlayerName: "",
    onGoalPlayerNameChange: () => {},
    shotsA: "",
    onShotsAChange: () => {},
    shotsB: "",
    onShotsBChange: () => {},
    draftBody: "",
    onChangeDraftBody: () => {},
    onSubmit: () => {},
    canSubmit: false,
  };

  it("floats by default and stops while a reply or an edit is open", () => {
    const pinned = render(<CommentComposer {...base} />);
    const a = pinned.container.querySelector("[data-comment-composer]") as HTMLElement;
    expect(a.className).toContain("sticky");
    // `pin-clear`, never `nav-clear`, for the same reason as the guestbook's row (Q-D).
    expect(a.className).toContain("bottom-pin-clear");
    expect(a.className).not.toContain("bottom-nav-clear");

    const loose = render(<CommentComposer {...base} sticky={false} />);
    const b = loose.container.querySelector("[data-comment-composer]") as HTMLElement;
    expect(b.className).not.toContain("sticky");
    expect(b.className).not.toContain("bottom-pin-clear");
    // Welded to the card's bottom edge either way (T3).
    expect(b.className).toContain("rounded-b-2xl");
  });
});

describe("the chat row's field", () => {
  it("caps its growth once, from `maxRows`, so no line is asked for and refused", () => {
    const { container } = render(
      <CommentSendRow value="" onChange={() => {}} onSubmit={() => {}} canSubmit={false} ariaLabel="Comment" />,
    );
    const field = container.querySelector("textarea") as HTMLTextAreaElement;
    // 6 rows × 20px line-height + 16px padding. It used to be spelled twice — this
    // number in the effect and `max-h-32` (128px) on the element — so the sixth line
    // was asked for and refused, and the field scrolled inside itself.
    expect(field.style.maxHeight).toBe("136px");
    expect(field.className).not.toMatch(/max-h-/);
  });
});
