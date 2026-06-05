import { describe, it, expect } from "vitest";
import {
  computeFinishedStandings,
  computeTopDraw,
  type PlayerLite,
} from "../pages/live/tournamentStandings";
import type { Match } from "../api/types";

function m(id: number, a: { p: number; g: number }, b: { p: number; g: number }, state = "finished"): Match {
  return {
    id,
    tournament_id: 1,
    leg: 1,
    order_index: id,
    state: state as Match["state"],
    started_at: null,
    finished_at: null,
    odds: null,
    sides: [
      { id: id * 10, side: "A", club_id: null, goals: a.g, players: [{ id: a.p, display_name: `P${a.p}` }] },
      { id: id * 10 + 1, side: "B", club_id: null, goals: b.g, players: [{ id: b.p, display_name: `P${b.p}` }] },
    ],
  };
}

const players: PlayerLite[] = [
  { id: 1, display_name: "P1" },
  { id: 2, display_name: "P2" },
  { id: 3, display_name: "P3" },
];

describe("computeFinishedStandings", () => {
  it("awards 3/1/0 and sorts by pts, gd, gf, name", () => {
    const matches = [
      m(1, { p: 1, g: 3 }, { p: 2, g: 0 }), // P1 win
      m(2, { p: 1, g: 1 }, { p: 3, g: 1 }), // draw
      m(3, { p: 2, g: 2 }, { p: 3, g: 0 }), // P2 win
    ];
    const rows = computeFinishedStandings(matches, players);
    expect(rows[0].playerId).toBe(1); // 4 pts (3+1)
    expect(rows[0].pts).toBe(4);
    const p2 = rows.find((r) => r.playerId === 2)!;
    expect(p2.pts).toBe(3);
    const p3 = rows.find((r) => r.playerId === 3)!;
    expect(p3.pts).toBe(1);
  });

  it("ignores unfinished matches", () => {
    const rows = computeFinishedStandings([m(1, { p: 1, g: 5 }, { p: 2, g: 0 }, "playing")], players);
    expect(rows.every((r) => r.pts === 0)).toBe(true);
  });

  it("accumulates goal difference and goals-for", () => {
    const rows = computeFinishedStandings([m(1, { p: 1, g: 4 }, { p: 2, g: 1 })], players);
    const p1 = rows.find((r) => r.playerId === 1)!;
    expect(p1.gf).toBe(4);
    expect(p1.gd).toBe(3);
    const p2 = rows.find((r) => r.playerId === 2)!;
    expect(p2.gd).toBe(-3);
  });
});

describe("computeTopDraw", () => {
  it("detects a tie at the top", () => {
    const rows = [
      { playerId: 1, name: "P1", pts: 3, gd: 1, gf: 2 },
      { playerId: 2, name: "P2", pts: 3, gd: 1, gf: 2 },
      { playerId: 3, name: "P3", pts: 0, gd: -2, gf: 0 },
    ];
    const res = computeTopDraw(rows);
    expect(res.isTopDraw).toBe(true);
    expect(res.candidates.map((c) => c.id)).toEqual([1, 2]);
  });

  it("reports no draw when the leader is unique", () => {
    const rows = [
      { playerId: 1, name: "P1", pts: 6, gd: 3, gf: 5 },
      { playerId: 2, name: "P2", pts: 3, gd: 0, gf: 2 },
    ];
    expect(computeTopDraw(rows).isTopDraw).toBe(false);
  });

  it("handles empty standings", () => {
    expect(computeTopDraw([])).toEqual({ isTopDraw: false, candidates: [] });
  });
});
