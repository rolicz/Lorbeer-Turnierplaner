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

function makeMatch(
  aClubId: number | null,
  bClubId: number | null,
  goals: [number, number] = [2, 1],
  state = "finished",
): StatsMatch {
  return {
    id: 10,
    leg: 1,
    order_index: 0,
    state,
    started_at: null,
    finished_at: null,
    sides: [
      { id: 1, side: "A", club_id: aClubId, goals: goals[0], players: [{ id: 1, display_name: "Alice" }] },
      { id: 2, side: "B", club_id: bClubId, goals: goals[1], players: [{ id: 2, display_name: "Bob" }] },
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

describe("MatchRowWithClubs score (DESIGN.md §8)", () => {
  it("renders one ScoreLine and no tinted score box", () => {
    const { container } = render(<MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} showMeta />);

    expect(container.querySelectorAll("[data-score-line]")).toHaveLength(1);
    expect(container.querySelector('[data-score-line="md"]')).not.toBeNull();
    expect(container.querySelector(".chip")).toBeNull();
    expect(container.querySelector(".inset")).toBeNull();
    expect(container.textContent).not.toContain(":");
  });

  it("colours only the focus player's numeral with the result", () => {
    const win = render(<MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} focusId={1} showMeta={false} />);
    expect(win.container.querySelector('[data-score-numeral="left"]')?.className).toContain("text-win");
    expect(win.container.querySelector('[data-score-numeral="right"]')?.className).toContain("text-text-normal");

    const loss = render(<MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} focusId={2} showMeta={false} />);
    expect(loss.container.querySelector('[data-score-numeral="right"]')?.className).toContain("text-loss");

    const draw = render(
      <MatchRowWithClubs m={makeMatch(1, 2, [2, 2])} clubs={CLUBS} focusId={1} showMeta={false} />,
    );
    expect(draw.container.querySelector('[data-score-numeral="left"]')?.className).toContain("text-draw");
  });

  it("leaves both numerals plain without a focus player", () => {
    const { container } = render(<MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} showMeta={false} />);
    expect(container.querySelector('[data-score-numeral="left"]')?.className).toContain("text-text-normal");
    expect(container.querySelector("[data-score-result-badge]")).toBeNull();
  });

  it("adds the W/D/L badge in the dense compact rows only", () => {
    const compact = render(<MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} focusId={1} showMeta={false} />);
    expect(compact.container.querySelector("[data-score-result-badge]")?.textContent).toBe("W");

    const details = render(<MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} focusId={1} showMeta />);
    expect(details.container.querySelector("[data-score-result-badge]")).toBeNull();
  });

  it("shows a dash pair instead of numerals for a scheduled match", () => {
    const { container } = render(
      <MatchRowWithClubs m={makeMatch(1, 2, [0, 0], "scheduled")} clubs={CLUBS} showMeta />,
    );
    expect(container.querySelector('[data-score-numeral="left"]')?.textContent).toBe("–");
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

// T8: a row's editor is a panel, not an action — the action slot is `shrink-0`, so a
// 449px editor rendered into it is clipped by a 358px row at 390px.
describe("MatchRowWithClubs expanded panel", () => {
  it("renders the expanded panel under the row, outside the action slot", () => {
    const { container, getByTestId } = render(
      <MatchRowWithClubs
        m={makeMatch(1, 2)}
        clubs={CLUBS}
        showMeta
        action={<button type="button">Edit</button>}
        expanded={<div data-testid="editor">editor</div>}
      />,
    );

    const editor = getByTestId("editor");
    const actionSlot = container.querySelector(".shrink-0.self-center");
    expect(actionSlot).not.toBeNull();
    expect(actionSlot?.contains(editor)).toBe(false);
    // It is a sibling *after* the row, so it gets the row's full width.
    const row = container.firstElementChild;
    expect(row?.lastElementChild?.contains(editor)).toBe(true);
    expect(row?.firstElementChild?.contains(editor)).toBe(false);
  });

  it("renders nothing extra without an expanded panel", () => {
    const { container } = render(<MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} showMeta />);
    expect(container.firstElementChild?.children).toHaveLength(1);
  });
});

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
