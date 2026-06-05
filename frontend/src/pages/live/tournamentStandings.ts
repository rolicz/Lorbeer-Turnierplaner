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
};

/** Compute standings from finished matches, sorted by pts, gd, gf, then name. */
export function computeFinishedStandings(matches: Match[], players: PlayerLite[]): StandRow[] {
  const rows = new Map<number, StandRow>();
  for (const p of players) rows.set(p.id, { playerId: p.id, name: p.display_name, pts: 0, gd: 0, gf: 0 });

  const counted = matches.filter((m) => m.state === "finished");

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
      const r = rows.get(p.id) ?? { playerId: p.id, name: p.display_name, pts: 0, gd: 0, gf: 0 };
      rows.set(p.id, r);
      r.gf += aGoals;
      r.gd += aGoals - bGoals;
      if (aWin) r.pts += 3;
      else if (draw) r.pts += 1;
    }

    for (const p of b.players) {
      const r = rows.get(p.id) ?? { playerId: p.id, name: p.display_name, pts: 0, gd: 0, gf: 0 };
      rows.set(p.id, r);
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
