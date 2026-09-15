import { describe, it, expect } from "vitest";
import {
  MATRIX_CELL_MAX,
  MATRIX_CELL_MIN,
  MATRIX_GAP,
  POS_CELL_W,
  POS_CELL_W_MIN,
  POS_GAP,
  POS_NAME_MAX,
  POS_NAME_MIN,
  matrixCellSize,
  matrixFits,
  matrixTableWidth,
  positionsGridWidths,
} from "../pages/stats/microGrid";

// Measured in the browser: a 390px phone gives both grids a 358px box, a 1280px desktop
// 992px, and this player set's names make the matrix's sticky first column 44.9px wide.
const PHONE = 358;
const DESKTOP = 992;
const NAME = 44.9;

describe("matrixCellSize", () => {
  it("fills a phone's width with six players instead of leaving a dead strip", () => {
    const cell = matrixCellSize(PHONE, NAME, 6);
    expect(cell).toBe(48);
    expect(matrixTableWidth(NAME, 6, cell)).toBeLessThanOrEqual(PHONE);
    // The old fixed 44 left 13px of the box unused; 48 leaves ~1px of rounding.
    expect(PHONE - matrixTableWidth(NAME, 6, cell)).toBeLessThan(MATRIX_GAP);
  });

  it("caps two or three players at the ceiling instead of inflating them", () => {
    expect(matrixCellSize(PHONE, NAME, 2)).toBe(MATRIX_CELL_MAX);
    expect(matrixCellSize(PHONE, NAME, 3)).toBe(MATRIX_CELL_MAX);
    expect(matrixCellSize(DESKTOP, NAME, 2)).toBe(MATRIX_CELL_MAX);
    // Capped means the table is narrower than the box — that is what `mx-auto` centres.
    expect(matrixTableWidth(NAME, 2, MATRIX_CELL_MAX)).toBeLessThan(PHONE);
  });

  it("is capped on a desktop at every realistic player count", () => {
    for (const n of [2, 3, 6, 8, 12]) expect(matrixCellSize(DESKTOP, NAME, n)).toBe(MATRIX_CELL_MAX);
  });

  it("stops at the floor and lets the box scroll when the matrix cannot fit", () => {
    const cell = matrixCellSize(PHONE, NAME, 12);
    expect(cell).toBe(MATRIX_CELL_MIN);
    expect(matrixTableWidth(NAME, 12, cell)).toBeGreaterThan(PHONE);
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
        if (cell > MATRIX_CELL_MIN) expect(matrixTableWidth(NAME, n, cell)).toBeLessThanOrEqual(box);
      }
    }
  });
});

describe("matrixFits", () => {
  // `fits` is what decides whether the scroll box exists, and the scroll box is what
  // decides whether the sticky header can pin to the page (Q3).
  it("fits a phone up to 6 players and a desktop far beyond it", () => {
    for (const n of [2, 3, 6]) expect(matrixFits(PHONE, NAME, n)).toBe(true);
    for (const n of [2, 6, 12, 16]) expect(matrixFits(DESKTOP, NAME, n)).toBe(true);
  });

  it("stops fitting the phone at 7 players", () => {
    expect(matrixFits(PHONE, NAME, 6)).toBe(true);
    expect(matrixFits(PHONE, NAME, 7)).toBe(false);
  });

  it("treats an unmeasured box as fitting, so no scroll box is mounted for one frame", () => {
    expect(matrixFits(0, 0, 6)).toBe(true);
    expect(matrixFits(PHONE, NAME, 0)).toBe(true);
  });
});

describe("positionsGridWidths", () => {
  const w = (box: number, n: number) => positionsGridWidths(box, n);

  it("fits a 390px phone with the six players the app has", () => {
    const { nameW, cellW, gridW, fits } = w(PHONE, 6);
    expect(fits).toBe(true);
    expect(gridW).toBeLessThanOrEqual(PHONE);
    // The name column gives up its width first (128 → 104); the tile barely moves.
    expect(nameW).toBe(POS_NAME_MIN);
    expect(cellW).toBe(38);
  });

  it("gives the name column the surplus on a desktop and keeps the tile at 40×42", () => {
    const { nameW, cellW, gridW, fits } = w(DESKTOP, 6);
    expect(nameW).toBe(POS_NAME_MAX); // 176px untruncates every tournament name we have
    expect(cellW).toBe(POS_CELL_W);
    expect(fits).toBe(true);
    expect(gridW).toBeLessThan(DESKTOP); // narrower than the box — `mx-auto` centres it
  });

  it("surrenders width in order: the name column, then the tile, then the box scrolls", () => {
    const six = w(PHONE, 6);
    const seven = w(PHONE, 7);
    const eight = w(PHONE, 8);
    expect([six.nameW, seven.nameW, eight.nameW]).toEqual([POS_NAME_MIN, POS_NAME_MIN, POS_NAME_MIN]);
    expect(six.cellW).toBeGreaterThan(seven.cellW);
    expect(seven.cellW).toBe(POS_CELL_W_MIN);
    expect(six.fits).toBe(true);
    expect(seven.fits).toBe(true);
    // The boundary, written down: at eight players a 390px phone can no longer hold the
    // grid, the `overflow-x-auto` box comes back and the header stops pinning.
    expect(eight.cellW).toBe(POS_CELL_W_MIN);
    expect(eight.fits).toBe(false);
    expect(eight.gridW).toBeGreaterThan(PHONE);
  });

  it("holds 20 players at full size on a desktop before it gives anything up", () => {
    expect(w(DESKTOP, 18).cellW).toBe(POS_CELL_W);
    expect(w(DESKTOP, 20).fits).toBe(true);
    expect(w(DESKTOP, 26).fits).toBe(false);
  });

  it("never returns a width under its floor, unmeasured or absurd", () => {
    const unmeasured = w(0, 6);
    expect(unmeasured.fits).toBe(true); // no scroll box before the first measurement
    expect(unmeasured.nameW).toBe(POS_NAME_MIN);
    expect(w(120, 6).nameW).toBe(POS_NAME_MIN);
    expect(w(120, 6).cellW).toBe(POS_CELL_W_MIN);
    expect(w(PHONE, 0).cellW).toBe(POS_CELL_W);
  });

  it("reports `fits` consistently with the width it hands back", () => {
    for (let box = 200; box <= 1400; box += 7) {
      for (let n = 1; n <= 20; n++) {
        const g = w(box, n);
        expect(g.gridW).toBe(g.nameW + n * (g.cellW + POS_GAP));
        expect(g.fits).toBe(g.gridW <= box);
        expect(g.cellW).toBeGreaterThanOrEqual(POS_CELL_W_MIN);
        expect(g.cellW).toBeLessThanOrEqual(POS_CELL_W);
        expect(g.nameW).toBeGreaterThanOrEqual(POS_NAME_MIN);
        expect(g.nameW).toBeLessThanOrEqual(POS_NAME_MAX);
      }
    }
  });
});
