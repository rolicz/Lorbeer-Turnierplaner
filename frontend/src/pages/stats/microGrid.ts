/**
 * Geometry for the two micro-tile grids (`DESIGN.md` §4): the H2H **matrix** and the
 * **positions** grid. Both put N equal columns next to a name column inside a box whose
 * width they do not control, and both answer the same question — how wide is a column?
 *
 * **Why they fit rather than scroll (Q3).** A grid that does not fit its box needs an
 * `overflow-x-auto` wrapper, and such a box is a scroll container in *both* axes. That
 * silently kills `position: sticky` on the column headers: they are then pinned inside a
 * box with no height limit, which never scrolls vertically, so the header sits at the top
 * of a box exactly as tall as the grid — indistinguishable from not being sticky at all.
 * One axis behaved, the other did not, which is what Roli saw. Fitting the grid to the
 * width removes the wrapper, and then the header sticks to the **page**.
 *
 * So the rule for both grids is: take the width the box has, down to a readable floor, and
 * fall back to sideways scrolling only below that floor — at which point the header stops
 * pinning, because the scroll box is back. `positionsGridWidths().fits` / `matrixFits()`
 * are what the views switch the wrapper on, so the boundary is one value, not a guess.
 */

/** floor(free / count), clamped to [min, max] — the arithmetic both grids share. */
export function fitCell(free: number, count: number, min: number, max: number): number {
  if (count <= 0) return max;
  return Math.max(min, Math.min(max, Math.floor(free / count)));
}

// ── H2H matrix (R1b) ────────────────────────────────────────────────────────────
/**
 * The matrix cell is square and takes what the box has left over once the sticky name
 * column is paid for, between two limits:
 *  - **floor 44px**, the size the cell has always been. The plan proposed 40 on the
 *    grounds that `W-D-L` — the default metric — needs room for three numbers and two
 *    hyphens; measured, 40 is not enough: a real record like `11-10-5` wraps onto a
 *    second line at 40 and fits on one at 44. Making the floor the old fixed size also
 *    means the change can only ever grow a tile, never shrink one.
 *  - **ceiling 56px**, because two or three players otherwise inflate into tiles that no
 *    longer read as the same object as the positions grid's.
 */
export const MATRIX_CELL_MIN = 44;
export const MATRIX_CELL_MAX = 56;
/** `border-spacing` of the matrix table, in px — the gutter between micro-tiles. */
export const MATRIX_GAP = 3;

/**
 * Square cell edge for an `n`-player matrix in a `boxW`-wide box whose first column
 * measures `nameW`.
 *
 * `n + 2` gutters: `border-spacing` also paints one *outside* the first and last of the
 * `n + 1` columns (the name column plus the cells). The result is floored, so the table
 * can only ever come out narrower than the box, never one rounding step wider.
 */
export function matrixCellSize(boxW: number, nameW: number, n: number): number {
  if (n <= 0) return MATRIX_CELL_MAX;
  return fitCell(boxW - nameW - (n + 2) * MATRIX_GAP, n, MATRIX_CELL_MIN, MATRIX_CELL_MAX);
}

/** Total width of the matrix table: the name column, the cells and the n+2 gutters. */
export function matrixTableWidth(nameW: number, n: number, cell: number): number {
  return nameW + n * cell + (n + 2) * MATRIX_GAP;
}

/**
 * Does the matrix fit its box at the cell size it would pick? `false` only below the
 * floor — the view then re-introduces the scroll box and the sticky header stops pinning.
 * An unmeasured box (first paint, jsdom) counts as fitting: guessing "no" would mount a
 * scroll container for one frame and break stickiness for exactly as long.
 */
export function matrixFits(boxW: number, nameW: number, n: number): boolean {
  if (boxW <= 0 || n <= 0) return true;
  return matrixTableWidth(nameW, n, matrixCellSize(boxW, nameW, n)) <= boxW;
}

// ── Positions grid (Q3) ─────────────────────────────────────────────────────────
/**
 * The positions grid is the same micro-tile grid with two differences: its left column
 * holds tournament **names**, not four-letter player names, and it has one row per
 * tournament (19 and counting) instead of one per player — so its header is the one that
 * actually needs to stay on screen.
 *
 * Its tile stays the canonical 40×42 (`DESIGN.md` §4) wherever that fits, and only the
 * **width** is ever given up; the height is fixed, because rows are what you scroll past
 * and shrinking them would buy nothing. Widths are surrendered in a fixed order, cheapest
 * first:
 *  1. the name column gives back everything above `POS_NAME_MIN` — a truncated name still
 *     names its row (it keeps its `title` and is a link), and these names are prefixed
 *     with their number, so the first dozen characters identify them;
 *  2. then the tile shrinks from 40 to `POS_CELL_W_MIN` — 32 still holds a two-digit rank
 *     in `text-xs` tabular figures plus the 9px winner crown;
 *  3. only then does the grid scroll sideways again.
 *
 * At the measured phone box of 358px (390px viewport, `--page-pad-x` 16) that puts the
 * boundary at **8 players**: 6 players get a 104px name column and 38px tiles, 7 get 104
 * and 32, and 8 no longer fit — see `src/test/microGrid.test.ts`, which pins it.
 */
export const POS_GAP = 4;
/** Natural *and* maximum tile width — `DESIGN.md` §4's 40×42 micro tile. */
export const POS_CELL_W = 40;
/** Floor: a two-digit rank plus the crown still read at 32px. */
export const POS_CELL_W_MIN = 32;
export const POS_CELL_H = 42;
/** Tournament-name column: floor (phone), ceiling (desktop — 176px untruncates every name we have). */
export const POS_NAME_MIN = 104;
export const POS_NAME_MAX = 176;
/** Header band: avatar + name, the strip that has to stay on top. */
export const POS_HEADER_H = 60;

export type PositionsWidths = {
  nameW: number;
  cellW: number;
  /** Total grid width — the wrapper's width, and the SVG overlay's. */
  gridW: number;
  /** `false` → the view needs an `overflow-x-auto` box and the header stops pinning. */
  fits: boolean;
};

/** Column widths for an `n`-player positions grid in a `boxW`-wide box. */
export function positionsGridWidths(boxW: number, n: number): PositionsWidths {
  if (n <= 0) return { nameW: POS_NAME_MAX, cellW: POS_CELL_W, gridW: POS_NAME_MAX, fits: true };
  // Unmeasured (first paint, jsdom): the phone's answer, and never a scroll box — the
  // measurement lands in the same commit, before the browser paints.
  if (boxW <= 0) {
    const gridW = POS_NAME_MIN + n * (POS_CELL_W + POS_GAP);
    return { nameW: POS_NAME_MIN, cellW: POS_CELL_W, gridW, fits: true };
  }
  const gaps = n * POS_GAP;
  const nameW = Math.max(POS_NAME_MIN, Math.min(POS_NAME_MAX, boxW - gaps - n * POS_CELL_W));
  const cellW = fitCell(boxW - nameW - gaps, n, POS_CELL_W_MIN, POS_CELL_W);
  const gridW = nameW + gaps + n * cellW;
  return { nameW, cellW, gridW, fits: gridW <= boxW };
}
