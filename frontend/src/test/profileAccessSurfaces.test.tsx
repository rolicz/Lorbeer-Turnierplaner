/**
 * L11 — the three surfaces that used to reach a profile **without** a link (the standings
 * row's `div role="button"`, the stats player identity card's `<button>`, the Players admin
 * row's `ListRow onClick`) now go through `PlayerLink`, so each carries a real `href`
 * (middle-click, open in a new tab) and `PlayerLink` alone decides whether it is a door.
 *
 * What is asserted is the shape `AGENTS.md` §9 measures: exactly one `<a>` per player to
 * `/profiles/<id>`, never an `<a>` inside an `<a>`, and no `role="button"` left behind.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { AuthProvider } from "../auth/AuthProvider";
import { qk } from "../api/queryKeys";
import StandingsTable from "../pages/live/StandingsTable";
import PlayerProfile from "../pages/stats/PlayerProfile";
import PlayersAdminPage from "../pages/PlayersAdminPage";
import type { Row } from "../pages/stats/standings";
import { seedSession } from "./authFixtures";

const ROSTER = [
  { id: 1, display_name: "Roli" },
  { id: 4, display_name: "Berni" },
];

function renderSurface(ui: React.ReactNode, path = "/") {
  seedSession({ player_id: 1 });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(qk.players(), ROSTER);
  qc.setQueryData(qk.playerProfiles(), []);
  qc.setQueryData(qk.playerGuestbookSummary(), []);
  qc.setQueryData(qk.playerPokesSummary(), []);
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function profileLinks(container: HTMLElement, id: number) {
  return container.querySelectorAll(`a[href="/profiles/${id}"]`);
}

function row(id: number, name: string): Row {
  return { id, name, pts: 3, rating: 1000, played: 1, wins: 1, draws: 0, losses: 0, gf: 2, ga: 1, gd: 1, form: [3], formAvg: 3 };
}

describe("the three surfaces open a profile through PlayerLink (L11)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline in tests"))));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("the standings row is a stretched link, not a role=button", () => {
    const { container } = renderSurface(
      <StandingsTable tournamentId={1} tournamentMode="1v1" matches={[]} players={ROSTER} tournamentStatus="live" />,
    );
    for (const p of ROSTER) {
      const links = profileLinks(container, p.id);
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAccessibleName(`Open ${p.display_name}'s profile`);
    }
    expect(container.querySelectorAll('[role="button"]').length).toBe(0);
    expect(container.querySelectorAll("a a").length).toBe(0);
  });

  it("the stats player identity card is a link", () => {
    const { container } = renderSurface(
      <PlayerProfile mode="overall" scope="tournaments" rows={[row(1, "Roli"), row(4, "Berni")]} selectedId={4} onSelect={() => {}} />,
    );
    const links = profileLinks(container, 4);
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toContain("Berni");
    expect(container.querySelectorAll("a a").length).toBe(0);
  });

  it("the Players admin row is a stretched link", async () => {
    const { container } = renderSurface(<PlayersAdminPage />, "/players");
    await waitFor(() => expect(screen.getByRole("link", { name: "Open Berni's profile" })).toBeInTheDocument());
    for (const p of ROSTER) expect(profileLinks(container, p.id)).toHaveLength(1);
    expect(container.querySelectorAll("a a").length).toBe(0);
  });
});
