import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Club, StatsRecord, StatsRecordsResponse } from "../api/types";
import type { CupDef } from "../api/cup.api";
import type { PlayerAvatarMeta } from "../api/playerAvatars.api";

// The one endpoint this view now reads (M4), plus the clubs it resolves crests
// from; avatar meta and cup defs are stubbed empty so `TitlesGroup`'s identity
// row (`usePlayerAvatarMap`/`useCupHolders`) renders offline.
const api = vi.hoisted(() => ({
  getStatsRecords: vi.fn<() => Promise<StatsRecordsResponse>>(),
  listClubs: vi.fn<() => Promise<Club[]>>(() => Promise.resolve([])),
  listPlayerAvatarMeta: vi.fn<() => Promise<PlayerAvatarMeta[]>>(() => Promise.resolve([])),
  listCupDefs: vi.fn<() => Promise<{ cups: CupDef[] }>>(() => Promise.resolve({ cups: [] })),
}));
vi.mock("../api/stats.api", () => ({
  getStatsRecords: api.getStatsRecords,
}));
vi.mock("../api/clubs.api", () => ({
  listClubs: api.listClubs,
  clubCrestUrl: (id: number) => `/clubs/${id}/crest`,
}));
vi.mock("../api/playerAvatars.api", () => ({
  listPlayerAvatarMeta: api.listPlayerAvatarMeta,
  playerAvatarUrl: (id: number) => `/players/${id}/avatar`,
}));
vi.mock("../api/cup.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/cup.api")>()),
  listCupDefs: api.listCupDefs,
}));

import RecordsView from "../pages/stats/RecordsView";

const ROLI = { id: 1, display_name: "Roli" };
const FLO = { id: 2, display_name: "Flo" };
const BERNI = { id: 3, display_name: "Berni" };
const ATZI = { id: 4, display_name: "Atzi" };

const TOURNAMENT = { id: 42, name: "5. Turnier", date: "2026-05-01", mode: "1v1", status: "done" };
const FRIENDLY = { id: -1000001, name: "Friendly #1", date: "2026-05-02", mode: "1v1", status: "friendly" };

function side(sideKey: "A" | "B", playerRef: { id: number; display_name: string }, goals: number, clubId: number) {
  return { id: playerRef.id, side: sideKey, club_id: clubId, goals, players: [playerRef] };
}

const TOURNAMENT_MATCH = {
  id: 501, leg: 1, order_index: 0, state: "finished", started_at: null, finished_at: null,
  sides: [side("A", ROLI, 5, 10), side("B", FLO, 0, 11)],
};
const FRIENDLY_MATCH = {
  id: 2_000_000_001, leg: 1, order_index: 0, state: "finished", started_at: null, finished_at: null,
  sides: [side("A", BERNI, 5, 12), side("B", ATZI, 0, 13)],
};

function matchRecord(key: string, group: string, label: string, explainer: string, matches: StatsRecord["matches"], holders: StatsRecord["holders"]): StatsRecord {
  return {
    key: key as StatsRecord["key"], group: group as StatsRecord["group"], label, explainer,
    path: `/stats?view=overview&sub=records&record=${key}`,
    value: null, holders, leaders: [], matches,
  };
}

function payload(overrides: Partial<StatsRecordsResponse> = {}): StatsRecordsResponse {
  const records: StatsRecord[] = [
    {
      key: "most_titles", group: "title", label: "Most tournament wins",
      explainer: "Tournaments won, with each player's most recent title.",
      path: "/stats?view=overview&sub=records&record=most_titles",
      value: 2,
      holders: [{ player: ROLI, ongoing: false }],
      leaders: [{ player: ROLI, count: 2, rank: 1, latest: TOURNAMENT }],
      matches: [],
    },
    matchRecord(
      "biggest_win", "match", "Biggest win", "Largest goal difference in a finished match.",
      [
        { tournament: TOURNAMENT, match: TOURNAMENT_MATCH },
        { tournament: FRIENDLY, match: FRIENDLY_MATCH },
      ],
      [
        { player: ROLI, ongoing: false },
        { player: BERNI, ongoing: false },
      ],
    ),
    matchRecord("highest_scoring_match", "match", "Highest-scoring match", "Most goals in one match, both sides together.", [], []),
    matchRecord("most_goals_one_side", "match", "Most goals by one side", "The biggest single-side tally in a match.", [], []),
    matchRecord("biggest_upset", "match", "Biggest upset (by Elo)", "Win against the largest Elo gap between the two sides.", [], []),
  ];
  return {
    generated_at: "2026-09-19T00:00:00", mode: "overall", scope: "tournaments",
    finished_matches: 2, records,
    ...overrides,
  };
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={["/stats?view=overview&sub=records"]}>
      <QueryClientProvider client={client}>
        <RecordsView mode="overall" scope="tournaments" onSelect={vi.fn()} onOpenStreaks={vi.fn()} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("RecordsView", () => {
  it("reads the one /stats/records endpoint and renders the tied matches, a real one linked, a friendly inert", async () => {
    api.getStatsRecords.mockResolvedValue(payload());
    const { container } = renderView();

    await waitFor(() => expect(screen.getByText("Biggest win")).toBeTruthy());
    expect(api.getStatsRecords).toHaveBeenCalledTimes(1);

    // Two matches tie the record.
    expect(screen.getByText("2 tied")).toBeTruthy();

    // The tournament match is a link to its detail page.
    const link = container.querySelector<HTMLAnchorElement>('a[href="/live/42/match/501"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("5. Turnier");

    // The friendly match (negative tournament id) has no detail page — inert.
    expect(container.querySelector('a[href*="2000000001"]')).toBeNull();
    expect(screen.getByText(/Friendly #1/)).toBeTruthy();

    // Both sections carry the anchor id a `?record=` deep link scrolls to.
    expect(container.querySelector("#record-biggest_win")).toBeTruthy();
    expect(container.querySelector("#record-most_titles")).toBeTruthy();
  });

  it("shows the empty state when nothing has finished, not a broken records list", async () => {
    api.getStatsRecords.mockResolvedValue(payload({ finished_matches: 0 }));
    renderView();

    await waitFor(() => expect(screen.getByText("No finished matches yet.")).toBeTruthy());
  });

  it("never nests an anchor inside an anchor (the TitlesGroup stretched-button row)", async () => {
    api.getStatsRecords.mockResolvedValue(payload());
    const { container } = renderView();

    await waitFor(() => expect(screen.getByText("Biggest win")).toBeTruthy());
    expect(container.querySelectorAll("a a").length).toBe(0);
  });
});
