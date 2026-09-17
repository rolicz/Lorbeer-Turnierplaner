/** Pure helpers for the Trends chart (unit-tested). */
import type { StatsMatch } from "../../api/types";
import { sideBy, winnerSide } from "../../helpers";

export type PlayerColor = { solid: string };

/**
 * The palette entry for a series index: **theme-aware through two CSS tokens**, and
 * the hue is the player's identity and never moves between themes (C2).
 *
 * The function stays pure and the theme never enters JavaScript: the string carries
 * `var(--player-solid-s)` / `var(--player-solid-l)` (`themes/defaults.css`, overridden
 * in `themes/light.css`) and the browser resolves them **where the colour is painted**
 * — an inline `backgroundColor`, an SVG `stroke`/`fill` presentation attribute. So
 * every consumer of a player's colour agrees by construction, and switching theme
 * costs one style recalculation and zero React renders.
 *
 * The cost: the string is not a resolvable colour in JS. Nothing does colour maths on
 * it; if something ever needs to, read the painted value with `getComputedStyle`.
 */
export function colorForIdx(idx: number, total: number): PlayerColor {
  const hue = Math.round(((idx % Math.max(1, total)) * 360) / Math.max(1, total));
  return { solid: `hsl(${hue} var(--player-solid-s) var(--player-solid-l))` };
}

/**
 * Stable playerId → colour map. Hues are assigned from a fixed ordering (player
 * id ascending) so a player keeps the **same** colour regardless of which subset
 * or order is currently displayed — as long as callers build the map from the
 * full roster. See `usePlayerColors`.
 */
export function buildPlayerColorMap(playerIds: number[]): Map<number, PlayerColor> {
  const ordered = Array.from(new Set(playerIds)).sort((a, b) => a - b);
  const total = Math.max(1, ordered.length);
  const map = new Map<number, PlayerColor>();
  ordered.forEach((id, idx) => map.set(id, colorForIdx(idx, total)));
  return map;
}

/** Points (3/1/0) for a player in a finished match, or null if not applicable. */
export function pointsForPlayerInMatch(m: StatsMatch, playerId: number): number | null {
  if (m.state !== "finished") return null;
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const aHas = (a?.players ?? []).some((p) => p.id === playerId);
  const bHas = (b?.players ?? []).some((p) => p.id === playerId);
  const side: "A" | "B" | null = aHas && !bHas ? "A" : bHas && !aHas ? "B" : null;
  if (!side) return null;

  const w = winnerSide(m);
  if (!w) return 1;
  return w === side ? 3 : 0;
}

/**
 * Pooled points-per-match over a set of per-tournament {pts, played} entries:
 * Σpts / Σplayed (null when no matches). Used for the rolling/Last-N PPM so it
 * equals the cumulative PPM once the window covers every tournament — a mean of
 * per-tournament ratios would diverge whenever match counts differ.
 */
export function pooledPpm(window: Array<{ pts: number; played: number }>): number | null {
  let sumPts = 0;
  let sumPlayed = 0;
  for (const e of window) {
    sumPts += e.pts;
    sumPlayed += e.played;
  }
  return sumPlayed ? sumPts / sumPlayed : null;
}
