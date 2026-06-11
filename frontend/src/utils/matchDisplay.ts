import type { MatchSide } from "../api/types";

export function teamName(side?: MatchSide | null): string {
  const players = side?.players ?? [];
  if (!players.length) return "—";
  return players.map((p) => p.display_name).join(" + ");
}
