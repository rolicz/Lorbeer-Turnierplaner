import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import type { Club } from "../api/types";
import ClubCombobox from "../ui/ClubCombobox";

const CLUBS: Club[] = [
  {
    id: 1,
    name: "Bayern München",
    game: "EA FC 26",
    star_rating: 5,
    league_id: 3,
    league_name: "Bundesliga",
    league_nation: "de",
  },
  {
    id: 2,
    name: "Ajax",
    game: "EA FC 26",
    star_rating: 4.5,
    league_id: 9,
    league_name: "Eredivisie",
    league_nation: null,
  },
];

beforeAll(() => {
  // The option list scrolls the active row into view; jsdom has no layout.
  Element.prototype.scrollIntoView = vi.fn();
});

describe("ClubCombobox club symbols", () => {
  it("shows a badge for the selected club in the trigger", () => {
    const { getByText } = render(<ClubCombobox value={1} onChange={() => {}} clubs={CLUBS} />);

    expect(getByText("BM")).toBeInTheDocument();
  });

  it("shows a badge per option and a flag for leagues that have a nation", () => {
    const { container } = render(<ClubCombobox value={null} onChange={() => {}} clubs={CLUBS} />);

    const trigger = container.querySelector("button");
    expect(trigger).not.toBeNull();
    fireEvent.click(trigger as HTMLButtonElement);

    // The list renders in a body portal, so query the document, not the container.
    const options = document.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(2);
    expect(options[0]?.textContent).toContain("BM");
    expect(options[1]?.textContent).toContain("AJ");

    // Bundesliga has a nation, Eredivisie (in this fixture) does not.
    expect(document.querySelectorAll(".fi")).toHaveLength(1);
    expect(document.querySelector(".fi-de")).not.toBeNull();
  });
});
