/**
 * T15-B — the stake line under a match-history tournament block: which cup was
 * on the line and who went in holding it, once per block.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { CupDef, CupResponse } from "../api/cup.api";
import type { StatsPlayerMatchesTournament } from "../api/types";

const api = vi.hoisted(() => ({
  listCupDefs: vi.fn<() => Promise<{ cups: CupDef[] }>>(),
  getCup: vi.fn<(key?: string | null) => Promise<CupResponse>>(),
}));
vi.mock("../api/cup.api", async (orig) => ({
  ...(await orig<typeof import("../api/cup.api")>()),
  listCupDefs: api.listCupDefs,
  getCup: api.getCup,
}));

import { MatchHistoryList } from "../pages/stats/MatchHistoryList";

const DEFS: CupDef[] = [{ key: "bauernkranz", name: "Bauernkranz", since_date: "2026-01-05" }];

/** Bauernkranz: claimed from nobody in t7, then handed on in t11. */
const CUP: CupResponse = {
  cup: DEFS[0],
  owner: { id: 5, display_name: "Atzi" },
  streak: { tournaments_participated: 1, since: { tournament_id: 11, tournament_name: "T11", date: "2026-03-27" } },
  history: [
    { tournament_id: 7, tournament_name: "T7", date: "2026-01-18", from: { id: 0, display_name: "—" }, to: { id: 4, display_name: "Berni" }, streak_duration: 0 },
    { tournament_id: 11, tournament_name: "T11", date: "2026-03-27", from: { id: 4, display_name: "Berni" }, to: { id: 5, display_name: "Atzi" }, streak_duration: 1 },
  ],
};

function tournament(id: number, stake: { name: string; owner: string } | null): StatsPlayerMatchesTournament {
  return {
    id,
    name: `Tournament ${id}`,
    date: "2026-03-27",
    mode: "1v1",
    status: "done",
    cup_stakes: stake ? [{ key: "bauernkranz", name: stake.name, owner_player_id: 4, owner_player_name: stake.owner }] : null,
    matches: [],
  };
}

function renderList(tournaments: StatsPlayerMatchesTournament[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MatchHistoryList tournaments={tournaments} clubs={[]} showMeta={false} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("cup stake line", () => {
  it("names the defender once per block", async () => {
    api.listCupDefs.mockReset().mockResolvedValue({ cups: DEFS });
    api.getCup.mockReset().mockResolvedValue(CUP);

    renderList([tournament(11, { name: "Bauernkranz", owner: "Berni" })]);

    await waitFor(() => expect(screen.getByText("Bauernkranz at stake · Berni defending")).toBeInTheDocument());
  });

  it("does not invent a defender for the tournament that created the cup", async () => {
    api.listCupDefs.mockReset().mockResolvedValue({ cups: DEFS });
    api.getCup.mockReset().mockResolvedValue(CUP);

    renderList([tournament(7, { name: "Bauernkranz", owner: "Berni" })]);

    await waitFor(() => expect(screen.getByText("Bauernkranz at stake · nobody held it yet")).toBeInTheDocument());
    expect(screen.queryByText(/defending/)).not.toBeInTheDocument();
  });

  it("says nothing — and asks the server nothing — when no cup was at stake", () => {
    api.listCupDefs.mockReset().mockResolvedValue({ cups: DEFS });
    api.getCup.mockReset().mockResolvedValue(CUP);

    renderList([tournament(12, null)]);

    expect(screen.queryByText(/at stake/)).not.toBeInTheDocument();
    expect(api.listCupDefs).not.toHaveBeenCalled();
    expect(api.getCup).not.toHaveBeenCalled();
  });
});
