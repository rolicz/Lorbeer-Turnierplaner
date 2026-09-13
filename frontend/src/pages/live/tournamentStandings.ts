/** Pure standings + tie-break helpers for a tournament (unit-tested). */
import type { Match } from "../../api/types";
import { sideBy } from "../../helpers";

export type PlayerLite = { id: number; display_name: string };

export type StandRow = {
  playerId: number;
  name: string;
  pts: number;
  gd: number;
  gf: number;
  played: number;
};

/**
 * Compute standings from finished matches, sorted by pts, gd, gf, then name.
 * With `includePlaying`, in-progress matches count too (mirrors
 * `StandingsTable`'s internal `computeStandings(..., "live")` semantics) —
 * used for the live Overview tab's compact standings block.
 */
export function computeFinishedStandings(
  matches: Match[],
  players: PlayerLite[],
  opts?: { includePlaying?: boolean },
): StandRow[] {
  const rows = new Map<number, StandRow>();
  for (const p of players) rows.set(p.id, { playerId: p.id, name: p.display_name, pts: 0, gd: 0, gf: 0, played: 0 });

  const includePlaying = opts?.includePlaying ?? false;
  const counted = matches.filter((m) => m.state === "finished" || (includePlaying && m.state === "playing"));

  for (const m of counted) {
    const a = sideBy(m, "A");
    const b = sideBy(m, "B");
    if (!a || !b) continue;

    const aGoals = Number(a.goals ?? 0);
    const bGoals = Number(b.goals ?? 0);

    const aWin = aGoals > bGoals;
    const bWin = bGoals > aGoals;
    const draw = aGoals === bGoals;

    for (const p of a.players) {
      const r = rows.get(p.id) ?? { playerId: p.id, name: p.display_name, pts: 0, gd: 0, gf: 0, played: 0 };
      rows.set(p.id, r);
      r.played += 1;
      r.gf += aGoals;
      r.gd += aGoals - bGoals;
      if (aWin) r.pts += 3;
      else if (draw) r.pts += 1;
    }

    for (const p of b.players) {
      const r = rows.get(p.id) ?? { playerId: p.id, name: p.display_name, pts: 0, gd: 0, gf: 0, played: 0 };
      rows.set(p.id, r);
      r.played += 1;
      r.gf += bGoals;
      r.gd += bGoals - aGoals;
      if (bWin) r.pts += 3;
      else if (draw) r.pts += 1;
    }
  }

  const out = Array.from(rows.values());
  out.sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    if (y.gd !== x.gd) return y.gd - x.gd;
    if (y.gf !== x.gf) return y.gf - x.gf;
    return x.name.localeCompare(y.name);
  });
  return out;
}

/**
 * Detect whether the top of the standings is a tie (same pts/gd/gf) that
 * needs a decider. Returns the tied candidates.
 */
export function computeTopDraw(rows: StandRow[]): {
  isTopDraw: boolean;
  candidates: { id: number; name: string }[];
} {
  if (!rows.length) return { isTopDraw: false, candidates: [] };
  const top = rows[0];
  const tied = rows.filter((r) => r.pts === top.pts && r.gd === top.gd && r.gf === top.gf);
  const candidates = tied.map((r) => ({ id: r.playerId, name: r.name }));
  return { isTopDraw: candidates.length >= 2, candidates };
}

/** The tournament's decider, as the detail response carries it. */
export type DeciderLite = {
  type: string;
  winner_player_id?: number | null;
};

/**
 * How a finished tournament ended: a unique winner, a tie nobody resolved, or
 * nothing to say at all (no players).
 */
export type TournamentOutcome =
  | { kind: "winner"; row: StandRow; viaDecider: boolean }
  | { kind: "tie"; candidates: { id: number; name: string }[] }
  | { kind: "empty" };

/**
 * Who won, resolved exactly like the backend does for cup ownership
 * (`services/cup.py` → `stats/core.resolve_tournament_winner_player_id`):
 * the unique top of the standings, else the tournament's decider winner, and
 * a decider naming somebody who did not play counts as no winner at all.
 */
export function resolveTournamentOutcome(rows: StandRow[], decider?: DeciderLite | null): TournamentOutcome {
  if (!rows.length) return { kind: "empty" };
  const { isTopDraw, candidates } = computeTopDraw(rows);
  if (!isTopDraw) return { kind: "winner", row: rows[0], viaDecider: false };

  const pid = decider && decider.type !== "none" ? decider.winner_player_id ?? null : null;
  const row = pid != null ? rows.find((r) => r.playerId === pid) : undefined;
  if (row) return { kind: "winner", row, viaDecider: true };
  return { kind: "tie", candidates };
}
