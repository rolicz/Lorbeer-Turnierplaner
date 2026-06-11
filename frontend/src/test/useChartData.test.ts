import { describe, it, expect } from "vitest";
import { computeChartData } from "../pages/stats/trends/useChartData";
import type { Row } from "../pages/stats/standings";
import type { StatsMatch, StatsPlayerMatchesTournament } from "../api/types";
import type { StatsRatingsHistoryResponse } from "../api/stats.api";
import type { PlayerColor } from "../pages/stats/trendsMath";

const colorOf = (id: number): PlayerColor => ({ solid: `solid-${id}`, muted: `muted-${id}`, outline: `outline-${id}` });

function smatch(
  id: number,
  order: number,
  a: { players: number[]; goals: number },
  b: { players: number[]; goals: number },
  state = "finished",
): StatsMatch {
  return {
    id, leg: 1, order_index: order, state, started_at: null, finished_at: null,
    sides: [
      { id: 1, side: "A", club_id: null, goals: a.goals, players: a.players.map((pid) => ({ id: pid, display_name: `P${pid}` })) },
      { id: 2, side: "B", club_id: null, goals: b.goals, players: b.players.map((pid) => ({ id: pid, display_name: `P${pid}` })) },
    ],
  };
}

function tourney(id: number, date: string, mode: string, matches: StatsMatch[]): StatsPlayerMatchesTournament {
  return { id, name: `T${id}`, date, mode, status: "finished", cup_stakes: null, matches };
}

function row(id: number): Row {
  return { id, name: `P${id}`, pts: 0, rating: 1000, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, form: [], formAvg: 0 };
}

type Params = Parameters<typeof computeChartData>[0];
function base(over: Partial<Params>): Params {
  return {
    rows: [],
    matchesData: [],
    eloData: undefined,
    metric: "points",
    isElo: false,
    isForm: false,
    effView: "cumulative",
    rollN: 3,
    hidden: new Set<number>(),
    mode: "overall",
    applyPM: false,
    colorOf,
    ...over,
  };
}

// Two players, two 1v1 tournaments: in T1 p1 beats p2 3–0, in T2 p2 beats p1 2–1.
const T1 = tourney(1, "2024-01-01", "1v1", [smatch(10, 0, { players: [1], goals: 3 }, { players: [2], goals: 0 })]);
const T2 = tourney(2, "2024-02-01", "1v1", [smatch(11, 0, { players: [1], goals: 1 }, { players: [2], goals: 2 })]);
const ROWS = [row(1), row(2)];
const MATCHES = [
  { tournaments: [T1, T2] }, // p1's player-matches
  { tournaments: [T1, T2] }, // p2's player-matches
];

describe("computeChartData — standard metrics", () => {
  it("builds events sorted by date and cumulative points per player", () => {
    const { events, series } = computeChartData(base({ rows: ROWS, matchesData: MATCHES, metric: "points", effView: "cumulative" }));
    expect(events.map((e) => e.label)).toEqual(["T1", "T2"]);
    expect(series.map((s) => ({ id: s.id, name: s.name, color: s.color, points: s.points }))).toEqual([
      { id: 1, name: "P1", color: "solid-1", points: [3, 3] },
      { id: 2, name: "P2", color: "solid-2", points: [0, 3] },
    ]);
  });

  it("per-event view returns each tournament's own value", () => {
    const { series } = computeChartData(base({ rows: ROWS, matchesData: MATCHES, metric: "points", effView: "per" }));
    expect(series[0].points).toEqual([3, 0]);
    expect(series[1].points).toEqual([0, 3]);
  });

  it("per-match modifier divides cumulative points by cumulative matches", () => {
    const { series } = computeChartData(base({ rows: ROWS, matchesData: MATCHES, metric: "points", effView: "cumulative", applyPM: true }));
    expect(series[0].points).toEqual([3, 1.5]); // 3/1 then 3/2
    expect(series[1].points).toEqual([0, 1.5]); // 0/1 then 3/2
  });

  it("computes win-rate as a percentage", () => {
    const { series } = computeChartData(base({ rows: ROWS, matchesData: MATCHES, metric: "winrate", effView: "per" }));
    expect(series[0].points).toEqual([100, 0]);
    expect(series[1].points).toEqual([0, 100]);
  });

  it("blanks a hidden player's series to nulls", () => {
    const { series } = computeChartData(base({ rows: ROWS, matchesData: MATCHES, metric: "points", effView: "cumulative", hidden: new Set([2]) }));
    expect(series[0].points).toEqual([3, 3]);
    expect(series[1].points).toEqual([null, null]);
  });

  it("excludes tournaments whose mode does not match the selected mode", () => {
    const mixed = [{ tournaments: [T1, tourney(3, "2024-03-01", "2v2", [smatch(12, 0, { players: [1], goals: 5 }, { players: [2], goals: 0 })])] }];
    const { events, series } = computeChartData(base({ rows: [row(1)], matchesData: mixed, metric: "points", effView: "per", mode: "1v1" }));
    expect(events.map((e) => e.label)).toEqual(["T1"]); // the 2v2 tournament is filtered out
    expect(series[0].points).toEqual([3]);
  });
});

describe("computeChartData — elo", () => {
  const eloData: StatsRatingsHistoryResponse = {
    generated_at: "2024-03-01T00:00:00Z",
    mode: "overall",
    scope: "tournaments",
    base_rating: 1000,
    players: [
      { player: { id: 1, display_name: "P1" }, history: [
        { tournament_id: 1, date: "2024-01-01", tournament_name: "T1", rating_after: 1010, delta: 10 },
        { tournament_id: 2, date: "2024-02-01", tournament_name: "T2", rating_after: 1005, delta: -5 },
      ] },
      { player: { id: 2, display_name: "P2" }, history: [
        { tournament_id: 1, date: "2024-01-01", tournament_name: "T1", rating_after: 990, delta: -10 },
        { tournament_id: 2, date: "2024-02-01", tournament_name: "T2", rating_after: 995, delta: 5 },
      ] },
    ],
  };

  it("plots the running rating in cumulative view", () => {
    const { events, series } = computeChartData(base({ rows: ROWS, eloData, metric: "elo", isElo: true, effView: "cumulative" }));
    expect(events.map((e) => e.label)).toEqual(["T1", "T2"]);
    expect(series[0].points).toEqual([1010, 1005]);
    expect(series[1].points).toEqual([990, 995]);
  });

  it("plots the per-event delta in per view", () => {
    const { series } = computeChartData(base({ rows: ROWS, eloData, metric: "elo", isElo: true, effView: "per" }));
    expect(series[0].points).toEqual([10, -5]);
    expect(series[1].points).toEqual([-10, 5]);
  });

  it("returns empty data when the elo history has not loaded", () => {
    expect(computeChartData(base({ rows: ROWS, metric: "elo", isElo: true, eloData: undefined }))).toEqual({ events: [], series: [] });
  });
});

describe("computeChartData — form", () => {
  // p1: T1 has a win (3) then a draw (1); T2 has a loss (0). Chronological match points: [3, 1, 0].
  const formMatches = [{ tournaments: [
    tourney(1, "2024-01-01", "1v1", [
      smatch(20, 0, { players: [1], goals: 2 }, { players: [2], goals: 0 }),
      smatch(21, 1, { players: [1], goals: 1 }, { players: [2], goals: 1 }),
    ]),
    tourney(2, "2024-02-01", "1v1", [smatch(22, 0, { players: [1], goals: 0 }, { players: [2], goals: 3 })]),
  ] }];

  it("averages the last N match points (÷N) per tournament", () => {
    const { series } = computeChartData(base({ rows: [row(1)], matchesData: formMatches, metric: "form", isForm: true, effView: "cumulative", rollN: 2 }));
    expect(series[0].points).toEqual([2, 0.5]); // (3+1)/2, then (1+0)/2
  });

  it("returns the per-event form delta in per view", () => {
    const { series } = computeChartData(base({ rows: [row(1)], matchesData: formMatches, metric: "form", isForm: true, effView: "per", rollN: 2 }));
    expect(series[0].points).toEqual([null, -1.5]); // no prior value at T1, then 0.5 − 2
  });
});
