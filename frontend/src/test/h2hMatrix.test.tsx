import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Club, StatsH2HPair, StatsH2HResponse } from "../api/types";
import type { PlayerAvatarMeta } from "../api/playerAvatars.api";
import type { Row } from "../pages/stats/standings";

// The view fetches the H2H payload (and, lazily, clubs + avatar meta); stub all
// three so the matrix renders offline.
const api = vi.hoisted(() => ({
  getStatsH2H: vi.fn<() => Promise<StatsH2HResponse>>(),
  getStatsH2HMatches: vi.fn(),
  listClubs: vi.fn<() => Promise<Club[]>>(() => Promise.resolve([])),
  listPlayerAvatarMeta: vi.fn<() => Promise<PlayerAvatarMeta[]>>(() => Promise.resolve([])),
}));
vi.mock("../api/stats.api", () => ({
  getStatsH2H: api.getStatsH2H,
  getStatsH2HMatches: api.getStatsH2HMatches,
}));
vi.mock("../api/clubs.api", () => ({
  listClubs: api.listClubs,
  clubCrestUrl: (id: number) => `/clubs/${id}/crest`,
}));
vi.mock("../api/playerAvatars.api", () => ({
  listPlayerAvatarMeta: api.listPlayerAvatarMeta,
  playerAvatarUrl: (id: number) => `/players/${id}/avatar`,
}));

import H2HView from "../pages/stats/H2HView";

const ROLI = { id: 1, display_name: "Roli" };
const FLO = { id: 2, display_name: "Flo" };

/** Roli 7 – 6 draws – 11 Flo: two digits on both sides, the widest realistic cell. */
const ROLI_FLO: StatsH2HPair = {
  a: ROLI, b: FLO, played: 24, a_wins: 7, draws: 6, b_wins: 11,
  a_gf: 30, a_ga: 40, b_gf: 40, b_ga: 30, win_share_a: 0.29, rivalry_score: 42, dominance_score: 10,
};

function row(id: number, name: string): Row {
  return { id, name, pts: 0, rating: 1000, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, form: [], formAvg: 0 };
}
const ROWS: Row[] = [row(1, "Roli"), row(2, "Flo"), row(3, "Rumpi")];

function response(pairs: StatsH2HPair[]): StatsH2HResponse {
  return {
    generated_at: "2026-09-13T00:00:00", scope: "tournaments", limit: 200, order: "rivalry", player: null,
    rivalries_all: pairs, rivalries_1v1: pairs, rivalries_2v2: [],
    team_rivalries_2v2: [], dominance_1v1: [], best_teammates_2v2: [],
  };
}

async function renderMatrix(pairs: StatsH2HPair[] = [ROLI_FLO]) {
  api.getStatsH2H.mockResolvedValue(response(pairs));
  const onOpenMatchup = vi.fn();
  const onSelect = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <H2HView
          mode="overall"
          scope="tournaments"
          rows={ROWS}
          subView="players"
          selectedId={null}
          onSelect={onSelect}
          onOpenMatchup={onOpenMatchup}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole("group", { name: "Matrix metric" });
  return { ...utils, onOpenMatchup, onSelect };
}

describe("H2H matrix", () => {
  it("shows the W-D-L record by default, with W-D-L as the first metric chip", async () => {
    await renderMatrix();
    const metrics = screen.getByRole("group", { name: "Matrix metric" });
    const chips = within(metrics).getAllByRole("button");
    expect(chips[0]).toHaveTextContent("W-D-L");
    expect(chips[0]).toHaveAttribute("aria-pressed", "true");
    // Roli's row against Flo, and the mirrored cell in Flo's row.
    expect(screen.getByRole("button", { name: "Roli vs Flo: 7-6-11 — open matches" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Flo vs Roli: 11-6-7 — open matches" })).toBeInTheDocument();
  });

  it("advertises the tap and opens the matchup when a cell is tapped", async () => {
    const { onOpenMatchup } = await renderMatrix();
    expect(screen.getByText("Tap a cell for every match between two players.")).toBeInTheDocument();
    const cell = screen.getByRole("button", { name: "Roli vs Flo: 7-6-11 — open matches" });
    expect(cell).toHaveAttribute("title", "Roli vs Flo — open matches");
    fireEvent.click(cell);
    expect(onOpenMatchup).toHaveBeenCalledWith(1, 2);
  });

  it("keeps cells without matches inert and the row header a player selector", async () => {
    const { onSelect } = await renderMatrix();
    // Rumpi has no pairs at all: no cell button mentions him.
    expect(screen.queryByRole("button", { name: /Rumpi vs / })).toBeNull();
    // The row header keeps selecting the player (its visible name is the label).
    const header = within(screen.getByRole("table")).getByRole("button", { name: "Rumpi" });
    expect(header).toHaveAttribute("title", "Show Rumpi's head-to-head");
    fireEvent.click(header);
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("says nothing about tapping when no pair has been played", async () => {
    await renderMatrix([]);
    expect(screen.queryByText("Tap a cell for every match between two players.")).toBeNull();
  });
});
