/** Best 2v2 partners for a player, derived client-side from finished matches. */
import type { StatsPlayerMatchesTournament } from "../../api/types";

export type FavoriteTeammate = {
  id: number;
  name: string;
  w: number;
  d: number;
  l: number;
  played: number;
  ppm: number;
};

/**
 * Rank the player's most successful 2v2 teammates by points-per-match.
 * Only counts finished matches where the focus player had exactly one teammate.
 * Returns the top 3 partners with at least 2 shared matches.
 */
export function computeFavoriteTeammates(
  tournaments: StatsPlayerMatchesTournament[],
  targetPlayerId: number | null,
): FavoriteTeammate[] {
  if (!targetPlayerId) return [];
  const m = new Map<number, { id: number; name: string; w: number; d: number; l: number; played: number }>();
  for (const t of tournaments) {
    for (const match of t.matches ?? []) {
      if (match.state !== "finished") continue;
      const mySide = match.sides.find((s) => s.players.some((p) => p.id === targetPlayerId));
      if (!mySide || mySide.players.length < 2) continue;
      const teammate = mySide.players.find((p) => p.id !== targetPlayerId);
      if (!teammate) continue;
      const other = match.sides.find((s) => s.side !== mySide.side);
      if (!other) continue;
      const mg = Number(mySide.goals ?? 0);
      const og = Number(other.goals ?? 0);
      const rec = m.get(teammate.id) ?? { id: teammate.id, name: teammate.display_name, w: 0, d: 0, l: 0, played: 0 };
      rec.played++;
      if (mg > og) rec.w++;
      else if (mg === og) rec.d++;
      else rec.l++;
      m.set(teammate.id, rec);
    }
  }
  return [...m.values()]
    .filter((x) => x.played >= 2)
    .map((x) => ({ ...x, ppm: (x.w * 3 + x.d) / Math.max(1, x.played) }))
    .sort((a, b) => b.ppm - a.ppm || b.played - a.played)
    .slice(0, 3);
}
