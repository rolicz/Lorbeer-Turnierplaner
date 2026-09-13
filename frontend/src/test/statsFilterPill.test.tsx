import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import StatsFilterPill from "../pages/stats/StatsFilterPill";

function setup(props: Partial<ComponentProps<typeof StatsFilterPill>> = {}) {
  const onModeChange = vi.fn();
  const onScopeChange = vi.fn();
  const utils = render(
    <StatsFilterPill
      mode="overall"
      scope="tournaments"
      onModeChange={onModeChange}
      onScopeChange={onScopeChange}
      showMode
      showScope
      {...props}
    />,
  );
  // The floating capsule; with an `inlineSlot` a second trigger lives outside the container.
  const pill = utils.container.querySelector<HTMLButtonElement>("[data-filtered]") as HTMLButtonElement;
  return { ...utils, pill, onModeChange, onScopeChange };
}

/** The section's chip row hands the pill a slot; the second trigger is portalled into it. */
function setupWithSlot(props: Partial<ComponentProps<typeof StatsFilterPill>> = {}) {
  const slot = document.createElement("span");
  document.body.appendChild(slot);
  const utils = setup({ ...props, inlineSlot: slot });
  return { ...utils, slot, chip: within(slot).getByRole("button") };
}

beforeEach(() => {
  sessionStorage.clear();
});

function openPopover(props: Partial<ComponentProps<typeof StatsFilterPill>> = {}) {
  const utils = setup(props);
  fireEvent.click(utils.pill);
  return { ...utils, panel: utils.getByRole("dialog", { name: "Stats filters" }) };
}

describe("StatsFilterPill", () => {
  it("labels the closed pill with the current values", () => {
    const { pill } = setup({ mode: "1v1", scope: "both" });
    expect(pill).toHaveAttribute("aria-haspopup", "dialog");
    expect(pill).toHaveTextContent("1v1");
    expect(pill).toHaveAccessibleName("Mode: 1v1, Source: Both");
  });

  it("shows 'All' for the overall mode (the URL value stays `overall`)", () => {
    const { pill } = setup();
    expect(pill).toHaveTextContent("All");
    expect(pill).toHaveAccessibleName("Mode: All, Source: Tournaments");
  });

  it("stays closed until it is tapped", () => {
    const { pill, queryByRole } = setup();
    expect(queryByRole("dialog")).toBeNull();
    fireEvent.click(pill);
    expect(pill).toHaveAttribute("aria-expanded", "true");
    expect(queryByRole("dialog", { name: "Stats filters" })).toBeInTheDocument();
  });

  it("offers both chip groups with the current values pressed", () => {
    const { panel } = openPopover({ mode: "2v2", scope: "friendlies" });
    const modeGroup = within(panel).getByRole("group", { name: "Mode" });
    const scopeGroup = within(panel).getByRole("group", { name: "Source" });
    expect(within(modeGroup).getAllByRole("button").map((b) => b.textContent)).toEqual(["All", "1v1", "2v2"]);
    expect(within(scopeGroup).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Tournaments",
      "Both",
      "Friendlies",
    ]);
    expect(within(modeGroup).getByRole("button", { name: "2v2" })).toHaveAttribute("aria-pressed", "true");
    expect(within(scopeGroup).getByRole("button", { name: "Friendlies" })).toHaveAttribute("aria-pressed", "true");
  });

  it("moves focus into the popover when it opens", () => {
    const { panel } = openPopover();
    expect(within(panel).getByRole("button", { name: "All" })).toHaveFocus();
  });

  it("reports a mode change and keeps the popover open", () => {
    const { panel, pill, onModeChange, onScopeChange, getByRole } = openPopover();
    fireEvent.click(within(panel).getByRole("button", { name: "2v2" }));
    expect(onModeChange).toHaveBeenCalledWith("2v2");
    expect(onScopeChange).not.toHaveBeenCalled();
    expect(pill).toHaveAttribute("aria-expanded", "true");
    expect(getByRole("dialog", { name: "Stats filters" })).toBeInTheDocument();
  });

  it("reports a source change", () => {
    const { panel, onModeChange, onScopeChange } = openPopover();
    fireEvent.click(within(panel).getByRole("button", { name: "Friendlies" }));
    expect(onScopeChange).toHaveBeenCalledWith("friendlies");
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it("closes on Escape and returns focus to the pill", () => {
    const { pill, queryByRole } = openPopover();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("dialog")).toBeNull();
    expect(pill).toHaveAttribute("aria-expanded", "false");
    expect(pill).toHaveFocus();
  });

  it("closes on a click outside and on a second tap of the pill", () => {
    const { pill, queryByRole } = openPopover();
    fireEvent.mouseDown(document.body);
    expect(queryByRole("dialog")).toBeNull();

    fireEvent.click(pill);
    expect(queryByRole("dialog", { name: "Stats filters" })).toBeInTheDocument();
    fireEvent.click(pill);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("hides the source group for sections that only use the mode", () => {
    const { pill, panel } = openPopover({ showScope: false });
    expect(pill).toHaveAccessibleName("Mode: All");
    expect(within(panel).getByRole("group", { name: "Mode" })).toBeInTheDocument();
    expect(within(panel).queryByRole("group", { name: "Source" })).toBeNull();
  });

  it("hides the mode group when only the source applies", () => {
    const { pill, panel } = openPopover({ showMode: false });
    expect(pill).toHaveAccessibleName("Source: Tournaments");
    expect(within(panel).getByRole("group", { name: "Source" })).toBeInTheDocument();
    expect(within(panel).queryByRole("group", { name: "Mode" })).toBeNull();
  });

  it("renders nothing when no filter applies (e.g. Cups)", () => {
    const { container, queryByRole } = setup({ showMode: false, showScope: false });
    expect(container).toBeEmptyDOMElement();
    expect(queryByRole("button")).toBeNull();
  });

  // ── S9: a filtered view must be obvious, and the pill must be findable ──────

  it("flags a non-default filter so the pill can mark itself", () => {
    expect(setup().pill).toHaveAttribute("data-filtered", "false");
    expect(setup({ mode: "1v1" }).pill).toHaveAttribute("data-filtered", "true");
    expect(setup({ scope: "friendlies" }).pill).toHaveAttribute("data-filtered", "true");
  });

  it("ignores a filter the section does not use", () => {
    // Positions filters by mode only: a left-over `source` must not mark it filtered.
    const { pill } = setup({ showScope: false, scope: "friendlies" });
    expect(pill).toHaveAttribute("data-filtered", "false");
  });

  it("pulses on the first visit of a browser session only", () => {
    expect(setup().pill).toHaveAttribute("data-pulse", "true");
    expect(sessionStorage.getItem("lk:stats-filter-pulsed")).toBe("1");
    expect(setup().pill).toHaveAttribute("data-pulse", "false");
  });

  it("puts a second trigger in the slot the section provides", () => {
    const { chip, pill } = setupWithSlot({ mode: "2v2" });
    expect(chip).toHaveAccessibleName("Filters — Mode: 2v2, Source: Tournaments");
    expect(chip).toHaveAttribute("aria-haspopup", "dialog");
    expect(chip).toHaveTextContent("Filters");
    expect(pill).toBeInTheDocument();
  });

  it("opens and closes the same popover from the inline chip", () => {
    const { chip, onModeChange } = setupWithSlot();
    fireEvent.mouseDown(chip);
    fireEvent.click(chip);
    const panel = screen.getByRole("dialog", { name: "Stats filters" });
    expect(chip).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(within(panel).getByRole("button", { name: "2v2" }));
    expect(onModeChange).toHaveBeenCalledWith("2v2");
    expect(screen.getByRole("dialog", { name: "Stats filters" })).toBeInTheDocument();

    // Re-tapping the chip closes it (the outside-click guard ignores both triggers).
    fireEvent.mouseDown(chip);
    fireEvent.click(chip);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("returns focus to the trigger that opened it", () => {
    const { chip } = setupWithSlot();
    fireEvent.click(chip);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(chip).toHaveFocus();
  });

  it("renders no inline trigger without a slot", () => {
    const { baseElement } = setup();
    expect(within(baseElement).queryByRole("button", { name: /^Filters — / })).toBeNull();
  });
});
