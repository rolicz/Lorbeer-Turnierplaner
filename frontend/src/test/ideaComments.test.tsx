import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import IdeaComments from "../pages/ideas/IdeaComments";
import type { Idea, IdeaComment, IdeaKind, IdeaStatus } from "../api/types";

function idea(over: Partial<Idea> = {}): Idea {
  return {
    id: 1,
    author_player_id: 1,
    author_display_name: "Roli",
    title: "An idea",
    body: "",
    kind: "feature" as IdeaKind,
    status: "new" as IdeaStatus,
    status_note: "",
    areas: ["stats"],
    created_at: "2026-09-01T10:00:00",
    updated_at: "2026-09-01T10:00:00",
    edited_at: null,
    has_image: false,
    image_updated_at: null,
    votes: 0,
    my_vote: 0,
    can_edit: false,
    can_delete: false,
    can_set_status: false,
    comments: [],
    ...over,
  };
}

function comment(over: Partial<IdeaComment> = {}): IdeaComment {
  return {
    id: 1,
    request_id: 1,
    author_player_id: 4,
    author_display_name: "Berni",
    body: "Nice one",
    created_at: "2026-09-01T10:05:00",
    updated_at: "2026-09-01T10:05:00",
    can_delete: false,
    ...over,
  };
}

function renderComments(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const AVATARS = new Map<number, string>();

describe("IdeaComments", () => {
  it("reads '2 comments' and calls onToggle when closed", () => {
    const onToggle = vi.fn();
    const c1 = comment({ id: 1, body: "First comment" });
    const c2 = comment({ id: 2, author_player_id: 5, author_display_name: "Atzi", body: "Second comment" });
    const i = idea({ comments: [c1, c2] });

    renderComments(
      <IdeaComments
        idea={i}
        token="t"
        open={false}
        onToggle={onToggle}
        avatarUpdatedAtByPlayerId={AVATARS}
        onPost={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    const toggle = screen.getByTitle("Show comments");
    expect(toggle.textContent).toContain("2 comments");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("First comment")).toBeNull();

    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("opens with both bodies, the composer present, and posts a trimmed comment", () => {
    const onPost = vi.fn().mockResolvedValue(undefined);
    const c1 = comment({ id: 1, body: "First comment" });
    const c2 = comment({ id: 2, author_player_id: 5, author_display_name: "Atzi", body: "Second comment" });
    const i = idea({ comments: [c1, c2] });

    renderComments(
      <IdeaComments
        idea={i}
        token="t"
        open={true}
        onToggle={vi.fn()}
        avatarUpdatedAtByPlayerId={AVATARS}
        onPost={onPost}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByTitle("Hide comments")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("First comment")).toBeInTheDocument();
    expect(screen.getByText("Second comment")).toBeInTheDocument();

    const field = screen.getByLabelText("Comment on this idea");
    fireEvent.change(field, { target: { value: "  a new one  " } });
    fireEvent.click(screen.getByTitle("Post comment"));

    expect(onPost).toHaveBeenCalledWith(i, "a new one");
  });

  it("shows 'Comment' for a token and nothing for a reader when there are none yet", () => {
    const i = idea({ comments: [] });

    const withToken = renderComments(
      <IdeaComments
        idea={i}
        token="t"
        open={false}
        onToggle={vi.fn()}
        avatarUpdatedAtByPlayerId={AVATARS}
        onPost={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );
    expect(withToken.getByText("Comment")).toBeInTheDocument();

    const { container } = renderComments(
      <IdeaComments
        idea={i}
        token={null}
        open={false}
        onToggle={vi.fn()}
        avatarUpdatedAtByPlayerId={AVATARS}
        onPost={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );
    expect(container.querySelector("button")).toBeNull();
  });

  it("hides the trash unless can_delete says so, and never shows a composer to a reader", () => {
    const mine = comment({ id: 1, can_delete: true, author_display_name: "Roli" });
    const theirs = comment({ id: 2, can_delete: false, author_display_name: "Berni" });
    const i = idea({ comments: [mine, theirs] });

    renderComments(
      <IdeaComments
        idea={i}
        token={null}
        open={true}
        onToggle={vi.fn()}
        avatarUpdatedAtByPlayerId={AVATARS}
        onPost={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getAllByTitle("Delete comment")).toHaveLength(1);
    expect(screen.queryByLabelText("Comment on this idea")).toBeNull();
  });

  it("uses fmtCount's singular for exactly one comment", () => {
    const i = idea({ comments: [comment({ id: 1 })] });

    renderComments(
      <IdeaComments
        idea={i}
        token="t"
        open={false}
        onToggle={vi.fn()}
        avatarUpdatedAtByPlayerId={AVATARS}
        onPost={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByTitle("Show comments").textContent).toContain("1 comment");
  });
});
