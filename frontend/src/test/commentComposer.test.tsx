import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import CommentComposer, { CommentSendRow } from "../pages/live/comments/CommentComposer";
import type { CommentCreateMode } from "../pages/live/tournamentCommentTypes";

const GOAL_TEAMS = [
  { side: "A" as const, label: "Rumpi", names: ["Rumpi"], nextA: 1, nextB: 0 },
  { side: "B" as const, label: "Roli", names: ["Roli"], nextA: 0, nextB: 1 },
];

function renderComposer(overrides: Partial<React.ComponentProps<typeof CommentComposer>> = {}) {
  const props: React.ComponentProps<typeof CommentComposer> = {
    mode: "comment" as CommentCreateMode,
    onModeChange: vi.fn(),
    allowMatchEventModes: true,
    goalTeams: GOAL_TEAMS,
    goalSide: null,
    onGoalSideChange: vi.fn(),
    goalMinute: "",
    onGoalMinuteChange: vi.fn(),
    goalPlayerName: "",
    onGoalPlayerNameChange: vi.fn(),
    shotsA: "",
    onShotsAChange: vi.fn(),
    shotsB: "",
    onShotsBChange: vi.fn(),
    draftBody: "",
    onChangeDraftBody: vi.fn(),
    onSubmit: vi.fn(),
    canSubmit: false,
    ...overrides,
  };
  return { ...render(<CommentComposer {...props} />), props };
}

describe("CommentComposer", () => {
  it("is one always-visible row: write and send, no 'Add comment' step", () => {
    const { getByLabelText, getByTitle } = renderComposer({ canSubmit: false });

    expect(getByLabelText("Comment")).toBeInTheDocument();
    expect(getByTitle("Post comment")).toBeDisabled();
  });

  it("enables sending as soon as the draft can be posted", () => {
    const onSubmit = vi.fn();
    const { getByTitle } = renderComposer({ draftBody: "hi", canSubmit: true, onSubmit });

    const send = getByTitle("Post comment");
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("sends on Ctrl+Enter but keeps plain Enter for a newline", () => {
    const onSubmit = vi.fn();
    const { getByLabelText } = renderComposer({ draftBody: "hi", canSubmit: true, onSubmit });

    const field = getByLabelText("Comment");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("offers goal and shots entry only on a match scope", () => {
    const onModeChange = vi.fn();
    const { getByTitle, rerender, queryByTitle } = renderComposer({ onModeChange });

    fireEvent.click(getByTitle("Enter a goal"));
    expect(onModeChange).toHaveBeenCalledWith("goal");
    fireEvent.click(getByTitle("Enter shots"));
    expect(onModeChange).toHaveBeenCalledWith("shots");

    rerender(
      <CommentComposer
        mode="comment"
        onModeChange={onModeChange}
        allowMatchEventModes={false}
        goalTeams={[]}
        goalSide={null}
        onGoalSideChange={vi.fn()}
        goalMinute=""
        onGoalMinuteChange={vi.fn()}
        goalPlayerName=""
        onGoalPlayerNameChange={vi.fn()}
        shotsA=""
        onShotsAChange={vi.fn()}
        shotsB=""
        onShotsBChange={vi.fn()}
        draftBody=""
        onChangeDraftBody={vi.fn()}
        onSubmit={vi.fn()}
        canSubmit={false}
      />,
    );
    expect(queryByTitle("Enter a goal")).toBeNull();
    expect(queryByTitle("Enter shots")).toBeNull();
  });

  it("turns into the goal entry in place, with both sides and the scoreline they make", () => {
    const onGoalSideChange = vi.fn();
    const onModeChange = vi.fn();
    const { getByTitle, getByLabelText, getAllByRole } = renderComposer({
      mode: "goal",
      goalSide: null,
      onGoalSideChange,
      onModeChange,
    });

    // both options show the scoreline they would make, in score numerals
    const options = getAllByRole("radio");
    expect(options).toHaveLength(2);
    expect(options[0].querySelector('[data-score-numeral="left"]')?.textContent).toBe("1");
    expect(options[0].querySelector('[data-score-numeral="right"]')?.textContent).toBe("0");
    expect(options[1].querySelector('[data-score-numeral="left"]')?.textContent).toBe("0");
    expect(options[1].querySelector('[data-score-numeral="right"]')?.textContent).toBe("1");
    expect(options[0]).toHaveAttribute("aria-checked", "false");

    fireEvent.click(getByTitle("Goal for Rumpi — makes it 1–0"));
    expect(onGoalSideChange).toHaveBeenCalledWith("A");

    expect(getByLabelText("Goal minute")).toBeInTheDocument();
    expect(getByLabelText("Goal note")).toBeInTheDocument();

    fireEvent.click(getByTitle("Leave goal entry"));
    expect(onModeChange).toHaveBeenCalledWith("comment");
  });

  it("asks for the footballer who scored, never for a human player", () => {
    const { getByLabelText, container } = renderComposer({
      mode: "goal",
      goalSide: "A",
      goalFallbackScorer: null,
      scorerPlaceholder: "Krankl",
    });

    const scorer = getByLabelText("Goal scorer") as HTMLInputElement;
    // free text, always editable, and nothing is prefilled or suggested from the app's players
    expect(scorer).not.toBeDisabled();
    expect(scorer.value).toBe("");
    expect(scorer.getAttribute("placeholder")).toBe("Krankl");
    expect(scorer.getAttribute("list")).toBeNull();
    expect(container.querySelector("datalist")).toBeNull();
    // the side buttons name the two teams, but nothing offers a human as the scorer
    expect(container.querySelectorAll('[title^="Scorer: "]')).toHaveLength(0);
  });

  it("says where an unnamed goal goes, and only suggests scorers typed before", () => {
    const onGoalPlayerNameChange = vi.fn();
    const { getByText, getByTitle, queryByText, rerender } = renderComposer({
      mode: "goal",
      goalSide: "A",
      goalFallbackScorer: null,
      scorerSuggestions: ["Mbeumo", "Fernandes"],
      onGoalPlayerNameChange,
    });

    expect(getByText("Name the scorer.")).toBeInTheDocument();
    fireEvent.click(getByTitle("Scorer: Mbeumo"));
    expect(onGoalPlayerNameChange).toHaveBeenCalledWith("Mbeumo");

    // once a scorer is named, neither the hint nor the suggestions are in the way
    rerender(
      <CommentComposer
        {...renderComposer({}).props}
        mode="goal"
        goalSide="A"
        goalPlayerName="Mbeumo"
        scorerPlaceholder="Krankl"
        scorerSuggestions={["Mbeumo", "Fernandes"]}
      />,
    );
    expect(queryByText("Name the scorer.")).toBeNull();
  });

  it("says a scorer is needed when the scoring side has no club to credit", () => {
    const { getByText } = renderComposer({ mode: "goal", goalSide: "B", goalFallbackScorer: null });
    expect(getByText("Name the scorer.")).toBeInTheDocument();
  });

  it("turns into the shots entry with one select per team", () => {
    const onShotsAChange = vi.fn();
    const { getByLabelText, queryByLabelText } = renderComposer({ mode: "shots", onShotsAChange });

    expect(getByLabelText("Shots — Rumpi")).toBeInTheDocument();
    expect(getByLabelText("Shots — Roli")).toBeInTheDocument();
    // a shots entry carries no text
    expect(queryByLabelText("Comment")).toBeNull();

    fireEvent.change(getByLabelText("Shots — Rumpi"), { target: { value: "7" } });
    expect(onShotsAChange).toHaveBeenCalledWith("7");
  });

  it("attaches an image only where the viewer may, and shows what is attached", () => {
    const onOpenImageCropper = vi.fn();
    const onClearImage = vi.fn();
    const { queryByTitle } = renderComposer({});
    expect(queryByTitle("Attach image")).toBeNull();

    const attach = renderComposer({ canAttachImage: true, onOpenImageCropper });
    fireEvent.click(attach.getByTitle("Attach image"));
    expect(onOpenImageCropper).toHaveBeenCalledTimes(1);

    const withImage = renderComposer({
      canAttachImage: true,
      imagePreviewUrl: "blob:preview",
      onClearImage,
    });
    expect(withImage.getByText("Image attached (4:3)")).toBeInTheDocument();
    fireEvent.click(withImage.getByTitle("Remove image"));
    expect(onClearImage).toHaveBeenCalledTimes(1);
  });

  it("renders the scope and author controls it is given", () => {
    const { getByText } = renderComposer({
      scopeControl: <div>Match 2 — Rumpi vs Roli</div>,
      authorControl: <button type="button">Roli</button>,
    });

    expect(getByText("Match 2 — Rumpi vs Roli")).toBeInTheDocument();
    expect(getByText("Roli")).toBeInTheDocument();
  });
});

describe("CommentSendRow", () => {
  it("is the reply row too: type and send", () => {
    const onSubmit = vi.fn();
    const { getByLabelText, getByTitle } = render(
      <CommentSendRow
        value="nice one"
        onChange={vi.fn()}
        onSubmit={onSubmit}
        canSubmit
        ariaLabel="Reply to Roli"
        placeholder="Reply to Roli…"
        sendLabel="Post reply"
      />,
    );

    expect(getByLabelText("Reply to Roli")).toBeInTheDocument();
    fireEvent.click(getByTitle("Post reply"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("blocks sending while a reply is in flight", () => {
    const { getByTitle } = render(
      <CommentSendRow
        value="nice one"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        canSubmit
        submitting
        ariaLabel="Reply to Roli"
        sendLabel="Post reply"
      />,
    );

    expect(getByTitle("Post reply")).toBeDisabled();
  });
});

describe("GoalSideChoice", () => {
  it("names both players of a 2v2 side and marks the picked one", () => {
    const { getAllByRole } = renderComposer({
      mode: "goal",
      goalSide: "B",
      goalTeams: [
        { side: "A", label: "Roli/Atzi", names: ["Roli", "Atzi"], nextA: 3, nextB: 2 },
        { side: "B", label: "Flo/Rumpi", names: ["Flo", "Rumpi"], nextA: 2, nextB: 3 },
      ],
    });

    const [a, b] = getAllByRole("radio");
    expect(a.textContent).toContain("Roli");
    expect(a.textContent).toContain("Atzi");
    expect(a).toHaveAttribute("aria-checked", "false");
    expect(b).toHaveAttribute("aria-checked", "true");
    expect(b).toHaveAttribute("aria-label", "Goal for Flo/Rumpi — makes it 2–3");
    // the numeral that goes up is the emphasised one
    expect(b.querySelector('[data-score-numeral="left"]')?.className).toContain("text-text-muted");
    expect(b.querySelector('[data-score-numeral="right"]')?.className ?? "").not.toContain("text-text-muted");
  });
});
