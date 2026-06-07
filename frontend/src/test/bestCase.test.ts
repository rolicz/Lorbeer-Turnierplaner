import { describe, it, expect } from "vitest";
import { computeBestCase } from "../pages/live/bestCase";
import type { Match } from "../api/types";

let MID = 1;
function match(state: Match["state"], a: number[], b: number[], ag = 0, bg = 0): Match {
  return {
    id: MID++,
    tournament_id: 1,
    leg: 1,
    order_index: 0,
    state,
    started_at: null,
    finished_at: null,
    odds: null,
    sides: [
      { id: 1, side: "A", club_id: null, goals: ag, players: a.map((id) => ({ id, display_name: `P${id}` })) },
      { id: 2, side: "B", club_id: null, goals: bg, players: b.map((id) => ({ id, display_name: `P${id}` })) },
    ],
  };
}

const players = (ids: number[]) => ids.map((id) => ({ id, display_name: `P${id}` }));

describe("computeBestCase — 1v1", () => {
  it("rival-vs-rival game still hands out points (rivals can't both stay on 0)", () => {
    // 3 players (1=Berni focus, 2=Flo, 3=Roli), nothing played yet, full round-robin remaining.
    const matches = [
      match("scheduled", [1], [2]), // focus vs Flo
      match("scheduled", [1], [3]), // focus vs Roli
      match("scheduled", [2], [3]), // Flo vs Roli  (rival game)
    ];
    const res = computeBestCase(matches, players([1, 2, 3]), 1);
    expect(res.focusWins).toBe(2);
    const berni = res.proj.find((r) => r.playerId === 1)!;
    const flo = res.proj.find((r) => r.playerId === 2)!;
    const roli = res.proj.find((r) => r.playerId === 3)!;
    expect(berni.pts).toBe(6); // wins both
    expect(res.pos).toBe(1);
    // The Flo-vs-Roli game must distribute points — not both zero.
    expect(flo.pts + roli.pts).toBeGreaterThanOrEqual(3);
  });

  it("best case can lift the focus player above a current leader when reachable", () => {
    // 1=focus has 0, 2=leader has 6 from finished games; focus has 3 remaining wins available.
    const matches = [
      match("finished", [2], [3], 3, 0),
      match("finished", [2], [4], 3, 0),
      match("scheduled", [1], [2]),
      match("scheduled", [1], [3]),
      match("scheduled", [1], [4]),
    ];
    const res = computeBestCase(matches, players([1, 2, 3, 4]), 1);
    expect(res.focusWins).toBe(3); // focus wins all 3 remaining → 9 pts
    expect(res.proj.find((r) => r.playerId === 1)!.pts).toBe(9);
    expect(res.pos).toBe(1); // 9 > leader's 6
  });
});

describe("computeBestCase — 2v2", () => {
  it("awards points to both teammates on a side", () => {
    // focus=1 partners with 2 vs (3,4); plus a rival game (3,4) vs (5,6).
    const matches = [
      match("scheduled", [1, 2], [3, 4]), // focus side
      match("scheduled", [3, 4], [5, 6]), // rival game
    ];
    const res = computeBestCase(matches, players([1, 2, 3, 4, 5, 6]), 1);
    expect(res.focusWins).toBe(1);
    // Focus AND partner both get +3 from the won focus game.
    expect(res.proj.find((r) => r.playerId === 1)!.pts).toBe(3);
    expect(res.proj.find((r) => r.playerId === 2)!.pts).toBe(3);
    // The rival game distributes points: (3,4) or (5,6) gain — not all four on 0.
    const rivalPts = [3, 4, 5, 6].reduce((s, id) => s + (res.proj.find((r) => r.playerId === id)!.pts), 0);
    expect(rivalPts).toBeGreaterThanOrEqual(2);
  });
});
