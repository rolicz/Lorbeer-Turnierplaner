import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import GuestbookEntryCard, {
  GuestbookCardProvider,
  type GuestbookCardContextValue,
} from "../pages/profile/GuestbookEntryCard";
import type { GuestbookSubjectKind, PlayerGuestbookEntry, PlayerGuestbookSubject } from "../api/types";

function subject(partial: Partial<PlayerGuestbookSubject> & { kind: GuestbookSubjectKind }): PlayerGuestbookSubject {
  return {
    kind: partial.kind,
    snapshot_id: partial.snapshot_id ?? 7,
    captured_at: partial.captured_at ?? "2026-09-19T10:00:00",
    text: partial.text ?? "",
    has_image: partial.has_image ?? true,
    current: partial.current ?? true,
  };
}

function entry(partial: Partial<PlayerGuestbookEntry> & { id: number }): PlayerGuestbookEntry {
  return {
    id: partial.id,
    profile_player_id: 1,
    author_player_id: 2,
    author_display_name: "Berni",
    parent_entry_id: partial.parent_entry_id ?? null,
    body: partial.body ?? "nice picture",
    created_at: "2026-09-19T10:00:00",
    updated_at: "2026-09-19T10:00:00",
    upvotes: 0,
    downvotes: 0,
    my_vote: 0,
    can_edit: false,
    subject: partial.subject ?? null,
  };
}

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
    canPostGuestbook: false,
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
    cancelEdit: () => {},
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

function renderCard(row: PlayerGuestbookEntry, ctx: GuestbookCardContextValue = context()) {
  return render(
    <GuestbookCardProvider value={ctx}>
      <GuestbookEntryCard entry={row} />
    </GuestbookCardProvider>,
  );
}

describe("the subject chip on a guestbook entry", () => {
  it("names the subject of a current entry and carries its kind", () => {
    const { container } = renderCard(entry({ id: 1, subject: subject({ kind: "header_image" }) }));

    const chip = container.querySelector('button[data-subject="header_image"]');
    expect(chip).toBeTruthy();
    expect(chip?.textContent).toContain("Header image");
    expect(chip?.getAttribute("data-subject-current")).toBe("true");
    expect(chip?.getAttribute("title")).toBe("Show the image this is about");
  });

  it("says 'Earlier …' and drops the current mark once the profile has moved on", () => {
    const { container } = renderCard(
      entry({ id: 2, subject: subject({ kind: "header_image", current: false }) }),
    );

    const chip = container.querySelector('button[data-subject="header_image"]');
    expect(chip?.textContent).toContain("Earlier header image");
    expect(chip?.hasAttribute("data-subject-current")).toBe(false);
  });

  it("opens the snapshot and does not count as reading the message", () => {
    const viewSubject = vi.fn();
    const markRead = vi.fn();
    const s = subject({ kind: "about", text: "hello", has_image: false });
    const { container } = renderCard(
      entry({ id: 3, subject: s }),
      context({ viewSubject, markRead, isUnread: () => true }),
    );

    fireEvent.click(container.querySelector('button[data-subject="about"]') as Element);

    expect(viewSubject).toHaveBeenCalledTimes(1);
    expect(viewSubject).toHaveBeenCalledWith(s);
    expect(markRead).not.toHaveBeenCalled();
  });

  it("renders nothing at all for an untagged entry, and never nests a link in a link", () => {
    const { container } = renderCard(entry({ id: 4 }));

    expect(container.querySelectorAll("[data-subject]").length).toBe(0);
    expect(screen.getByText("nice picture")).toBeInTheDocument();
    expect(container.querySelectorAll("a a").length).toBe(0);
  });
});
