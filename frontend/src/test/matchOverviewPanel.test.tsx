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
];

// National teams: the league carries no nation, the club name does.
const NATIONAL_CLUBS: Club[] = [
  {
    id: 3,
    name: "Germany",
    game: "EA FC 26",
    star_rating: 5,
    league_id: 40,
    league_name: "National (Men)",
    league_nation: null,
    crest_updated_at: null,
  },
  {
    id: 4,
    name: "France",
    game: "EA FC 26",
    star_rating: 5,
    league_id: 40,
    league_name: "National (Men)",
    league_nation: null,
    crest_updated_at: null,
  },
  {
    id: 5,
    name: "Atlantis",
    game: "EA FC 26",
    star_rating: 3,
    league_id: 40,
    league_name: "National (Men)",
    league_nation: null,
    crest_updated_at: null,
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

  it("uses the country flag as the club symbol for national teams", () => {
    const { container, queryByText } = render(
      <MatchOverviewPanel match={makeMatch(3, 4)} clubs={NATIONAL_CLUBS} aGoals={2} bGoals={1} />,
    );

    // Flags replace the monograms; the National leagues themselves have no nation.
    expect(container.querySelector(".fi-de")).not.toBeNull();
    expect(container.querySelector(".fi-fr")).not.toBeNull();
    expect(container.querySelectorAll(".fi")).toHaveLength(2);
    expect(queryByText("GE")).toBeNull();
    expect(queryByText("FR")).toBeNull();
  });

  it("falls back to the monogram for an unmapped national club", () => {
    const { container, getByText } = render(
      <MatchOverviewPanel match={makeMatch(3, 5)} clubs={NATIONAL_CLUBS} aGoals={0} bGoals={0} />,
    );

    expect(container.querySelectorAll(".fi")).toHaveLength(1); // only Germany
    expect(getByText("AT")).toBeInTheDocument(); // "Atlantis" keeps its disc
  });
});
