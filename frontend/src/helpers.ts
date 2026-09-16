import type { StatsMatch, StatsMatchSide } from "./api/types";

export function sideBy(m: StatsMatch, side: "A" | "B"): StatsMatchSide | undefined {
  return m.sides.find((s) => s.side === side);
}

/** Winning side of a finished match, or null if unfinished / drawn. */
export function winnerSide(m: StatsMatch): "A" | "B" | null {
  if (m.state !== "finished") return null;
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const ag = a?.goals ?? 0;
  const bg = b?.goals ?? 0;
  if (ag === bg) return null;
  return ag > bg ? "A" : "B";
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const STAR_OPTIONS = Array.from({ length: 10 }, (_, i) => (i + 1) * 0.5);

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
