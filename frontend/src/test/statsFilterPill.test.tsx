import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";

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
  const pill = utils.queryAllByRole("button")[0];
  return { ...utils, pill, onModeChange, onScopeChange };
}

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
});
