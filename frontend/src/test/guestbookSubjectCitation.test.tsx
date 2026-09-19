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

describe("the subject citation on a guestbook entry", () => {
  it("cites the pinned picture and still names it in words", () => {
    const { container } = renderCard(entry({ id: 1, subject: subject({ kind: "header_image" }) }));

    const cite = container.querySelector('button[data-subject="header_image"]');
    expect(cite).toBeTruthy();
    expect(cite?.textContent).toContain("Header image");
    expect(cite?.getAttribute("data-subject-current")).toBe("true");
    expect(cite?.getAttribute("title")).toBe("Show the image this is about");

    // The thumbnail is the pinned copy, never the live header image.
    const thumb = cite?.querySelector('img[data-subject-thumb="image"]') as HTMLImageElement;
    expect(thumb).toBeTruthy();
    expect(thumb.getAttribute("src")).toContain("/players/guestbook-subjects/7/image");
    expect(thumb.getAttribute("loading")).toBe("lazy");
    // A banner keeps its own shape; an avatar keeps its own (they are not one crop).
    expect(thumb.className).toContain("aspect-[16/9]");
  });

  it("keeps an avatar square", () => {
    const { container } = renderCard(entry({ id: 2, subject: subject({ kind: "avatar" }) }));

    const thumb = container.querySelector('button[data-subject="avatar"] img') as HTMLImageElement;
    expect(thumb.className).toContain("aspect-square");
    expect(thumb.className).not.toContain("aspect-[16/9]");
  });

  it("quotes the pinned About text instead of showing a picture", () => {
    const { container } = renderCard(
      entry({
        id: 3,
        subject: subject({ kind: "about", has_image: false, text: "Ich bin der Roli.\n\nSeit 2004 dabei." }),
      }),
    );

    const cite = container.querySelector('button[data-subject="about"]');
    expect(cite?.querySelector("img")).toBeNull();
    expect(cite?.textContent).toContain("About text");
    // Quoted, and the author's paragraph breaks collapse into one line of words.
    expect(cite?.querySelector("[data-subject-excerpt]")?.textContent).toBe(
      "\u201cIch bin der Roli. Seit 2004 dabei.\u201d",
    );
  });

  it("says 'Earlier …' and drops the current mark once the profile has moved on", () => {
    const { container } = renderCard(
      entry({ id: 4, subject: subject({ kind: "header_image", current: false }) }),
    );

    const cite = container.querySelector('button[data-subject="header_image"]');
    expect(cite?.textContent).toContain("Earlier header image");
    expect(cite?.hasAttribute("data-subject-current")).toBe(false);
    // The picture is still cited — what changed is that it is no longer on the profile.
    expect(cite?.querySelector("img")).toBeTruthy();
  });

  it("survives a picture that will not load, and keeps saying what it is about", () => {
    const { container } = renderCard(entry({ id: 5, subject: subject({ kind: "header_image" }) }));

    const thumb = container.querySelector('button[data-subject="header_image"] img') as HTMLImageElement;
    fireEvent.error(thumb);

    const cite = container.querySelector('button[data-subject="header_image"]');
    expect(cite?.querySelector("img")).toBeNull();
    expect(cite?.querySelector('[data-subject-thumb="missing"]')).toBeTruthy();
    expect(cite?.textContent).toContain("Header image");
  });

  it("is one tap target that opens the snapshot, and does not count as reading the message", () => {
    const viewSubject = vi.fn();
    const markRead = vi.fn();
    const s = subject({ kind: "about", text: "hello", has_image: false });
    const { container } = renderCard(
      entry({ id: 6, subject: s }),
      context({ viewSubject, markRead, isUnread: () => true }),
    );

    // One mechanism for one job: the whole citation, not a picture plus a button.
    expect(container.querySelectorAll("[data-subject]").length).toBe(1);
    fireEvent.click(container.querySelector('button[data-subject="about"]') as Element);

    expect(viewSubject).toHaveBeenCalledTimes(1);
    expect(viewSubject).toHaveBeenCalledWith(s);
    expect(markRead).not.toHaveBeenCalled();
  });

  it("renders nothing at all for an untagged entry, and never nests a link in a link", () => {
    const { container } = renderCard(entry({ id: 7 }));

    expect(container.querySelectorAll("[data-subject]").length).toBe(0);
    expect(screen.getByText("nice picture")).toBeInTheDocument();
    expect(container.querySelectorAll("a a").length).toBe(0);
  });
});
