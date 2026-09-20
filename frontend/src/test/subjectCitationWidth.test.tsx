/**
 * W3 — the guestbook citation asks for a thumbnail.
 *
 * A 71x40 citation of a pinned 1920px header used to download the whole pinned copy to
 * draw it (2,662,379 bytes on the dev data, measured). Its two sizes are fixed at every
 * viewport — 71px wide for a banner, 40px square for an avatar, measured unchanged from
 * 320px to 1920px — so unlike the banner it needs one rung and no `srcset`.
 *
 * What must not move: the caption is still there when the picture is not, the About
 * subject still has no picture at all, and the snapshot the citation *opens* is still the
 * full pinned copy (`GuestbookSection` owns that lightbox and passes no width).
 */
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import GuestbookEntryCard, {
  GuestbookCardProvider,
  type GuestbookCardContextValue,
} from "../pages/profile/GuestbookEntryCard";
import { API_BASE } from "../api/client";
import type { GuestbookSubjectKind, PlayerGuestbookEntry, PlayerGuestbookSubject } from "../api/types";

const CAPTURED = "2026-09-19T17:50:11.010559";
const V = "v=2026-09-19T17%3A50%3A11.010559";
const SNAP = `${API_BASE}/players/guestbook-subjects/7/image`;

function setDpr(value: number) {
  Object.defineProperty(window, "devicePixelRatio", { value, configurable: true });
}
afterEach(() => setDpr(1));

function subject(kind: GuestbookSubjectKind, over: Partial<PlayerGuestbookSubject> = {}): PlayerGuestbookSubject {
  return {
    kind,
    snapshot_id: 7,
    captured_at: CAPTURED,
    text: over.text ?? "",
    has_image: over.has_image ?? kind !== "about",
    current: over.current ?? true,
  };
}

function context(): GuestbookCardContextValue {
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
    setEditDraft: () => {},
    submitEdit: () => {},
    toggleCollapse: () => {},
    requestDelete: () => {},
    vote: () => {},
    showVoters: () => {},
    viewSubject: () => {},
    setReplyDraft: () => {},
    submitReply: () => {},
  };
}

function renderCitation(kind: GuestbookSubjectKind, over: Partial<PlayerGuestbookSubject> = {}) {
  const row: PlayerGuestbookEntry = {
    id: 1,
    profile_player_id: 1,
    author_player_id: 2,
    author_display_name: "Berni",
    parent_entry_id: null,
    body: "nice picture",
    created_at: CAPTURED,
    updated_at: CAPTURED,
    upvotes: 0,
    downvotes: 0,
    my_vote: 0,
    can_edit: false,
    subject: subject(kind, over),
  };
  return render(
    <GuestbookCardProvider value={context()}>
      <GuestbookEntryCard entry={row} />
    </GuestbookCardProvider>,
  );
}

function thumbSrc(kind: GuestbookSubjectKind): string | null {
  const { container } = renderCitation(kind);
  const img = container.querySelector('img[data-subject-thumb="image"]');
  return img ? img.getAttribute("src") : null;
}

describe("the guestbook citation asks for a thumbnail (W3)", () => {
  it("asks for the rung its 71px banner needs, at dpr 1 and dpr 3", () => {
    setDpr(1);
    expect(thumbSrc("header_image")).toBe(`${SNAP}?${V}&w=128`);
    setDpr(3);
    expect(thumbSrc("header_image")).toBe(`${SNAP}?${V}&w=256`);
  });

  it("asks for the rung its 40px avatar needs, which is one step smaller", () => {
    setDpr(1);
    expect(thumbSrc("avatar")).toBe(`${SNAP}?${V}&w=64`);
    setDpr(3);
    expect(thumbSrc("avatar")).toBe(`${SNAP}?${V}&w=128`);
  });

  it("needs no srcset, because the thumbnail is the same size on every screen", () => {
    setDpr(3);
    const { container } = renderCitation("header_image");
    const img = container.querySelector('img[data-subject-thumb="image"]')!;
    expect(img.hasAttribute("srcset")).toBe(false);
    expect(img.hasAttribute("sizes")).toBe(false);
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("draws no picture at all for the About text, so it asks for no width either", () => {
    setDpr(3);
    const { container } = renderCitation("about", { has_image: false, text: "Ich bin der Roli." });
    expect(container.querySelector('button[data-subject="about"] img')).toBeNull();
    expect(container.querySelector('button[data-subject="about"]')?.textContent).toContain("About text");
  });

  it("falls back to the kind glyph when the thumbnail will not load, caption intact", () => {
    setDpr(3);
    const { container } = renderCitation("header_image");
    fireEvent.error(container.querySelector('img[data-subject-thumb="image"]') as Element);

    const cite = container.querySelector('button[data-subject="header_image"]');
    expect(cite?.querySelector("img")).toBeNull();
    expect(cite?.querySelector('[data-subject-thumb="missing"]')).toBeTruthy();
    expect(cite?.textContent).toContain("Header image");
  });
});
