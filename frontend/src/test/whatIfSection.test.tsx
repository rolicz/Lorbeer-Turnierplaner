import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Match } from "../api/types";
import type { PlayerAvatarMeta } from "../api/playerAvatars.api";

// The tab only needs avatar metadata from the network; stub it so it renders offline.
const api = vi.hoisted(() => ({
  listPlayerAvatarMeta: vi.fn<() => Promise<PlayerAvatarMeta[]>>(() => Promise.resolve([])),
}));
vi.mock("../api/playerAvatars.api", () => ({
  listPlayerAvatarMeta: api.listPlayerAvatarMeta,
  playerAvatarUrl: (id: number) => `/players/${id}/avatar`,
}));

import { AuthProvider } from "../auth/AuthContext";
import WhatIfSection from "../pages/live/WhatIfSection";

const PLAYERS = [
  { id: 1, display_name: "Roli" },
  { id: 2, display_name: "Flo" },
  { id: 3, display_name: "Atzi" },
  { id: 4, display_name: "Rumpi" },
];

let MID = 100;
function match(order: number, state: Match["state"], a: number[], b: number[], ag = 0, bg = 0): Match {
  const name = (id: number) => PLAYERS.find((p) => p.id === id)!.display_name;
  return {
    id: MID++,
    tournament_id: 1,
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

/** The dev-data shape: two played, one in progress, three still to play. */
const MATCHES: Match[] = [
  match(0, "finished", [4], [1], 4, 0),
  match(1, "finished", [2], [3], 4, 4),
  match(2, "playing", [1], [2], 3, 4),
  match(3, "scheduled", [4], [3]),
  match(4, "scheduled", [1], [3]),
  match(5, "scheduled", [2], [4]),
];

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthProvider>
          <WhatIfSection matches={MATCHES} players={PLAYERS} />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const verdict = () => screen.getByText(/they finish/).textContent?.replace(/\s+/g, " ") ?? "";

describe("What if tab", () => {
  it("shows played matches as facts and every other match as a three-way control", () => {
    renderTab();
    // Six matches, four of them still open (the live one included) → four controls.
    expect(screen.getAllByRole("group", { name: /^Result: / })).toHaveLength(4);
    // The two finished matches carry no control.
    expect(screen.queryByRole("group", { name: "Result: Rumpi versus Roli" })).not.toBeInTheDocument();
    expect(screen.getAllByText("played")).toHaveLength(2);
    expect(screen.getByText("live")).toBeInTheDocument();

    // The live match defaults to the score on the board (Flo leads 4:3), not to a win
    // for whoever is behind.
    const liveControl = screen.getByRole("group", { name: "Result: Roli versus Flo" });
    expect(within(liveControl).getByRole("button", { name: "Flo win" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("as it stands")).toBeInTheDocument();
  });

  it("projects the picked player, reacts to an edit and resets back to the best case", () => {
    renderTab();
    fireEvent.click(screen.getByTitle("Roli"));

    expect(verdict()).toContain("Roli wins their last match");
    expect(verdict()).toContain("they finish #3");
    expect(screen.getByText(/Currently #4/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reset to best case/ })).not.toBeInTheDocument();

    // Rumpi–Atzi is the one rival match that decides it: any other result drops Roli.
    const rivalGame = screen.getByRole("group", { name: "Result: Rumpi versus Atzi" });
    expect(within(rivalGame).getByRole("button", { name: "Draw" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(rivalGame).getByRole("button", { name: "Atzi win" }));

    expect(verdict()).toContain("they finish #4");
    expect(screen.getByText("your call")).toBeInTheDocument();
    expect(screen.getByText(/best case #3/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reset to best case/ }));
    expect(verdict()).toContain("they finish #3");
    expect(screen.queryByText("your call")).not.toBeInTheDocument();
    expect(within(rivalGame).getByRole("button", { name: "Draw" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the projected table in sync with the scenario", () => {
    renderTab();
    fireEvent.click(screen.getByTitle("Atzi"));
    // Atzi has 1 point and three matches left, two of them their own → best case 7.
    expect(verdict()).toContain("Atzi wins both of their remaining matches");
    const rows = screen.getAllByText("pts").map((el) => el.parentElement?.textContent?.replace(/\s+/g, " ") ?? "");
    expect(rows.some((r) => r.includes("Atzi") && r.includes("7"))).toBe(true);
  });
});
