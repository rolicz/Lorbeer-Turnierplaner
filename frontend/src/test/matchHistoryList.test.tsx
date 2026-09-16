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

  it("renders no club *line* in the compact view — the league, the flag and the stars stay out", () => {
    const { container, queryByText } = render(
      <MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} showMeta={false} />,
    );

    // No `MatchSides` block: no league name, no league flag, no star rating.
    expect(queryByText("Bundesliga")).toBeNull();
    expect(container.querySelectorAll(".fi")).toHaveLength(0);
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(0);
  });
});

// --- Q17: the club beside the score, on the app's other match list -----------

/** The three grid cells of a row's score line: left names, numerals, right names. */
function scoreCells(container: HTMLElement) {
  const grid = container.querySelector("[data-score-line]")!.firstElementChild!;
  const [left, numerals, right] = [...grid.children] as HTMLElement[];
  return { left, numerals, right };
}

describe("MatchRowWithClubs club mark (Q17)", () => {
  it("puts each side's club symbol between its own names and the score in Compact", () => {
    const { container } = render(<MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} showMeta={false} />);
    const { left, numerals, right } = scoreCells(container);

    // Left side: the names, then the symbol on their inner edge, against the score.
    expect(left.firstElementChild).toHaveTextContent("Alice");
    expect(left.lastElementChild).toHaveTextContent("BM");
    // Right side mirrors it: symbol first, then the names.
    expect(right.firstElementChild).toHaveTextContent("AJ");
    expect(right.lastElementChild).toHaveTextContent("Bob");
    // And nothing entered the numeral track — that column may not move (Q7/Q8).
    expect(numerals.textContent?.replace(/\s/g, "")).toBe("21");
    expect(numerals.querySelectorAll("img")).toHaveLength(0);
  });

  it("names the club for screen readers, because in Compact the symbol is the whole statement", () => {
    const { container, getByText } = render(
      <MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} showMeta={false} />,
    );
    expect(getByText("Bayern München").className).toContain("sr-only");
    expect(getByText("Ajax").className).toContain("sr-only");
    expect(scoreCells(container).left.lastElementChild).toContainElement(getByText("Bayern München"));
  });

  it("keeps the slot when a side has no club, so every row keeps the same shape", () => {
    const { container } = render(<MatchRowWithClubs m={makeMatch(null, 2)} clubs={CLUBS} showMeta={false} />);
    const { left, right } = scoreCells(container);

    // An inert box of the badge's own size, no symbol and no words: without it this
    // row's names would sit 22px closer to the score than every crested row's.
    expect(left.lastElementChild).toHaveTextContent("");
    expect(left.lastElementChild?.className).toContain("h-4 w-4");
    expect(left.lastElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(left.children).toHaveLength(2);
    expect(right.children).toHaveLength(2);
    expect(right.firstElementChild).toHaveTextContent("AJ");
  });

  it("gives Details no second symbol — its club line already carries one", () => {
    const { container } = render(<MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} showMeta />);
    const { left, right } = scoreCells(container);

    // The score line's name cells are the bare name blocks again.
    expect(left.textContent).toBe("Alice");
    expect(right.textContent).toBe("Bob");
    // Exactly one symbol per side on the row, and it belongs to `MatchSides`.
    const monograms = [...container.querySelectorAll("span")].filter((el) => /^(BM|AJ)$/.test(el.textContent ?? ""));
    expect(monograms).toHaveLength(2);
  });

  it("centres one symbol against a 2v2 side's stacked names instead of spending a line", () => {
    const m = makeMatch(1, 2);
    m.sides[0].players = [{ id: 1, display_name: "Alice" }, { id: 3, display_name: "Cara" }];
    m.sides[1].players = [{ id: 2, display_name: "Bob" }, { id: 4, display_name: "Dan" }];
    const { container } = render(<MatchRowWithClubs m={m} clubs={CLUBS} showMeta={false} />);
    const { left } = scoreCells(container);

    expect(left.children).toHaveLength(2);
    expect(left.firstElementChild?.children).toHaveLength(2); // two name lines
    expect(left.lastElementChild).toHaveTextContent("BM"); // one symbol beside both
    expect(left.className).toContain("items-center");
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

// Q7: the row carries no controls at all any more. The friendlies list was the only
// caller of the `action` / `expanded` slots, and it has a list of its own now — the
// "an editor a row opens sits under the row" rule is tested in `friendlyList.test.tsx`.
describe("MatchRowWithClubs row", () => {
  it("is the score block and nothing else — no action slot, no panel", () => {
    const { container } = render(<MatchRowWithClubs m={makeMatch(1, 2)} clubs={CLUBS} showMeta />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
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
