/**
 * Q16 — the club-stars ladder shows all ten rungs, and an unplayed one is not a result.
 *
 * What is pinned here is the difference between "played, scored nothing" and "never
 * played": the first is `1P 0-0-1 / 0.00 ppm` with a bar, the second prints no numeral
 * at all. A regression that re-adds the zeros would still look like a list of ratings,
 * which is why the assertions are about numerals rather than about row count alone.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Club, StatsMatch, StatsPlayerMatchesResponse } from "../api/types";

const getStatsPlayerMatches = vi.fn<() => Promise<StatsPlayerMatchesResponse>>();
const listClubs = vi.fn<() => Promise<Club[]>>();
vi.mock("../api/stats.api", () => ({ getStatsPlayerMatches: () => getStatsPlayerMatches() }));
vi.mock("../api/clubs.api", () => ({ listClubs: () => listClubs() }));

import { StarsSection } from "../pages/stats/StarsView";

const PID = 1;

/** One finished 1v1 match: our player on A with `stars`, and the given goals. */
function match(id: number, stars: number, goals: [number, number]): StatsMatch {
  return {
    id,
    leg: 1,
    order_index: id,
    state: "finished",
    started_at: null,
    finished_at: null,
    sides: [
      { id: id * 10, side: "A", club_id: 1, goals: goals[0], club_stars: stars, players: [{ id: PID, display_name: "Roli" }] },
      { id: id * 10 + 1, side: "B", club_id: 2, goals: goals[1], club_stars: 5, players: [{ id: 2, display_name: "Flo" }] },
    ],
  };
}

function response(matches: StatsMatch[]): StatsPlayerMatchesResponse {
  return {
    generated_at: "2026-09-16T00:00:00",
    scope: "tournaments",
    player: { id: PID, display_name: "Roli" },
    tournaments: [{ id: 7, name: "1. Turnier", date: "2026-09-01", mode: "1v1", status: "done", matches }],
  };
}

function renderStars() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StarsSection mode="overall" scope="tournaments" playerId={PID} />
    </QueryClientProvider>,
  );
}

/** The rows of the ladder, in order. */
function rows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".list-divided > div"));
}

describe("StarsSection — the ladder (Q16)", () => {
  it("lists all ten ratings when only two were ever played", async () => {
    listClubs.mockResolvedValue([]);
    // 5★ once (a loss, so 0 points but a real result) and 2.5★ once (a win).
    getStatsPlayerMatches.mockResolvedValue(response([match(1, 5, [0, 1]), match(2, 2.5, [3, 1])]));

    const { container } = renderStars();
    await waitFor(() => expect(rows(container)).toHaveLength(10));

    const texts = rows(container).map((r) => r.textContent ?? "");
    expect(texts.filter((t) => t.includes("no matches"))).toHaveLength(8);
    // The rung that was played for nothing keeps its zeros — it is a result.
    expect(texts[0]).toContain("1P");
    expect(texts[0]).toContain("0-0-1");
    expect(texts[0]).toContain("0.00");
    expect(texts[5]).toContain("3.00");
  });

  it("prints no numeral on an unplayed rung — no 0P, no 0-0-0, no 0.00, and no bar", async () => {
    listClubs.mockResolvedValue([]);
    getStatsPlayerMatches.mockResolvedValue(response([match(1, 5, [2, 1])]));

    const { container } = renderStars();
    await waitFor(() => expect(rows(container)).toHaveLength(10));

    const unplayed = rows(container).slice(1);
    for (const row of unplayed) {
      // The stars themselves are a `role="img"` label ("4.5 out of 5 stars"), so the
      // digits that may appear in a row's text come from there and nowhere else.
      const visible = (row.textContent ?? "").replace(/no matches/g, "");
      expect(visible).not.toMatch(/\d/);
      expect(row.querySelector("[data-record-line]")).toBeNull();
      expect(row.querySelector(".rounded-r")).toBeNull();
    }
    // The one played rung still draws its bar.
    expect(rows(container)[0].querySelector(".rounded-r")).not.toBeNull();
  });

  it("keeps one set of column widths, so the played rows still line up", async () => {
    listClubs.mockResolvedValue([]);
    getStatsPlayerMatches.mockResolvedValue(response([match(1, 5, [2, 1]), match(2, 1, [0, 3])]));

    const { container } = renderStars();
    await waitFor(() => expect(rows(container)).toHaveLength(10));

    const pads = Array.from(container.querySelectorAll<HTMLElement>("[data-record-seg='played'] .record-num")).map(
      (n) => n.style.getPropertyValue("--record-pad"),
    );
    expect(pads).toHaveLength(2);
    expect(new Set(pads).size).toBe(1);
  });

  it("says how many ratings the matches are spread over, and counts one match in the singular", async () => {
    listClubs.mockResolvedValue([]);
    getStatsPlayerMatches.mockResolvedValue(response([match(1, 4, [2, 1])]));

    renderStars();
    await waitFor(() => expect(screen.getByText(/1 rated match across 1 of 10 ratings\./)).toBeTruthy());
  });

  it("says it in one sentence instead of ten empty rungs when nothing is rated", async () => {
    listClubs.mockResolvedValue([]);
    getStatsPlayerMatches.mockResolvedValue(response([]));

    const { container } = renderStars();
    await waitFor(() => expect(screen.getByText(/No finished matches with rated clubs/)).toBeTruthy());

    expect(rows(container)).toHaveLength(0);
  });
});
