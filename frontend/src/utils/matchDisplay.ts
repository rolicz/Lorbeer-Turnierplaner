import type { Match, MatchSide } from "../api/types";

export function teamName(side?: MatchSide | null): string {
  const players = side?.players ?? [];
  if (!players.length) return "—";
  return players.map((p) => p.display_name).join(" + ");
}

/**
 * Pick the match to preview: playing → first scheduled → last finished.
 * Shared by the dashboard's live-tournament card and the live tournament
 * page's Overview tab.
 */
export function pickPreviewMatch(matches: Match[]): Match | null {
  const sorted = matches.slice().sort((a, b) => a.order_index - b.order_index);
  return (
    sorted.find((m) => m.state === "playing") ||
    sorted.find((m) => m.state === "scheduled") ||
    sorted.slice().reverse().find((m) => m.state === "finished") ||
    null
  );
}
