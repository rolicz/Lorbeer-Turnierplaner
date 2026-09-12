import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { Chip, ChipGroup } from "../ui/primitives/Chip";
import { ChipGroup as ChipGroupFromCharts } from "../pages/stats/charts";

const OPTIONS = [
  { key: "all", label: "All" },
  { key: "1v1", label: "1v1" },
  { key: "2v2", label: "2v2" },
] as const;

describe("Chip", () => {
  it("exposes its selected state and fires onClick", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Chip selected onClick={onClick}>
        Tournaments
      </Chip>,
    );

    const chip = getByRole("button", { name: "Tournaments" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("wears the accent wash when selected", () => {
    const { getByRole } = render(<Chip selected>1v1</Chip>);
    const chip = getByRole("button");
    expect(chip.className).toContain("bg-accent/15");
    expect(chip.className).toContain("text-accent");
  });

  it("keeps a visible surface and hairline when unselected (light-theme contrast)", () => {
    const { getByRole } = render(<Chip>1v1</Chip>);
    const chip = getByRole("button");
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip.className).toContain("bg-bg-card-chip/50");
    expect(chip.className).toContain("border-border-card-chip/40");
  });

  it("carries a 1px edge in both states so selecting never shifts the row", () => {
    const on = render(<Chip selected>x</Chip>).container.querySelector("button")!;
    const off = render(<Chip>x</Chip>).container.querySelector("button")!;
    for (const chip of [on, off]) expect(chip.className.split(" ")).toContain("border");
  });

  it("does not call onClick while disabled", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Chip disabled onClick={onClick}>
        x
      </Chip>,
    );
    fireEvent.click(getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("ChipGroup", () => {
  it("renders one chip per option and marks the current value", () => {
    const { getByRole, getAllByRole } = render(
      <ChipGroup value="1v1" onChange={() => {}} options={[...OPTIONS]} ariaLabel="Mode" />,
    );

    expect(getByRole("group", { name: "Mode" })).toBeInTheDocument();
    expect(getAllByRole("button")).toHaveLength(3);
    expect(getByRole("button", { name: "1v1" })).toHaveAttribute("aria-pressed", "true");
    expect(getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange with the clicked option key", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <ChipGroup value="all" onChange={onChange} options={[...OPTIONS]} ariaLabel="Mode" />,
    );

    fireEvent.click(getByRole("button", { name: "2v2" }));
    expect(onChange).toHaveBeenCalledWith("2v2");
  });

  it("is still re-exported from pages/stats/charts for the existing call sites", () => {
    expect(ChipGroupFromCharts).toBe(ChipGroup);
  });
});
