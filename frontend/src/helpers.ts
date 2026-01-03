import type { Match, MatchSide } from "./api/types";

export function sideBy(m: Match, side: "A" | "B"): MatchSide | undefined {
  return m.sides.find((s) => s.side === side);
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
