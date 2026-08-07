import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import type { Club, StatsMatch } from "../api/types";
import { MatchRowWithClubs } from "../pages/stats/MatchHistoryList";

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

function makeMatch(aClubId: number | null, bClubId: number | null): StatsMatch {
  return {
    id: 10,
    leg: 1,
    order_index: 0,
    state: "finished",
    started_at: null,
    finished_at: null,
    sides: [
      { id: 1, side: "A", club_id: aClubId, goals: 2, players: [{ id: 1, display_name: "Alice" }] },
      { id: 2, side: "B", club_id: bClubId, goals: 1, players: [{ id: 2, display_name: "Bob" }] },
    ],
  };
}

describe("MatchRowWithClubs club symbols", () => {
  it("shows a badge per side and a flag for leagues that have a nation", () => {
    const { container, getByText } = render(
      <MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} showMeta />,
    );

    expect(getByText("BM")).toBeInTheDocument();
    expect(getByText("AJ")).toBeInTheDocument();

    // Bundesliga has a nation, Eredivisie (in this fixture) does not.
    expect(container.querySelectorAll(".fi")).toHaveLength(1);
    expect(container.querySelector(".fi-de")).not.toBeNull();
  });

  it("renders neither badge nor flag for a side without a club", () => {
    const { container, getByText, queryByText } = render(
      <MatchRowWithClubs m={makeMatch(1, null)} clubs={CLUBS} showMeta />,
    );

    expect(getByText("No club")).toBeInTheDocument();
    expect(queryByText("NC")).toBeNull();
    expect(container.querySelectorAll(".fi")).toHaveLength(1);
  });

  it("renders no club meta at all in the compact view", () => {
    const { container, queryByText } = render(
      <MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} showMeta={false} />,
    );

    expect(queryByText("BM")).toBeNull();
    expect(container.querySelectorAll(".fi")).toHaveLength(0);
  });
});
