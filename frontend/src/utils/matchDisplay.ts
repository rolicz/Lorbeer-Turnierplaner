import type { Match, MatchSide } from "../api/types";

/**
 * The one way two names share a line (C10 row 7). Every joined team label in the
 * app goes through `joinNames`, and nothing ever parses the result back into an
 * array — a separator that something splits on is a separator nobody can change.
 * Stacking two names on two lines is `ScoreLine`'s job, not a string's — see
 * `DESIGN.md` §8 ("2v2 stacks two lines"): give it the array, not this.
 */
export const NAME_JOINER = " / ";

export function joinNames(names: readonly string[]): string {
  return names.filter(Boolean).join(NAME_JOINER);
}

/** The `joinNames` convenience wrapper for a `MatchSide`; `—` when the side is empty. */
export function teamName(side?: MatchSide | null): string {
  const players = side?.players ?? [];
  if (!players.length) return "—";
  return joinNames(players.map((p) => p.display_name));
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
