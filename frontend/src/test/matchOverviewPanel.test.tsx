import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import type { Club, Match } from "../api/types";
import MatchOverviewPanel from "../ui/primitives/MatchOverviewPanel";

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

function makeMatch(aClubId: number | null, bClubId: number | null): Match {
  return {
    id: 10,
    tournament_id: 1,
    leg: 1,
    order_index: 0,
    state: "playing",
    started_at: null,
    finished_at: null,
    odds: null,
    sides: [
      { id: 1, side: "A", club_id: aClubId, goals: 1, players: [{ id: 1, display_name: "Alice" }] },
      { id: 2, side: "B", club_id: bClubId, goals: 0, players: [{ id: 2, display_name: "Bob" }] },
    ],
  };
}

describe("MatchOverviewPanel club symbols", () => {
  it("shows a badge per side and a flag for leagues that have a nation", () => {
    const { container, getByText } = render(
      <MatchOverviewPanel match={makeMatch(1, 2)} clubs={CLUBS} aGoals={1} bGoals={0} />,
    );

    // Monogram badges on both sides.
    expect(getByText("BM")).toBeInTheDocument();
    expect(getByText("AJ")).toBeInTheDocument();

    // Bundesliga has a nation, Eredivisie (in this fixture) does not.
    expect(container.querySelectorAll(".fi")).toHaveLength(1);
    expect(container.querySelector(".fi-de")).not.toBeNull();
  });

  it("renders neither badge nor flag for a side without a club", () => {
    const { container, getByText, queryByText } = render(
      <MatchOverviewPanel match={makeMatch(1, null)} clubs={CLUBS} aGoals={0} bGoals={0} />,
    );

    expect(getByText("No club")).toBeInTheDocument();
    expect(queryByText("NC")).toBeNull(); // no monogram for the "No club" label
    expect(container.querySelectorAll(".fi")).toHaveLength(1);
  });
});
