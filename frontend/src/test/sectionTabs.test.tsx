import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { SectionTabs, type SectionTab } from "../ui/SectionTabs";

type Tab = "overview" | "stats" | "matches";
const TABS: SectionTab<Tab>[] = [
  { key: "overview", label: "Overview" },
  { key: "stats", label: "Stats" },
  { key: "matches", label: "Matches", badge: 3 },
];

describe("SectionTabs", () => {
  it("renders one tab per entry and marks the active one", () => {
    const { getAllByRole, getByRole } = render(
      <SectionTabs tabs={TABS} active="stats" onChange={() => {}} />,
    );

    expect(getAllByRole("tab")).toHaveLength(3);
    expect(getByRole("tab", { name: /Stats/ })).toHaveAttribute("aria-selected", "true");
    expect(getByRole("tab", { name: /Overview/ })).toHaveAttribute("aria-selected", "false");
  });

  it("renders the badge count", () => {
    const { getByText } = render(<SectionTabs tabs={TABS} active="overview" onChange={() => {}} />);
    expect(getByText("3")).toBeInTheDocument();
  });

  it("calls onChange with the clicked tab key", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<SectionTabs tabs={TABS} active="overview" onChange={onChange} />);

    fireEvent.click(getByRole("tab", { name: /Matches/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("matches");
  });

  it("shows no edge fades when the strip is not scrollable", () => {
    const { container } = render(<SectionTabs tabs={TABS} active="overview" onChange={() => {}} />);
    expect(container.querySelector("[data-tabs-fade]")).toBeNull();
  });

  it("shows a right-edge fade once the strip overflows", () => {
    const { container, getByRole } = render(
      <SectionTabs tabs={TABS} active="overview" onChange={() => {}} />,
    );
    const scroller = getByRole("tablist");
    // jsdom has no layout: fake an overflowing strip scrolled to the start.
    Object.defineProperty(scroller, "scrollWidth", { value: 600, configurable: true });
    Object.defineProperty(scroller, "clientWidth", { value: 300, configurable: true });
    fireEvent.scroll(scroller);

    expect(container.querySelector('[data-tabs-fade="right"]')).not.toBeNull();
    expect(container.querySelector('[data-tabs-fade="left"]')).toBeNull();
  });
});
