import { describe, it, expect } from "vitest";
import { computeFavoriteTeammates } from "../pages/profile/favoriteTeammates";
import type { StatsMatch, StatsPlayerMatchesTournament } from "../api/types";

function smatch(
  id: number,
  a: { players: number[]; goals: number },
  b: { players: number[]; goals: number },
  state = "finished",
): StatsMatch {
  return {
    id, leg: 1, order_index: id, state, started_at: null, finished_at: null,
    sides: [
      { id: id * 10 + 1, side: "A", club_id: null, goals: a.goals, players: a.players.map((pid) => ({ id: pid, display_name: `P${pid}` })) },
      { id: id * 10 + 2, side: "B", club_id: null, goals: b.goals, players: b.players.map((pid) => ({ id: pid, display_name: `P${pid}` })) },
    ],
  };
}

function tourney(id: number, matches: StatsMatch[]): StatsPlayerMatchesTournament {
  return { id, name: `T${id}`, date: "2026-01-01", mode: "2v2", status: "finished", cup_stakes: null, matches };
}

describe("computeFavoriteTeammates", () => {
  it("returns [] when there is no target player", () => {
    const t = tourney(1, [smatch(1, { players: [1, 2], goals: 2 }, { players: [3, 4], goals: 1 })]);
    expect(computeFavoriteTeammates([t], null)).toEqual([]);
  });

  it("ignores non-finished matches and 1v1 matches (player has no teammate)", () => {
    const ts = [
      tourney(1, [
        smatch(1, { players: [1, 2], goals: 2 }, { players: [3, 4], goals: 1 }, "playing"), // not finished
        smatch(2, { players: [1], goals: 1 }, { players: [3], goals: 0 }), // 1v1, no teammate
      ]),
    ];
    expect(computeFavoriteTeammates(ts, 1)).toEqual([]);
  });

  it("requires at least 2 shared matches with a teammate", () => {
    const ts = [tourney(1, [smatch(1, { players: [1, 2], goals: 3 }, { players: [3, 4], goals: 0 })])];
    // Only one match with teammate 2 → filtered out.
    expect(computeFavoriteTeammates(ts, 1)).toEqual([]);
  });

  it("aggregates W/D/L and points-per-match for a teammate across matches", () => {
    const ts = [
      tourney(1, [
        smatch(1, { players: [1, 2], goals: 3 }, { players: [3, 4], goals: 0 }), // win
        smatch(2, { players: [1, 2], goals: 1 }, { players: [3, 4], goals: 1 }), // draw
        smatch(3, { players: [2, 1], goals: 0 }, { players: [3, 4], goals: 2 }), // loss (teammate on either order)
      ]),
    ];
    const out = computeFavoriteTeammates(ts, 1);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 2, name: "P2", w: 1, d: 1, l: 1, played: 3 });
    expect(out[0].ppm).toBeCloseTo((1 * 3 + 1) / 3, 6);
  });

  it("ranks teammates by ppm (then played) and keeps only the top 3", () => {
    const ts = [
      tourney(1, [
        // teammate 2: two wins → ppm 3
        smatch(1, { players: [1, 2], goals: 2 }, { players: [9, 10], goals: 0 }),
        smatch(2, { players: [1, 2], goals: 2 }, { players: [9, 10], goals: 0 }),
        // teammate 3: two draws → ppm 1
        smatch(3, { players: [1, 3], goals: 1 }, { players: [9, 10], goals: 1 }),
        smatch(4, { players: [1, 3], goals: 1 }, { players: [9, 10], goals: 1 }),
        // teammate 4: one win one loss → ppm 1.5
        smatch(5, { players: [1, 4], goals: 2 }, { players: [9, 10], goals: 0 }),
        smatch(6, { players: [1, 4], goals: 0 }, { players: [9, 10], goals: 2 }),
        // teammate 5: two losses → ppm 0 (should drop off top-3)
        smatch(7, { players: [1, 5], goals: 0 }, { players: [9, 10], goals: 2 }),
        smatch(8, { players: [1, 5], goals: 0 }, { players: [9, 10], goals: 2 }),
      ]),
    ];
    const out = computeFavoriteTeammates(ts, 1);
    expect(out.map((x) => x.id)).toEqual([2, 4, 3]);
  });
});
