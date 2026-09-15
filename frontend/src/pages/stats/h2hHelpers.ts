/** Pure helpers for the Head-to-Head card (unit-tested). */
import type { StatsH2HTeamRivalry } from "../../api/types";

/**
 * The H2H matrix's geometry (R1b). The matrix is a micro-tile grid (DESIGN.md §4), and
 * a fixed 44px cell left it 345px wide inside a 358px phone and inside a 992px desktop
 * column alike: a dead strip on the right at every width.
 *
 * The cell is square and takes the width the box has left over once the sticky name
 * column is paid for, between two limits:
 *  - **floor 44px**, which is the size the cell has always been. The plan proposed 40 on
 *    the grounds that `W-D-L` — the default metric — needs room for three numbers and two
 *    hyphens; measured, 40 is not enough: a real record like `11-10-5` wraps onto a second
 *    line at 40 and fits on one at 44. Making it the old fixed size also means this change
 *    can only ever grow a tile, never shrink one.
 *  - **ceiling 56px**, because two or three players otherwise inflate into tiles that no
 *    longer read as the same object as the positions grid's.
 * Under the floor the box keeps scrolling sideways, which is the only honest answer for
 * a matrix that does not fit.
 */
export const MATRIX_CELL_MIN = 44;
export const MATRIX_CELL_MAX = 56;
/** `border-spacing` of the matrix table, in px — the gutter between micro-tiles. */
export const MATRIX_GAP = 3;

/**
 * Square cell edge for an `n`-player matrix in a `boxW`-wide scroll box whose first
 * column measures `nameW`.
 *
 * `n + 2` gutters: `border-spacing` also paints one *outside* the first and last of the
 * `n + 1` columns (the name column plus the cells). The result is floored, so the table
 * can only ever come out narrower than the box, never one rounding step wider.
 */
export function matrixCellSize(boxW: number, nameW: number, n: number): number {
  if (n <= 0) return MATRIX_CELL_MAX;
  const free = boxW - nameW - (n + 2) * MATRIX_GAP;
  return Math.max(MATRIX_CELL_MIN, Math.min(MATRIX_CELL_MAX, Math.floor(free / n)));
}

/** Stable key for a duo, order-independent (sorted player ids joined). */
export function duoKey(a: number, b: number): string {
  return [a, b].sort((x, y) => x - y).join("-");
}

/** Format a 0..1 ratio as a rounded percentage string (e.g. 0.5 -> "50%"). */
export function pct(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n * 100)}%`;
}

/**
 * Orient a 2v2 team rivalry so the focused player's team is team1.
 * No-op when there is no focus, the focus is already on team1, or not found.
 */
export function normalizeTeamRivalryForFocus(
  r: StatsH2HTeamRivalry,
  focusPlayerId: number | null
): StatsH2HTeamRivalry {
  if (!focusPlayerId) return r;
  const in1 = (r.team1 ?? []).some((p) => p.id === focusPlayerId);
  const in2 = (r.team2 ?? []).some((p) => p.id === focusPlayerId);
  if (in1 || !in2) return r; // already left, or not found (shouldn't happen)

  const winsTotal = (r.team1_wins ?? 0) + (r.team2_wins ?? 0);
  const winShare = winsTotal > 0 ? (r.team2_wins ?? 0) / winsTotal : 0.5;
  return {
    ...r,
    team1: r.team2,
    team2: r.team1,
    team1_wins: r.team2_wins,
    team2_wins: r.team1_wins,
    team1_gf: r.team2_gf,
    team1_ga: r.team2_ga,
    team2_gf: r.team1_gf,
    team2_ga: r.team1_ga,
    win_share_team1: winShare,
    // rivalry_score / dominance_score are symmetric; keep as-is.
  };
}
