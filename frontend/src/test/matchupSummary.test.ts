import { describe, expect, it } from "vitest";

import type { StatsMatch, StatsPlayerMatchesTournament } from "../api/types";
import {
  currentRun,
  flattenRecentMatches,
  matchPerspective,
  playerIds,
  playerNames,
  resultsTimeline,
  summarizeMatches,
} from "../pages/stats/h2h/matchupSummary";

let nextId = 100;

/** A finished match: side A = `aPlayers` with `ag` goals, side B = `bPlayers` with `bg`. */
function makeMatch(aPlayers: number[], ag: number, bPlayers: number[], bg: number): StatsMatch {
  const id = nextId++;
  return {
    id,
    leg: 1,
    order_index: 0,
    state: "finished",
    started_at: null,
    finished_at: null,
    sides: [
      { id: id * 10 + 1, side: "A", club_id: null, goals: ag, players: aPlayers.map((p) => ({ id: p, display_name: `P${p}` })) },
      { id: id * 10 + 2, side: "B", club_id: null, goals: bg, players: bPlayers.map((p) => ({ id: p, display_name: `P${p}` })) },
    ],
  };
}

function makeTournament(id: number, matches: StatsMatch[], date = "2026-08-01"): StatsPlayerMatchesTournament {
  return { id, name: `T${id}`, date, mode: "1v1", status: "done", cup_stakes: null, matches };
}

describe("matchupSummary sides", () => {
  it("sorts and filters player ids, and joins names", () => {
    const m = makeMatch([2, 1], 1, [3], 0);
    const a = m.sides[0];
    expect(playerIds(a)).toEqual([1, 2]);
    expect(playerIds(undefined)).toEqual([]);
    expect(playerNames(a)).toBe("P2 / P1");
    expect(playerNames(undefined)).toBe("—");
  });
});

describe("matchPerspective", () => {
  it("flips the sides so `left` always holds the left ids", () => {
    const home = makeMatch([1], 3, [2], 1);
    const away = makeMatch([2], 1, [1], 3);

    expect(matchPerspective(home, [1], [2])?.left.goals).toBe(3);
    expect(matchPerspective(away, [1], [2])?.left.goals).toBe(3);
    expect(matchPerspective(away, [1], [2])?.right.goals).toBe(1);
  });

  it("matches any opponent when no right ids are given", () => {
    const m = makeMatch([4], 0, [1], 2);
    expect(matchPerspective(m, [1])?.left.goals).toBe(2);
    expect(matchPerspective(m, [9])).toBeNull();
  });

  it("is a subset match in 2v2: partners may differ", () => {
    const m = makeMatch([1, 5], 2, [2, 6], 1);
    expect(matchPerspective(m, [1], [2])?.left.goals).toBe(2);
    expect(matchPerspective(m, [1, 5], [2, 6])?.left.goals).toBe(2);
    // both requested players on the same side → not an "opposed" matchup
    expect(matchPerspective(m, [1, 2], [6])).toBeNull();
  });
});

describe("summarizeMatches", () => {
  it("counts W-D-L, goals and points per match from the left perspective", () => {
    const t = makeTournament(1, [
      makeMatch([1], 3, [2], 1), // W
      makeMatch([2], 2, [1], 2), // D (flipped)
      makeMatch([2], 4, [1], 0), // L (flipped)
      makeMatch([3], 1, [4], 0), // unrelated
    ]);

    const s = summarizeMatches([t], [1], [2]);
    expect(s).toMatchObject({ played: 3, wins: 1, draws: 1, losses: 1, gf: 5, ga: 7 });
    expect(s.ptsPerMatch).toBeCloseTo(4 / 3, 5);
  });

  it("returns a zeroed summary when nothing matches", () => {
    expect(summarizeMatches([], [1], [2])).toMatchObject({ played: 0, wins: 0, ptsPerMatch: 0 });
  });

  it("counts 2v2 matches with any partner (subset)", () => {
    const t = makeTournament(2, [
      makeMatch([1, 5], 2, [2, 6], 1), // W for 1 vs 2
      makeMatch([1, 6], 0, [2, 5], 3), // L for 1 vs 2
      makeMatch([1, 2], 3, [5, 6], 0), // same team → excluded
    ]);

    expect(summarizeMatches([t], [1], [2])).toMatchObject({ played: 2, wins: 1, losses: 1, gf: 2, ga: 4 });
    // as teammates (no right ids): both on the left side
    expect(summarizeMatches([t], [1, 2])).toMatchObject({ played: 1, wins: 1, gf: 3, ga: 0 });
  });
});

describe("flattenRecentMatches", () => {
  it("keeps the API order and labels each match with its tournament", () => {
    const rows = flattenRecentMatches([
      makeTournament(9, [makeMatch([1], 1, [2], 0), makeMatch([1], 0, [2], 2)], "2026-08-02"),
      makeTournament(8, [makeMatch([1], 2, [2], 2)], "2026-07-01"),
    ]);

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.tournamentLabel)).toEqual(["T9", "T9", "T8"]);
    expect(rows[2].tournamentDate).toBe("2026-07-01");
    expect(new Set(rows.map((r) => r.key)).size).toBe(3);
  });
});

describe("resultsTimeline / currentRun", () => {
  it("returns W/D/L newest first, skipping unrelated matches", () => {
    const timeline = resultsTimeline(
      [
        makeTournament(3, [makeMatch([1], 2, [2], 0), makeMatch([2], 1, [1], 1)], "2026-08-02"),
        makeTournament(2, [makeMatch([2], 5, [1], 2), makeMatch([3], 1, [4], 0)], "2026-07-02"),
      ],
      [1],
      [2],
    );

    expect(timeline).toEqual(["W", "D", "L"]);
  });

  it("counts the current run of equal results from the newest", () => {
    expect(currentRun(["W", "W", "W", "L"])).toEqual({ kind: "W", length: 3 });
    expect(currentRun(["L", "W"])).toEqual({ kind: "L", length: 1 });
    expect(currentRun(["D", "D"])).toEqual({ kind: "D", length: 2 });
    expect(currentRun([])).toBeNull();
  });
});
