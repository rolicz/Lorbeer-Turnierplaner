import { describe, it, expect } from "vitest";
import {
  avgLast,
  buildPlayerColorMap,
  clampWindow,
  colorForIdx,
  monthTicksBetween,
  pointsForPlayerInMatch,
  pooledPpm,
  winnerSide,
} from "../pages/stats/trendsMath";
import type { Match } from "../api/types";

function match(partial: {
  state?: string;
  a?: { players: number[]; goals: number };
  b?: { players: number[]; goals: number };
}): Match {
  const a = partial.a ?? { players: [1], goals: 0 };
  const b = partial.b ?? { players: [2], goals: 0 };
  return {
    id: 1,
    tournament_id: 1,
    leg: 1,
    order_index: 0,
    state: (partial.state ?? "finished") as Match["state"],
    started_at: null,
    finished_at: null,
    odds: null,
    sides: [
      { id: 1, side: "A", club_id: null, goals: a.goals, players: a.players.map((id) => ({ id, display_name: `P${id}` })) },
      { id: 2, side: "B", club_id: null, goals: b.goals, players: b.players.map((id) => ({ id, display_name: `P${id}` })) },
    ],
  };
}

describe("winnerSide", () => {
  it("returns the higher-scoring side", () => {
    expect(winnerSide(match({ a: { players: [1], goals: 3 }, b: { players: [2], goals: 1 } }))).toBe("A");
    expect(winnerSide(match({ a: { players: [1], goals: 0 }, b: { players: [2], goals: 2 } }))).toBe("B");
  });
  it("returns null for a draw or unfinished match", () => {
    expect(winnerSide(match({ a: { players: [1], goals: 1 }, b: { players: [2], goals: 1 } }))).toBeNull();
    expect(winnerSide(match({ state: "playing" }))).toBeNull();
  });
});

describe("pointsForPlayerInMatch", () => {
  it("awards 3 for a win, 0 for a loss, 1 for a draw", () => {
    const m = match({ a: { players: [1], goals: 2 }, b: { players: [2], goals: 0 } });
    expect(pointsForPlayerInMatch(m, 1)).toBe(3);
    expect(pointsForPlayerInMatch(m, 2)).toBe(0);
    const draw = match({ a: { players: [1], goals: 1 }, b: { players: [2], goals: 1 } });
    expect(pointsForPlayerInMatch(draw, 1)).toBe(1);
  });
  it("returns null when the player is not in the match or it is unfinished", () => {
    const m = match({ a: { players: [1], goals: 2 }, b: { players: [2], goals: 0 } });
    expect(pointsForPlayerInMatch(m, 99)).toBeNull();
    expect(pointsForPlayerInMatch(match({ state: "scheduled" }), 1)).toBeNull();
  });
});

describe("avgLast", () => {
  it("averages over the last n, padding missing with 0 (divides by n)", () => {
    expect(avgLast([3, 3, 3], 3)).toBe(3);
    expect(avgLast([3], 3)).toBeCloseTo(1); // 3 / 3
    expect(avgLast([], 5)).toBe(0);
  });
});

describe("pooledPpm", () => {
  const timeline = [
    { pts: 3, played: 1 }, // T1: 3.0 ppm
    { pts: 1, played: 2 }, // T2: 0.5 ppm
    { pts: 4, played: 2 }, // T3: 2.0 ppm
  ];

  it("pools points over matches (not the mean of per-tournament ratios)", () => {
    // T1+T2 pooled = 4 / 3 ≈ 1.33, whereas the mean of ratios would be (3.0+0.5)/2 = 1.75.
    expect(pooledPpm(timeline.slice(0, 2))).toBeCloseTo(4 / 3);
  });

  it("equals the cumulative PPM when the window covers every tournament", () => {
    const totalPts = timeline.reduce((a, b) => a + b.pts, 0);
    const totalPlayed = timeline.reduce((a, b) => a + b.played, 0);
    const cumulative = totalPts / totalPlayed; // 8 / 5
    // A window large enough to cover all tournaments must match the cumulative value.
    expect(pooledPpm(timeline.slice(-5))).toBeCloseTo(cumulative);
    expect(pooledPpm(timeline)).toBeCloseTo(cumulative);
  });

  it("returns null when there are no matches", () => {
    expect(pooledPpm([])).toBeNull();
    expect(pooledPpm([{ pts: 0, played: 0 }])).toBeNull();
  });
});

describe("clampWindow", () => {
  it("keeps a window within the domain", () => {
    const r = clampWindow(50, 100, 0, 1000);
    expect(r.start).toBe(50);
    expect(r.end).toBe(150);
  });
  it("shifts a window that overflows the domain end", () => {
    const r = clampWindow(950, 100, 0, 1000);
    expect(r.end).toBe(1000);
    expect(r.start).toBe(900);
  });
  it("clamps a window starting before the domain", () => {
    const r = clampWindow(-50, 100, 0, 1000);
    expect(r.start).toBe(0);
  });
});

describe("colorForIdx", () => {
  it("produces distinct hues and the expected shape", () => {
    const c = colorForIdx(0, 4);
    expect(c).toHaveProperty("solid");
    expect(c).toHaveProperty("muted");
    expect(c).toHaveProperty("outline");
    expect(colorForIdx(0, 4).solid).not.toBe(colorForIdx(1, 4).solid);
  });
});

describe("buildPlayerColorMap", () => {
  it("assigns a stable colour per player id regardless of input order", () => {
    const a = buildPlayerColorMap([3, 1, 2]);
    const b = buildPlayerColorMap([1, 2, 3]);
    expect(a.get(1)!.solid).toBe(b.get(1)!.solid);
    expect(a.get(2)!.solid).toBe(b.get(2)!.solid);
    expect(a.get(3)!.solid).toBe(b.get(3)!.solid);
  });
  it("gives distinct colours to distinct players and dedups ids", () => {
    const m = buildPlayerColorMap([10, 20, 20, 30]);
    expect(m.size).toBe(3);
    expect(new Set([m.get(10)!.solid, m.get(20)!.solid, m.get(30)!.solid]).size).toBe(3);
  });
});

describe("monthTicksBetween", () => {
  it("returns month-boundary ticks within the range", () => {
    const start = new Date(2024, 0, 15).getTime();
    const end = new Date(2024, 3, 5).getTime();
    const ticks = monthTicksBetween(start, end);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.every((t) => typeof t.label === "string")).toBe(true);
  });
  it("returns empty for an invalid/empty range", () => {
    expect(monthTicksBetween(100, 100)).toEqual([]);
  });
});
