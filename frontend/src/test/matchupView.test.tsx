import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { StatsH2HMatchesRequest } from "../api/stats.api";
import type { Club, StatsH2HMatchesResponse, StatsMatch, StatsPlayerMatchesTournament } from "../api/types";
import type { PlayerAvatarMeta } from "../api/playerAvatars.api";
import type { Row } from "../pages/stats/standings";

// The view talks to three APIs (matches, clubs, avatar meta); stub all of them so
// the test needs no network and can assert the exact request shape.
const api = vi.hoisted(() => ({
  getStatsH2HMatches: vi.fn<(req: StatsH2HMatchesRequest) => Promise<StatsH2HMatchesResponse>>(),
  listClubs: vi.fn<() => Promise<Club[]>>(),
  listPlayerAvatarMeta: vi.fn<() => Promise<PlayerAvatarMeta[]>>(),
}));
vi.mock("../api/stats.api", () => ({ getStatsH2HMatches: api.getStatsH2HMatches }));
vi.mock("../api/clubs.api", () => ({
  listClubs: api.listClubs,
  clubCrestUrl: (id: number) => `/clubs/${id}/crest`,
}));
vi.mock("../api/playerAvatars.api", () => ({
  listPlayerAvatarMeta: api.listPlayerAvatarMeta,
  playerAvatarUrl: (id: number) => `/players/${id}/avatar`,
}));

import MatchupView from "../pages/stats/h2h/MatchupView";

const ROLI = { id: 1, display_name: "Roli" };
const FLO = { id: 2, display_name: "Flo" };
const RUMPI = { id: 3, display_name: "Rumpi" };

function match(id: number, aGoals: number, bGoals: number, aPlayers = [ROLI], bPlayers = [FLO]): StatsMatch {
  return {
    id,
    leg: 1,
    order_index: 0,
    state: "finished",
    started_at: null,
    finished_at: null,
    sides: [
      { id: id * 10, side: "A", club_id: null, goals: aGoals, players: aPlayers },
      { id: id * 10 + 1, side: "B", club_id: null, goals: bGoals, players: bPlayers },
    ],
  };
}

function tournament(id: number, name: string, matches: StatsMatch[]): StatsPlayerMatchesTournament {
  return { id, name, date: "2026-05-0" + id, mode: "1v1", status: "done", cup_stakes: null, matches };
}

// Roli vs Flo: 3:1 W, 0:2 L (newest first) in one tournament, 2:2 D in the other.
const AGAINST = [
  tournament(1, "Maiturnier", [match(101, 3, 1), match(102, 0, 2)]),
  tournament(2, "Aprilturnier", [match(103, 2, 2)]),
];
// Roli and Flo on the same side, once, won 4:0.
const TOGETHER = [tournament(3, "Duoturnier", [match(201, 4, 0, [ROLI, FLO], [RUMPI, { id: 4, display_name: "Berni" }])])];

function response(req: StatsH2HMatchesRequest, tournaments: StatsPlayerMatchesTournament[]): StatsH2HMatchesResponse {
  return {
    generated_at: "2026-09-12T00:00:00",
    mode: req.mode,
    relation: req.relation,
    scope: req.scope ?? "tournaments",
    left_player_ids: req.left_player_ids,
    right_player_ids: req.right_player_ids ?? [],
    tournaments,
  };
}

const ROWS: Row[] = [
  { id: 1, name: "Roli", pts: 0, rating: 1000, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, form: [], formAvg: 0 },
  { id: 2, name: "Flo", pts: 0, rating: 1000, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, form: [], formAvg: 0 },
];

function renderView(props: Partial<React.ComponentProps<typeof MatchupView>> = {}) {
  const onBack = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <MatchupView mode="overall" scope="tournaments" leftId={1} rightId={2} rows={ROWS} onBack={onBack} {...props} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...utils, onBack };
}

describe("MatchupView", () => {
  beforeEach(() => {
    api.getStatsH2HMatches.mockReset();
    api.getStatsH2HMatches.mockImplementation((req) =>
      Promise.resolve(response(req, req.relation === "teammates" ? TOGETHER : AGAINST)),
    );
    api.listClubs.mockResolvedValue([]);
    api.listPlayerAvatarMeta.mockResolvedValue([]);
  });

  it("requests the two players on opposite sides, with subset matching", async () => {
    renderView({ mode: "1v1", scope: "both" });

    await waitFor(() => expect(api.getStatsH2HMatches).toHaveBeenCalled());
    expect(api.getStatsH2HMatches).toHaveBeenCalledWith({
      mode: "1v1",
      relation: "opposed",
      left_player_ids: [1],
      right_player_ids: [2],
      exact_teams: false,
      scope: "both",
    });
  });

  it("summarises the matches from the left player's perspective", async () => {
    const { container } = renderView();

    // Played / W-D-L / goals / ppm / win% / current run.
    expect(await screen.findByText("Played")).toBeInTheDocument();
    const tiles = Array.from(container.querySelectorAll(".inset")).map((el) => el.textContent);
    expect(tiles).toContain("3Played");
    expect(tiles).toContain("1-1-1W-D-L");
    expect(tiles).toContain("5:5Goals");
    expect(tiles).toContain("1.33Pts / match");
    expect(tiles).toContain("33%Win %");
    // Newest match (3:1) was a win, the one before a loss → a run of one.
    expect(tiles).toContain("W1Current run");

    // Last 5, oldest → newest.
    const chips = screen.getByLabelText("Recent results (oldest first)");
    expect(Array.from(chips.children).map((c) => c.textContent)).toEqual(["D", "L", "W"]);
  });

  it("lists every meeting, grouped by tournament, with links to the match pages", async () => {
    renderView();

    expect(await screen.findByText("Matches · 3")).toBeInTheDocument();
    expect(screen.getByText("Maiturnier")).toBeInTheDocument();
    expect(screen.getByText("Aprilturnier")).toBeInTheDocument();
    const hrefs = screen.getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs.filter((h) => h?.startsWith("/live/"))).toEqual([
      "/live/1/match/101",
      "/live/1/match/102",
      "/live/2/match/103",
    ]);
  });

  it("makes both header identities a link to their profile (N4)", async () => {
    renderView();

    await screen.findByText("Matches · 3");
    const profiles = screen
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"))
      .filter((h) => h?.startsWith("/profiles/"));
    expect(profiles).toEqual(["/profiles/1", "/profiles/2"]);
    expect(screen.getByTitle("Open Roli's profile")).toBeInTheDocument();
    expect(screen.getByTitle("Open Flo's profile")).toBeInTheDocument();
  });

  it("opens on the Together relation when the URL asked for it", async () => {
    renderView({ mode: "2v2", initialRelation: "together" });

    await waitFor(() =>
      expect(api.getStatsH2HMatches).toHaveBeenCalledWith({
        mode: "2v2",
        relation: "teammates",
        left_player_ids: [1, 2],
        right_player_ids: [],
        scope: "tournaments",
      }),
    );
    expect(screen.getByRole("button", { name: "Together" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches to the teammates request when Together is picked", async () => {
    renderView();

    await screen.findByText("Matches · 3");
    fireEvent.click(screen.getByRole("button", { name: "Together" }));

    await waitFor(() =>
      expect(api.getStatsH2HMatches).toHaveBeenCalledWith({
        mode: "overall",
        relation: "teammates",
        left_player_ids: [1, 2],
        right_player_ids: [],
        scope: "tournaments",
      }),
    );
    expect(await screen.findByText("Matches · 1")).toBeInTheDocument();
    expect(screen.getByText("Duoturnier")).toBeInTheDocument();
  });

  it("hides the relation chips in 1v1 mode", async () => {
    renderView({ mode: "1v1" });

    await screen.findByText("Matches · 3");
    expect(screen.queryByRole("button", { name: "Together" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Against" })).toBeNull();
  });

  it("explains an empty matchup and offers the way back", async () => {
    api.getStatsH2HMatches.mockImplementation((req) => Promise.resolve(response(req, [])));
    const { onBack } = renderView({ mode: "2v2", scope: "friendlies" });

    expect(await screen.findByText(/No matches between Roli and Flo yet/)).toBeInTheDocument();
    expect(screen.getByText(/\(2v2 · Friendlies\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Head-to-head/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
