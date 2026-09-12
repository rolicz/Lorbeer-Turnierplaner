import { describe, expect, it } from "vitest";
import { render, within } from "@testing-library/react";

import ScoreLine from "../ui/primitives/ScoreLine";

function numerals(container: HTMLElement) {
  const left = container.querySelector('[data-score-numeral="left"]');
  const right = container.querySelector('[data-score-numeral="right"]');
  return { left, right };
}

describe("ScoreLine", () => {
  it("renders both numerals, tabular and unboxed, with a hairline separator", () => {
    const { container } = render(
      <ScoreLine leftNames="Flo" rightNames="Atzi" leftGoals={2} rightGoals={1} />,
    );

    const { left, right } = numerals(container);
    expect(left).toHaveTextContent("2");
    expect(right).toHaveTextContent("1");
    // The numerals live in one bold, tabular container — no box, no colon.
    const box = left?.parentElement;
    expect(box?.className).toContain("tabular-nums");
    expect(box?.className).toContain("font-bold");
    expect(container.textContent).not.toContain(":");
    expect(container.querySelector(".w-px")).not.toBeNull();
  });

  it("sizes numerals and names per DESIGN.md §8", () => {
    const cases = [
      { size: "hero", numeral: "text-4xl", name: "text-lg" },
      { size: "md", numeral: "text-2xl", name: "text-base" },
      { size: "sm", numeral: "text-lg", name: "text-sm" },
    ] as const;

    for (const c of cases) {
      const { container } = render(
        <ScoreLine size={c.size} leftNames="Flo" rightNames="Atzi" leftGoals={2} rightGoals={1} />,
      );
      expect(container.querySelector(`[data-score-line="${c.size}"]`)).not.toBeNull();
      expect(numerals(container).left?.parentElement?.className).toContain(c.numeral);
      expect(within(container).getByText("Flo").className).toContain(c.name);
    }
  });

  it("replaces the numerals with a muted dash pair when the match is scheduled", () => {
    const { container } = render(
      <ScoreLine leftNames="Flo" rightNames="Atzi" leftGoals={0} rightGoals={0} state="scheduled" />,
    );

    const { left, right } = numerals(container);
    expect(left).toHaveTextContent("–");
    expect(right).toHaveTextContent("–");
    expect(left?.className).toContain("text-text-muted");
  });

  it("uses 'vs' instead of a dash pair at the sm size", () => {
    const { container, getByText } = render(
      <ScoreLine
        size="sm"
        leftNames="Flo"
        rightNames="Atzi"
        leftGoals={0}
        rightGoals={0}
        state="scheduled"
      />,
    );

    expect(getByText("vs")).toBeInTheDocument();
    expect(numerals(container).left).toBeNull();
  });

  it("emphasises the leading side and mutes the trailing one", () => {
    const { getByText } = render(
      <ScoreLine leftNames="Flo" rightNames="Atzi" leftGoals={3} rightGoals={1} />,
    );

    expect(getByText("Flo").className).toContain("font-semibold");
    expect(getByText("Flo").className).toContain("text-text-normal");
    expect(getByText("Atzi").className).toContain("text-text-muted");
  });

  it("emphasises neither side on a draw or a scheduled match", () => {
    const draw = within(
      render(<ScoreLine leftNames="Flo" rightNames="Atzi" leftGoals={2} rightGoals={2} />).container,
    );
    expect(draw.getByText("Flo").className).toContain("text-text-normal");
    expect(draw.getByText("Atzi").className).toContain("text-text-normal");
    expect(draw.getByText("Atzi").className).not.toContain("text-text-muted");

    const scheduled = within(
      render(
        <ScoreLine leftNames="Roli" rightNames="Berni" leftGoals={0} rightGoals={0} state="scheduled" />,
      ).container,
    );
    expect(scheduled.getByText("Roli").className).toContain("text-text-normal");
    expect(scheduled.getByText("Berni").className).toContain("text-text-normal");
  });

  it("colours only the focus side's numeral with the result token", () => {
    const { container } = render(
      <ScoreLine
        leftNames="Flo"
        rightNames="Atzi"
        leftGoals={2}
        rightGoals={1}
        focus="left"
        result="W"
      />,
    );

    const { left, right } = numerals(container);
    expect(left?.className).toContain("text-win");
    expect(right?.className).toContain("text-text-normal");
    expect(right?.className).not.toContain("text-loss");
  });

  it("maps draw and loss to their own tokens", () => {
    const draw = render(
      <ScoreLine leftNames="Flo" rightNames="Atzi" leftGoals={1} rightGoals={1} focus="right" result="D" />,
    );
    expect(numerals(draw.container).right?.className).toContain("text-draw");

    const loss = render(
      <ScoreLine leftNames="Flo" rightNames="Atzi" leftGoals={0} rightGoals={2} focus="left" result="L" />,
    );
    expect(numerals(loss.container).left?.className).toContain("text-loss");
  });

  it("renders no result badge unless asked for", () => {
    const { container } = render(
      <ScoreLine leftNames="Flo" rightNames="Atzi" leftGoals={2} rightGoals={1} focus="left" result="W" />,
    );
    expect(container.querySelector("[data-score-result-badge]")).toBeNull();
  });

  it("puts the result badge at the outer edge of the focus side", () => {
    const { container } = render(
      <ScoreLine
        size="sm"
        leftNames="Flo"
        rightNames="Atzi"
        leftGoals={0}
        rightGoals={2}
        focus="right"
        result="W"
        resultBadge
      />,
    );

    const badge = within(container).getByLabelText("Win");
    expect(badge).toHaveTextContent("W");
    expect(badge.className).toContain("text-micro");
    expect(badge.className).toContain("text-win");
    // Last child of the row = the right (outer) edge.
    const row = container.querySelector('[data-score-line="sm"] > div');
    expect(row?.lastElementChild).toBe(badge);
  });

  it("stacks both names of a 2v2 side", () => {
    const { getByText } = render(
      <ScoreLine
        leftNames={["Flo", "Rumpi"]}
        rightNames={["Atzi", "Berni"]}
        leftGoals={4}
        rightGoals={2}
      />,
    );

    expect(getByText("Flo").parentElement).toBe(getByText("Rumpi").parentElement);
    expect(getByText("Flo").parentElement?.children).toHaveLength(2);
    expect(getByText("Atzi").parentElement?.children).toHaveLength(2);
  });

  it("shows the status line on hero only", () => {
    const hero = within(
      render(
        <ScoreLine size="hero" leftNames="Flo" rightNames="Atzi" leftGoals={1} rightGoals={0} status="Live · 34'" />,
      ).container,
    );
    expect(hero.getByText("Live · 34'")).toBeInTheDocument();

    const md = within(
      render(
        <ScoreLine size="md" leftNames="Flo" rightNames="Atzi" leftGoals={1} rightGoals={0} status="Live · 34'" />,
      ).container,
    );
    expect(md.queryByText("Live · 34'")).toBeNull();
  });
});
