/** Pure helpers for the Trends chart (unit-tested). */
import type { Match } from "../../api/types";
import { sideBy } from "../../helpers";
import { fmtMonthDate } from "../../utils/format";

export type SeriesPoint = { y: number; present: boolean } | null; // null = no datapoint

/** Month-boundary ticks (1st of each month) within [startTs, endTs]. */
export function monthTicksBetween(startTs: number, endTs: number): Array<{ ts: number; label: string }> {
  const out: Array<{ ts: number; label: string }> = [];
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs) return out;

  const start = new Date(startTs);
  const end = new Date(endTs);

  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  if (cur.getTime() < startTs) cur = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  while (cur.getTime() <= end.getTime()) {
    out.push({ ts: cur.getTime(), label: fmtMonthDate(cur) });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  if (!out.length) out.push({ ts: startTs, label: fmtMonthDate(start) });
  return out;
}

export type PlayerColor = { solid: string; muted: string; outline: string };

/** Distinct, theme-invariant HSL palette entry for a series index. */
export function colorForIdx(idx: number, total: number): PlayerColor {
  const hue = Math.round(((idx % Math.max(1, total)) * 360) / Math.max(1, total));
  return {
    solid: `hsl(${hue} 72% 56%)`,
    muted: `hsl(${hue} 62% 38%)`, // darker for "no data" segments
    outline: `hsl(${hue} 25% 16%)`,
  };
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

export function winnerSide(m: Match): "A" | "B" | null {
  if (m.state !== "finished") return null;
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const ag = a?.goals ?? 0;
  const bg = b?.goals ?? 0;
  if (ag === bg) return null;
  return ag > bg ? "A" : "B";
}

/** Points (3/1/0) for a player in a finished match, or null if not applicable. */
export function pointsForPlayerInMatch(m: Match, playerId: number): number | null {
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

/** Average of the last n entries, dividing by n even if fewer exist (missing pad as 0). */
export function avgLast(arr: number[], n: number): number {
  const slice = arr.slice(-n);
  if (!slice.length) return 0;
  return slice.reduce((a, b) => a + b, 0) / Math.max(1, n);
}

export function dist2(
  t1: { clientX: number; clientY: number },
  t2: { clientX: number; clientY: number }
): number {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

/** Clamp a [start, start+span] window into the [domainStart, domainEnd] domain. */
export function clampWindow(
  startTs: number,
  spanMs: number,
  domainStartTs: number,
  domainEndTs: number
): { start: number; end: number } {
  const span = Math.max(1, spanMs);
  let start = startTs;
  let end = start + span;
  if (start < domainStartTs) {
    start = domainStartTs;
    end = start + span;
  }
  if (end > domainEndTs) {
    end = domainEndTs;
    start = end - span;
  }
  if (start < domainStartTs) start = domainStartTs;
  return { start, end: Math.max(start + 1, end) };
}
