/**
 * W3 — a picture in the comments feed asks for the size it is drawn at.
 *
 * Comment images are the heaviest family in the app (17 MB over 6 files on the dev data)
 * and W1 gave the endpoint its `?w=` without a browser-side width to go with it; this is
 * that width. The box follows the viewport exactly as the profile banner's does — 292px
 * at 390, 926px at 1280, measured — so it takes the banner's treatment rather than a
 * rung: one `srcset`, one `sizes`, and the **original** behind the lightbox, which is the
 * whole reason to shrink the drawn one.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { CommentCard, type CommentCardContextValue } from "../pages/live/TournamentCommentParts";
import type { TournamentComment } from "../pages/live/tournamentCommentTypes";
import { API_BASE } from "../api/client";

const UPDATED = "2026-02-13T23:47:46.219206";
const IMG = `${API_BASE}/comments/14/image`;
const V = "v=2026-02-13T23%3A47%3A46.219206";

const comment: TournamentComment = {
  id: 14,
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  scope: { kind: "tournament" },
  author: { kind: "general" },
  body: "look at this",
  hasImage: true,
  imageUpdatedAt: UPDATED,
  upvotes: 0,
  downvotes: 0,
  myVote: 0,
  canEdit: false,
};

function context(over: Partial<CommentCardContextValue> = {}): CommentCardContextValue {
  return {
    token: null,
    seen: { has: () => true },
    canWrite: false,
    canDelete: false,
    players: [],
    currentPlayerId: null,
    currentPlayerName: null,
    avatarUpdatedAtByPlayerId: new Map(),
    authorLabel: () => "Anonymous",
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
    ...over,
  };
}

function renderCard(ctx: CommentCardContextValue = context()) {
  return render(
    <CommentCard
      c={comment}
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
      ctx={ctx}
    />,
  );
}

describe("a comment image asks for the size it is drawn at (W3)", () => {
  it("offers the four rungs its column can reach, each with a matching descriptor", () => {
    const { container } = renderCard();
    const img = container.querySelector("img[data-comment-image]") as HTMLImageElement;
    expect(img).toBeTruthy();

    const candidates = img.getAttribute("srcset")!.split(", ");
    expect(candidates).toEqual([
      `${IMG}?${V}&w=384 384w`,
      `${IMG}?${V}&w=768 768w`,
      `${IMG}?${V}&w=1152 1152w`,
      `${IMG}?${V}&w=1536 1536w`,
    ]);
    for (const c of candidates) {
      const [url, descriptor] = c.split(" ");
      expect(`${new URL(url, "http://x").searchParams.get("w")}w`).toBe(descriptor);
    }
  });

  it("says how wide the box is, and falls back to the rung both real screens pick", () => {
    const { container } = renderCard();
    const img = container.querySelector("img[data-comment-image]") as HTMLImageElement;

    expect(img.getAttribute("sizes")).toBe(
      "(min-width: 1024px) 1040px, (min-width: 640px) calc(100vw - 104px), calc(100vw - 96px)",
    );
    expect(img.getAttribute("src")).toBe(`${IMG}?${V}&w=1152`);
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("opens the original — the lightbox is handed a URL with no `w=` at all", () => {
    const onOpenImage = vi.fn();
    const { container } = renderCard(context({ onOpenImage }));
    fireEvent.click(container.querySelector('button[title="Open image"]') as Element);

    expect(onOpenImage).toHaveBeenCalledTimes(1);
    expect(onOpenImage).toHaveBeenCalledWith(`${IMG}?${V}`);
    expect(onOpenImage.mock.calls[0][0]).not.toContain("w=");
  });
});
