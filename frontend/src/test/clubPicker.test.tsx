import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";

import type { Club } from "../api/types";
import ClubPicker, { ClubSlot } from "../ui/ClubPicker";
import { useClubFilters } from "../ui/clubControls";

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
}: {
  aClub?: number | null;
  bClub?: number | null;
  activeKey?: "A" | "B";
  onPick?: (key: "A" | "B", clubId: number | null) => void;
  onActiveKeyChange?: (key: "A" | "B") => void;
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
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("ClubSlot", () => {
  it("shows the selected club with its symbol and league", () => {
    const { getByRole, getByText } = render(
      <ClubSlot label="Roli" clubs={CLUBS} clubId={1} onOpen={() => {}} />,
    );

    const slot = getByRole("button", { name: "Roli — Bayern München" });
    expect(within(slot).getByText("Bayern München")).toBeInTheDocument();
    expect(within(slot).getByText("Bundesliga")).toBeInTheDocument();
    // Monogram badge (no crest file in the fixture).
    expect(getByText("BM")).toBeInTheDocument();
  });

  it("invites a pick when no club is set", () => {
    const onOpen = vi.fn();
    const { getByRole } = render(<ClubSlot label="Flo" clubs={CLUBS} clubId={null} onOpen={onOpen} />);

    const slot = getByRole("button", { name: "Flo — select club" });
    expect(within(slot).getByText("Select club")).toBeInTheDocument();
    fireEvent.click(slot);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
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

  it("lets the sheet switch between both sides", () => {
    const onActiveKeyChange = vi.fn();
    const { getByRole } = render(<Harness onActiveKeyChange={onActiveKeyChange} />);

    const flo = getByRole("button", { name: "Flo" });
    expect(getByRole("button", { name: "Roli" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(flo);
    expect(onActiveKeyChange).toHaveBeenCalledWith("B");
  });

  it("narrows the list through the shared star filter", () => {
    render(<Harness />);

    fireEvent.click(document.querySelector('[aria-label="Filter by stars"]') as HTMLElement);
    const option = Array.from(document.querySelectorAll('[role="option"]')).find(
      (el) => el.textContent?.trim() === "5★",
    );
    fireEvent.click(option as HTMLElement);

    const rows = Array.from(document.querySelectorAll('[role="option"]'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain("Bayern München");
  });
});
