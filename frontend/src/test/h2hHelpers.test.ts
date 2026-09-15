import { describe, it, expect } from "vitest";
import { MATRIX_CELL_MAX, MATRIX_CELL_MIN, MATRIX_GAP, matrixCellSize, normalizeTeamRivalryForFocus, pct } from "../pages/stats/h2hHelpers";
import type { StatsH2HTeamRivalry } from "../api/types";

describe("pct", () => {
  it("formats a ratio as a rounded percent", () => {
    expect(pct(0.5)).toBe("50%");
    expect(pct(0.333)).toBe("33%");
    expect(pct(1)).toBe("100%");
  });
  it("returns 0% for non-finite", () => {
    expect(pct(NaN)).toBe("0%");
    expect(pct(Infinity)).toBe("0%");
  });
});

function rivalry(): StatsH2HTeamRivalry {
  return {
    team1: [{ id: 1, display_name: "A" }, { id: 2, display_name: "B" }],
    team2: [{ id: 3, display_name: "C" }, { id: 4, display_name: "D" }],
    played: 5,
    team1_wins: 3,
    draws: 1,
    team2_wins: 1,
    team1_gf: 10,
    team1_ga: 6,
    team2_gf: 6,
    team2_ga: 10,
    win_share_team1: 0.75,
    rivalry_score: 2,
    dominance_score: 1,
  };
}

describe("normalizeTeamRivalryForFocus", () => {
  it("returns the rivalry unchanged when no focus", () => {
    const r = rivalry();
    expect(normalizeTeamRivalryForFocus(r, null)).toBe(r);
  });

  it("returns unchanged when focus is already on team1", () => {
    const r = rivalry();
    expect(normalizeTeamRivalryForFocus(r, 1)).toBe(r);
  });

  it("swaps teams so the focused player's team becomes team1", () => {
    const r = rivalry();
    const out = normalizeTeamRivalryForFocus(r, 3);
    expect(out.team1.map((p) => p.id)).toEqual([3, 4]);
    expect(out.team2.map((p) => p.id)).toEqual([1, 2]);
    expect(out.team1_wins).toBe(1); // was team2_wins
    expect(out.team2_wins).toBe(3);
    expect(out.team1_gf).toBe(6);
    expect(out.win_share_team1).toBeCloseTo(1 / 4); // team2_wins / total wins
  });

  it("returns unchanged when focus player is in neither team", () => {
    const r = rivalry();
    expect(normalizeTeamRivalryForFocus(r, 99)).toBe(r);
  });
});

describe("matrixCellSize", () => {
  /** Total table width for n cells: the name column, the cells, and the n+2 gutters. */
  const tableW = (nameW: number, n: number, cell: number) => nameW + n * cell + (n + 2) * MATRIX_GAP;

  // Measured in the browser: a 390px phone gives the scroll box 358px, a 1280px desktop
  // 992px, and this player set's names make the sticky first column 44.9px wide.
  const PHONE = 358;
  const DESKTOP = 992;
  const NAME = 44.9;

  it("fills a phone's width with six players instead of leaving a dead strip", () => {
    const cell = matrixCellSize(PHONE, NAME, 6);
    expect(cell).toBe(48);
    expect(tableW(NAME, 6, cell)).toBeLessThanOrEqual(PHONE);
    // The old fixed 44 left 13px of the box unused; 48 leaves ~1px of rounding.
    expect(PHONE - tableW(NAME, 6, cell)).toBeLessThan(MATRIX_GAP);
  });

  it("caps two or three players at the ceiling instead of inflating them", () => {
    expect(matrixCellSize(PHONE, NAME, 2)).toBe(MATRIX_CELL_MAX);
    expect(matrixCellSize(PHONE, NAME, 3)).toBe(MATRIX_CELL_MAX);
    expect(matrixCellSize(DESKTOP, NAME, 2)).toBe(MATRIX_CELL_MAX);
    // Capped means the table is narrower than the box — that is what `mx-auto` centres.
    expect(tableW(NAME, 2, MATRIX_CELL_MAX)).toBeLessThan(PHONE);
  });

  it("is capped on a desktop at every realistic player count", () => {
    for (const n of [2, 3, 6, 8, 12]) expect(matrixCellSize(DESKTOP, NAME, n)).toBe(MATRIX_CELL_MAX);
  });

  it("stops at the floor and lets the box scroll when the matrix cannot fit", () => {
    const cell = matrixCellSize(PHONE, NAME, 12);
    expect(cell).toBe(MATRIX_CELL_MIN);
    expect(tableW(NAME, 12, cell)).toBeGreaterThan(PHONE);
  });

  it("never gives back a cell smaller than the floor, unmeasured or absurd", () => {
    expect(matrixCellSize(0, 0, 6)).toBe(MATRIX_CELL_MIN); // first paint, before measuring
    expect(matrixCellSize(PHONE, 400, 6)).toBe(MATRIX_CELL_MIN); // name column eats the box
    expect(matrixCellSize(PHONE, NAME, 0)).toBe(MATRIX_CELL_MAX); // no players, no division
  });

  it("only ever rounds the table narrower than the box, never one step wider", () => {
    for (let box = 200; box <= 1400; box += 7) {
      for (let n = 2; n <= 12; n++) {
        const cell = matrixCellSize(box, NAME, n);
        if (cell > MATRIX_CELL_MIN) expect(tableW(NAME, n, cell)).toBeLessThanOrEqual(box);
      }
    }
  });
});
