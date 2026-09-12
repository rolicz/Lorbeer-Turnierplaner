import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import type { Club, StatsMatch, StatsPlayerMatchesTournament } from "../api/types";
import { MatchHistoryList, MatchRowWithClubs, tournamentMatchHref } from "../pages/stats/MatchHistoryList";

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

  it("renders the real crest image instead of the monogram when one is stored", () => {
    const clubs: Club[] = [
      { ...CLUBS[0], crest_updated_at: "2026-08-07T20:00:00Z" },
      CLUBS[1],
    ];
    const { container, queryByText, getByText } = render(
      <MatchRowWithClubs m={makeMatch(1, 2)} clubs={clubs} showMeta />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("/clubs/1/crest");
    expect(queryByText("BM")).toBeNull(); // crest replaces the monogram
    expect(getByText("AJ")).toBeInTheDocument(); // no crest → monogram stays
  });

  it("renders no club meta at all in the compact view", () => {
    const { container, queryByText } = render(
      <MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} showMeta={false} />,
    );

    expect(queryByText("BM")).toBeNull();
    expect(container.querySelectorAll(".fi")).toHaveLength(0);
  });
});

function makeTournament(id: number, status: string): StatsPlayerMatchesTournament {
  return {
    id,
    name: status === "friendly" ? `Friendly #${Math.abs(id)}` : `Tournament ${id}`,
    date: "2026-08-01",
    mode: "1v1",
    status,
    cup_stakes: null,
    matches: [makeMatch(1, 2)],
  };
}

describe("MatchHistoryList match links", () => {
  it("renders a link to the match detail page when matchHref is given", () => {
    const { getByRole } = render(
      <MemoryRouter>
        <MatchHistoryList
          tournaments={[makeTournament(19, "done")]}
          clubs={CLUBS}
          showMeta={false}
          matchHref={tournamentMatchHref}
        />
      </MemoryRouter>,
    );

    const link = getByRole("link", { name: "Open match" });
    expect(link).toHaveAttribute("href", "/live/19/match/10");
  });

  it("renders no link for friendly rows (synthetic tournament id, no detail page)", () => {
    const { queryByRole } = render(
      <MemoryRouter>
        <MatchHistoryList
          tournaments={[makeTournament(-1000001, "friendly")]}
          clubs={CLUBS}
          showMeta={false}
          matchHref={tournamentMatchHref}
        />
      </MemoryRouter>,
    );

    expect(queryByRole("link")).toBeNull();
  });

  it("renders no link at all without matchHref", () => {
    const { queryByRole } = render(
      <MemoryRouter>
        <MatchHistoryList tournaments={[makeTournament(19, "done")]} clubs={CLUBS} showMeta={false} />
      </MemoryRouter>,
    );

    expect(queryByRole("link")).toBeNull();
  });
});
