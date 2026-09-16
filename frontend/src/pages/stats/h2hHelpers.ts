/**
 * Pure helpers for the Head-to-Head card (unit-tested).
 *
 * The matrix's geometry is **not** here: it moved to `microGrid.ts` (Q3), which the
 * positions grid shares — `DESIGN.md` §4 calls the two the same thing, and they now
 * compute their column widths with the same arithmetic.
 */
import type { StatsH2HTeamRivalry } from "../../api/types";

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
