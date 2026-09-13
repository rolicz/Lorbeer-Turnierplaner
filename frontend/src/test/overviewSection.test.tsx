import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Match } from "../api/types";
import type { PlayerAvatarMeta } from "../api/playerAvatars.api";

// The winner block shows an avatar; stub the metadata call so it renders offline.
const api = vi.hoisted(() => ({
  listPlayerAvatarMeta: vi.fn<() => Promise<PlayerAvatarMeta[]>>(() => Promise.resolve([])),
}));
vi.mock("../api/playerAvatars.api", () => ({
  listPlayerAvatarMeta: api.listPlayerAvatarMeta,
  playerAvatarUrl: (id: number) => `/players/${id}/avatar`,
}));

import OverviewSection from "../pages/live/OverviewSection";

const PLAYERS = [
  { id: 1, display_name: "Roli" },
  { id: 2, display_name: "Flo" },
  { id: 3, display_name: "Atzi" },
];

let MID = 200;
function match(order: number, state: Match["state"], a: number[], b: number[], ag = 0, bg = 0): Match {
  const name = (id: number) => PLAYERS.find((p) => p.id === id)!.display_name;
  return {
    id: MID++,
    tournament_id: 7,
    leg: 1,
    order_index: order,
    state,
    started_at: null,
    finished_at: null,
    odds: null,
    sides: [
      { id: 1, side: "A", club_id: null, goals: ag, players: a.map((id) => ({ id, display_name: name(id) })) },
      { id: 2, side: "B", club_id: null, goals: bg, players: b.map((id) => ({ id, display_name: name(id) })) },
    ],
  };
}

/** Roli 6 pts, Flo 3, Atzi 0 — a finished round robin. */
const DONE: Match[] = [
  match(0, "finished", [1], [2], 3, 1),
  match(1, "finished", [2], [3], 2, 0),
  match(2, "finished", [1], [3], 4, 0),
];

/** Everyone draws everything: three players level on points, goal difference and goals. */
const TIED: Match[] = [
  match(0, "finished", [1], [2], 1, 1),
  match(1, "finished", [2], [3], 1, 1),
  match(2, "finished", [1], [3], 1, 1),
];

/** Two played, one in progress, three to come. */
const LIVE: Match[] = [
  match(0, "finished", [1], [2], 3, 1),
  match(1, "finished", [2], [3], 2, 0),
  match(2, "playing", [1], [3], 1, 1),
  match(3, "scheduled", [2], [1]),
  match(4, "scheduled", [3], [2]),
  match(5, "scheduled", [3], [1]),
];

function renderTab(props: Partial<Parameters<typeof OverviewSection>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onGoToMatches = vi.fn();
  const onGoToStandings = vi.fn();
  const onOpenCurrentMatch = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OverviewSection
          tournamentId={7}
          mode="1v1"
          date="2026-09-11"
          isDone={false}
          decider={{ type: "none" }}
          matches={LIVE}
          players={PLAYERS}
          clubs={[]}
          onOpenCurrentMatch={onOpenCurrentMatch}
          onGoToStandings={onGoToStandings}
          onGoToMatches={onGoToMatches}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onGoToMatches, onGoToStandings, onOpenCurrentMatch };
}

const sections = () => screen.getAllByText(/^(Current match|Winner|Standings|Final standings|Next matches|Played matches)$/).map((e) => e.textContent);
const playedHrefs = () => screen.getAllByLabelText("Open match").map((a) => a.getAttribute("href"));
const hrefs = (ms: Match[]) => ms.map((m) => `/live/7/match/${m.id}`);

describe("Overview tab", () => {
  it("leads a live tournament with the current match and ends with what has been played", () => {
    renderTab();
    expect(sections()).toEqual(["Current match", "Standings", "Next matches", "Played matches"]);
    // Only finished matches, in playing order — the one being played is the lead block.
    expect(playedHrefs()).toEqual(hrefs([LIVE[0], LIVE[1]]));
  });

  it("leads a done tournament with the winner and no current match", () => {
    renderTab({ isDone: true, matches: DONE });
    expect(sections()).toEqual(["Winner", "Final standings", "Played matches"]);
    expect(screen.queryByText("Current match")).not.toBeInTheDocument();
    // The winner's points, big, next to the "pts" caption.
    expect(screen.getByText("pts").previousElementSibling).toHaveTextContent("6");
    expect(screen.getByText("2 matches · GD +6")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Roli" })).toHaveAttribute("href", "/profiles/1");
    expect(playedHrefs()).toEqual(hrefs([DONE[0], DONE[1], DONE[2]]));
  });

  it("names the decider winner when the table ends level", () => {
    renderTab({ isDone: true, matches: TIED, decider: { type: "penalties", winner_player_id: 2 } });
    expect(screen.getByText("Tied at the top · won penalties")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Flo" })).toHaveAttribute("href", "/profiles/2");
  });

  it("says so when a tie was never resolved", () => {
    renderTab({ isDone: true, matches: TIED, decider: { type: "none" } });
    expect(screen.getByText("No winner — it ended level at the top.")).toBeInTheDocument();
    expect(screen.getByText(/Atzi · Flo · Roli finished on the same points/)).toBeInTheDocument();
  });

  it("lists every played match, however long, and links to the tab that can act on them", () => {
    const many = Array.from({ length: 8 }, (_, i) => match(i, "finished", [1], [2], 1, 0));
    const { onGoToMatches } = renderTab({ isDone: true, matches: many });
    // No row is hidden, so the link cannot claim to reveal any (T15-D).
    expect(playedHrefs()).toEqual(hrefs(many));
    expect(screen.queryByText(/Show all/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Open Matches/ }));
    expect(onGoToMatches).toHaveBeenCalled();
  });

  it("gives both list blocks the same shape: everything, plus a link that names its tab", () => {
    const { onGoToStandings, onGoToMatches } = renderTab({ isDone: true, matches: DONE });

    // The standings list every player, so neither link may promise extra rows.
    expect(screen.queryByText(/Show all/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Open Results/ }));
    expect(onGoToStandings).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Open Matches/ }));
    expect(onGoToMatches).toHaveBeenCalled();
  });

  it("names the live tab it opens instead of the done one", () => {
    const { onGoToStandings } = renderTab();

    expect(screen.queryByRole("button", { name: /Open Results/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Open Standings/ }));
    expect(onGoToStandings).toHaveBeenCalled();
  });

  it("shows no played block before the first result", () => {
    const draft = [match(0, "scheduled", [1], [2]), match(1, "scheduled", [2], [3])];
    renderTab({ matches: draft });
    expect(sections()).toEqual(["Current match", "Standings", "Next matches"]);
  });
});
