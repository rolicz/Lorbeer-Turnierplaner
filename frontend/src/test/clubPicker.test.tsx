import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";

import type { Club } from "../api/types";
import { AuthProvider } from "../auth/AuthContext";
import ClubPicker from "../ui/ClubPicker";
import SelectClubsPanel from "../ui/SelectClubsPanel";
import { useClubFilters, useClubSelection } from "../ui/clubControls";

const CLUBS: Club[] = [
  {
    id: 1,
    name: "Bayern München",
    game: "EA FC 26",
    star_rating: 5,
    league_id: 3,
    league_name: "Bundesliga",
    league_nation: "de",
    crest_updated_at: null,
  },
  {
    id: 2,
    name: "Ajax",
    game: "EA FC 26",
    star_rating: 4.5,
    league_id: 9,
    league_name: "Eredivisie",
    league_nation: null,
    crest_updated_at: null,
  },
  {
    id: 3,
    name: "Austria",
    game: "EA FC 26",
    star_rating: 4,
    league_id: 12,
    league_name: "National (Men)",
    league_nation: null,
    crest_updated_at: null,
  },
];

function Harness({
  aClub = null,
  bClub = null,
  activeKey = "A",
  onPick = () => {},
  onActiveKeyChange = () => {},
  starsEditor,
}: {
  aClub?: number | null;
  bClub?: number | null;
  activeKey?: "A" | "B";
  onPick?: (key: "A" | "B", clubId: number | null) => void;
  onActiveKeyChange?: (key: "A" | "B") => void;
  starsEditor?: React.ReactNode;
}) {
  const filters = useClubFilters(CLUBS);
  return (
    <ClubPicker
      open
      onClose={() => {}}
      clubs={CLUBS}
      sides={[
        { key: "A", label: "Roli", clubId: aClub },
        { key: "B", label: "Flo", clubId: bClub },
      ]}
      activeKey={activeKey}
      onActiveKeyChange={onActiveKeyChange}
      onPick={onPick}
      filters={filters}
      starsEditor={starsEditor}
    />
  );
}

/**
 * The T9 shape: one self-contained panel. Collapsed it is a single "Clubs" row;
 * open it holds both club slots, the filters and the two random actions, and the
 * shared sheet is opened from a slot.
 */
function PanelHarness({
  initialA = null,
  initialB = null,
  storageKey,
  defaultOpen = true,
}: {
  initialA?: number | null;
  initialB?: number | null;
  storageKey?: string;
  defaultOpen?: boolean;
}) {
  const [aClub, setAClub] = useState<number | null>(initialA);
  const [bClub, setBClub] = useState<number | null>(initialB);
  const selection = useClubSelection({
    clubs: CLUBS,
    aLabel: "Roli",
    bLabel: "Flo",
    aClub,
    bClub,
    onChangeAClub: setAClub,
    onChangeBClub: setBClub,
    onChangeClubs: (a, b) => {
      setAClub(a);
      setBClub(b);
    },
  });
  return (
    <AuthProvider>
      <SelectClubsPanel selection={selection} storageKey={storageKey} defaultOpen={defaultOpen} />
    </AuthProvider>
  );
}

beforeAll(() => {
  // The active row is scrolled into view; jsdom has no layout.
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  window.localStorage.clear();
});

describe("ClubPicker", () => {
  it("lists every club with a symbol, and a flag for leagues that have a nation", () => {
    render(<Harness />);

    const options = document.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(3);
    expect(document.body.textContent).toContain("Bayern München");
    expect(document.body.textContent).toContain("Ajax");

    // Bundesliga has a nation; Eredivisie (in this fixture) does not. The national
    // team renders its own country flag as the club symbol.
    expect(document.querySelector(".fi-at")).not.toBeNull();
    expect(document.querySelector(".fi-de")).toBeNull();
  });

  it("groups by league while browsing and drops the grouping while searching", () => {
    render(<Harness />);
    expect(document.body.textContent).toContain("Bundesliga");
    expect(document.body.textContent).toContain("Eredivisie");

    fireEvent.change(document.querySelector("input") as HTMLInputElement, { target: { value: "aja" } });

    const options = document.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toContain("Ajax");
    // The flat search list still shows each club's league inside the row.
    expect(options[0]?.textContent).toContain("Eredivisie");
  });

  it("searches the league name too", () => {
    render(<Harness />);
    fireEvent.change(document.querySelector("input") as HTMLInputElement, { target: { value: "bundes" } });

    const options = document.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toContain("Bayern München");
  });

  it("picks a club in one tap and remembers it as recent", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    const option = Array.from(document.querySelectorAll('[role="option"]')).find((el) =>
      el.textContent?.includes("Ajax"),
    );
    fireEvent.click(option as HTMLElement);

    expect(onPick).toHaveBeenCalledWith("A", 2);
    expect(JSON.parse(window.localStorage.getItem("club_picker_recent_v1") ?? "[]")).toEqual([2]);
  });

  it("surfaces recent clubs on top and only when nothing is typed", () => {
    window.localStorage.setItem("club_picker_recent_v1", JSON.stringify([2]));
    render(<Harness />);

    expect(document.body.textContent).toContain("Recent");
    // One extra row for the recent entry, on top of the three league rows.
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(4);

    fireEvent.change(document.querySelector("input") as HTMLInputElement, { target: { value: "a" } });
    expect(document.body.textContent).not.toContain("Recent");
  });

  it("offers 'No club' only for a side that has one", () => {
    const onPick = vi.fn();
    const { rerender, queryByRole, getByRole } = render(<Harness onPick={onPick} />);
    expect(queryByRole("button", { name: "No club" })).toBeNull();

    rerender(<Harness aClub={1} onPick={onPick} />);
    fireEvent.click(getByRole("button", { name: "No club" }));
    expect(onPick).toHaveBeenCalledWith("A", null);
  });

  it("pins the club this side already has on top — listed once, with room for the stars editor", () => {
    const { getByTestId } = render(
      <Harness aClub={1} starsEditor={<span data-testid="stars-editor">4.5★</span>} />,
    );

    expect(document.body.textContent).toContain("Selected");
    expect(getByTestId("stars-editor")).toBeInTheDocument();

    // Bayern is the pinned row and is *not* repeated inside its league group.
    const rows = Array.from(document.querySelectorAll('[role="option"]'));
    expect(rows.filter((el) => el.textContent?.includes("Bayern München"))).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("Bayern München");
    expect(rows[0]).toHaveAttribute("aria-selected", "true");
  });

  it("lets the sheet switch between both sides", () => {
    const onActiveKeyChange = vi.fn();
    const { getByRole } = render(<Harness onActiveKeyChange={onActiveKeyChange} />);

    const flo = getByRole("button", { name: "Flo" });
    expect(getByRole("button", { name: "Roli" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(flo);
    expect(onActiveKeyChange).toHaveBeenCalledWith("B");
  });

  it("keeps the combobox's keyboard control: arrows move, Enter picks", () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    const input = document.querySelector("input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    // Bundesliga (5★) leads the grouping, so row 2 is the Eredivisie 4.5★ club.
    expect(onPick).toHaveBeenCalledWith("A", 2);

    onPick.mockClear();
    fireEvent.change(input, { target: { value: "bayern" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith("A", 1);
  });
});

describe("SelectClubsPanel (T9 — one self-contained panel)", () => {
  it("shows nothing but the trigger while it is collapsed", () => {
    const { getByRole, queryByRole, queryByLabelText } = render(
      <PanelHarness initialA={1} initialB={2} defaultOpen={false} />,
    );

    const trigger = getByRole("button", { name: /Clubs/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    // The summary names the two clubs the panel holds…
    expect(trigger.textContent).toContain("Bayern München · Ajax");
    // …and not one tool is on screen.
    expect(queryByRole("button", { name: /Filter clubs/ })).toBeNull();
    expect(queryByRole("button", { name: "Randomize the star filter" })).toBeNull();
    expect(queryByRole("button", { name: /Random matchup/ })).toBeNull();
    expect(queryByLabelText("Roli — Bayern München")).toBeNull();
  });

  it("summarises an unset side as 'not set'", () => {
    const both = render(<PanelHarness defaultOpen={false} />);
    expect(both.getByRole("button", { name: /Clubs/ }).textContent).toContain("Not set");
    both.unmount();

    const one = render(<PanelHarness initialA={1} defaultOpen={false} />);
    expect(one.getByRole("button", { name: /Clubs/ }).textContent).toContain("Bayern München · not set");
  });

  it("opens one block that holds the clubs, the filters and the randomisers", () => {
    const { getByRole, getByLabelText, queryByRole } = render(
      <PanelHarness initialA={1} initialB={2} defaultOpen={false} />,
    );

    const trigger = getByRole("button", { name: /Clubs/ });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    // Both values, inside the panel, with their league and stars.
    expect(getByLabelText("Roli — Bayern München")).toBeInTheDocument();
    expect(getByLabelText("Flo — Ajax")).toBeInTheDocument();
    expect(getByRole("button", { name: /Filter clubs/ })).toBeInTheDocument();
    expect(getByRole("button", { name: "Randomize the star filter" })).toBeInTheDocument();
    expect(getByRole("button", { name: /Random matchup/ })).toBeInTheDocument();

    // …and the body is one container, tied to the trigger.
    const body = document.getElementById(trigger.getAttribute("aria-controls") ?? "");
    expect(body).not.toBeNull();
    expect(body?.contains(getByLabelText("Roli — Bayern München"))).toBe(true);
    expect(body?.contains(getByRole("button", { name: /Random matchup/ }))).toBe(true);

    fireEvent.click(trigger);
    expect(queryByRole("button", { name: /Random matchup/ })).toBeNull();
  });

  it("picks a club inside the panel: slot → sheet → row", () => {
    const { getByLabelText, getByRole } = render(<PanelHarness initialA={1} initialB={2} />);

    fireEvent.click(getByLabelText("Flo — Ajax"));
    expect(getByRole("button", { name: "Flo" })).toHaveAttribute("aria-pressed", "true");
    // The sheet's subtitle names the side it is picking for.
    expect(document.body.textContent).toContain("Flo · 3 clubs");

    const row = Array.from(document.querySelectorAll('[role="option"]')).find((el) =>
      el.textContent?.includes("Austria"),
    );
    fireEvent.click(row as HTMLElement);
    expect(getByLabelText("Flo — Austria")).toBeInTheDocument();
  });

  it("remembers open/closed per surface", () => {
    const first = render(<PanelHarness storageKey="unit-test" defaultOpen={false} />);
    fireEvent.click(first.getByRole("button", { name: /Clubs/ }));
    expect(window.localStorage.getItem("club_panel_open:unit-test")).toBe("1");
    first.unmount();

    const second = render(<PanelHarness storageKey="unit-test" defaultOpen={false} />);
    expect(second.getByRole("button", { name: /Clubs/ })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(second.getByRole("button", { name: /Clubs/ }));
    expect(window.localStorage.getItem("club_panel_open:unit-test")).toBe("0");
    second.unmount();

    // A stored choice beats the surface's default (the friendly forms open by default).
    const third = render(<PanelHarness storageKey="unit-test" defaultOpen />);
    expect(third.getByRole("button", { name: /Clubs/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("reaches the star/league filters without opening a club", () => {
    const { getByRole, queryByLabelText } = render(<PanelHarness />);

    expect(queryByLabelText("Filter by stars")).toBeNull();
    const trigger = getByRole("button", { name: /Filter clubs/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(queryByLabelText("Filter by stars")).not.toBeNull();
    expect(queryByLabelText("Filter by league")).not.toBeNull();
  });

  it("narrows the picker list through the filters set on the panel", () => {
    const { getByLabelText, getByRole } = render(<PanelHarness />);

    fireEvent.click(getByRole("button", { name: /Filter clubs/ }));
    fireEvent.click(getByLabelText("Filter by stars"));
    const option = Array.from(document.querySelectorAll('[role="option"]')).find(
      (el) => el.textContent?.trim() === "5★",
    );
    fireEvent.click(option as HTMLElement);

    // The active filter is a chip with a ✕ once the row is closed again.
    fireEvent.click(getByRole("button", { name: /Filter clubs/ }));
    expect(getByRole("button", { name: "Clear the star filter" })).toBeInTheDocument();

    // …and the sheet, opened from a slot, lists only what is left.
    fireEvent.click(getByLabelText("Roli — select club"));
    const rows = Array.from(document.querySelectorAll('[role="option"]'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("Bayern München");
    expect(document.querySelector("[data-club-filter-note]")?.textContent).toContain("5★");
  });

  it("balances the two random actions in one row and fills both sides at once", () => {
    const { container, getByRole } = render(<PanelHarness />);

    const dice = getByRole("button", { name: "Randomize the star filter" });
    const random = getByRole("button", { name: /Random matchup/ });
    expect(dice.className).toContain("h-10");
    expect(random.className).toContain("h-10");
    expect(random.className).toContain("flex-1");
    expect(dice.parentElement).toBe(random.parentElement);

    // One tap fills both sides, so neither slot is a placeholder any more.
    expect(container.textContent?.match(/Select club/g)).toHaveLength(2);
    fireEvent.click(random);
    expect(container.textContent).not.toContain("Select club");
  });
});
