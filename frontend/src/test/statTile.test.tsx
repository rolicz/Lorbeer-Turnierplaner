import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import StatTile from "../ui/primitives/StatTile";

describe("StatTile", () => {
  it("renders the label and the value on an inset surface", () => {
    const { container, getByText } = render(<StatTile label="Longest reign" value="×4" />);

    expect(container.firstElementChild?.className).toContain("inset");
    expect(getByText("Longest reign").className).toContain("text-xs");
    expect(getByText("Longest reign").className).toContain("text-text-muted");

    const value = getByText("×4");
    expect(value.className).toContain("text-2xl");
    expect(value.className).toContain("font-bold");
    expect(value.className).toContain("tabular-nums");
  });

  it("renders the hint only when one is given", () => {
    const without = render(<StatTile label="Titles" value={3} />);
    expect(without.queryByText(/held since/i)).toBeNull();

    const { getByText } = render(<StatTile label="Titles" value={3} hint="held since 2026" />);
    expect(getByText("held since 2026").className).toContain("text-text-muted");
  });

  it("renders an accessory next to the label", () => {
    const { getByText } = render(
      <StatTile label="Current reign" value="×2" accessory={<span>record</span>} />,
    );

    const label = getByText("Current reign");
    const accessory = getByText("record");
    expect(label.parentElement).toBe(accessory.parentElement);
  });

  it("appends extra classes from the caller", () => {
    const { container } = render(<StatTile label="Played" value={12} className="col-span-2" />);
    expect(container.firstElementChild?.className).toBe("inset col-span-2");
  });
});
