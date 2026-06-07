import type { Match } from "../../api/types";
import { sideBy } from "../../helpers";

export type BestCaseRow = { playerId: number; name: string; pts: number; isFocus: boolean };
export type BestCaseResult = { proj: BestCaseRow[]; pos: number; focusWins: number };

type PlayerLite = { id: number; display_name: string };

/** Finished-only points + goal difference per player (decided facts). */
function finishedTotals(matches: Match[], ids: number[]) {
  const pts = new Map<number, number>();
  const gd = new Map<number, number>();
  for (const id of ids) { pts.set(id, 0); gd.set(id, 0); }
  for (const m of matches) {
    if (m.state !== "finished") continue;
    const a = sideBy(m, "A");
    const b = sideBy(m, "B");
    if (!a || !b) continue;
    const ag = Number(a.goals ?? 0);
    const bg = Number(b.goals ?? 0);
    const aPts = ag > bg ? 3 : ag === bg ? 1 : 0;
    const bPts = bg > ag ? 3 : ag === bg ? 1 : 0;
    for (const p of a.players) { pts.set(p.id, (pts.get(p.id) ?? 0) + aPts); gd.set(p.id, (gd.get(p.id) ?? 0) + (ag - bg)); }
    for (const p of b.players) { pts.set(p.id, (pts.get(p.id) ?? 0) + bPts); gd.set(p.id, (gd.get(p.id) ?? 0) + (bg - ag)); }
  }
  return { pts, gd };
}

/**
 * Highest reachable final standing for `focusId` ("if everything works out").
 *
 * The focus player (and any 2v2 partner) wins all their remaining games. The
 * remaining **rival-vs-rival** games still hand out points — we brute-force their
 * win/draw/loss outcomes to find the result that minimises the focus player's
 * rank, so the projection is always realistic (two rivals who still play each
 * other can't both stay on 0). Points apply to *every* player on a side, so 2v2
 * teammates both gain. Ties resolve in the focus player's favour (best case).
 *
 * Brute force is capped; beyond the cap every rival game is drawn (still a valid,
 * points-conserving scenario) rather than reverting to an impossible all-zero one.
 */
export function computeBestCase(matches: Match[], players: PlayerLite[], focusId: number): BestCaseResult {
  const ids = players.map((p) => p.id);
  const { pts: basePts, gd: baseGd } = finishedTotals(matches, ids);

  const remaining = matches.filter((m) => m.state === "scheduled" || m.state === "playing");
  const focusGames: { win: number[]; lose: number[] }[] = [];
  const rivalGames: { aIds: number[]; bIds: number[] }[] = [];
  for (const m of remaining) {
    const a = sideBy(m, "A");
    const b = sideBy(m, "B");
    if (!a || !b) continue;
    const aIds = a.players.map((p) => p.id);
    const bIds = b.players.map((p) => p.id);
    if (aIds.includes(focusId)) focusGames.push({ win: aIds, lose: bIds });
    else if (bIds.includes(focusId)) focusGames.push({ win: bIds, lose: aIds });
    else rivalGames.push({ aIds, bIds });
  }
  const focusWins = focusGames.length;

  const add = (map: Map<number, number>, arr: number[], n: number) => {
    for (const id of arr) map.set(id, (map.get(id) ?? 0) + n);
  };

  const fixed = new Map(basePts);
  for (const g of focusGames) add(fixed, g.win, 3);

  const rankOfFocus = (pts: Map<number, number>) => {
    const fp = pts.get(focusId) ?? 0;
    let above = 0;
    for (const id of ids) {
      if (id === focusId) continue;
      if ((pts.get(id) ?? 0) > fp) above++;
    }
    return above + 1;
  };

  const k = rivalGames.length;
  const CAP = 13;
  let bestPts = new Map(fixed);
  if (k > 0 && k <= CAP) {
    let bestRank = Infinity;
    const total = 3 ** k;
    for (let combo = 0; combo < total; combo++) {
      const pts = new Map(fixed);
      let c = combo;
      for (let i = 0; i < k; i++) {
        const o = c % 3; c = Math.floor(c / 3);
        const g = rivalGames[i];
        if (o === 0) add(pts, g.aIds, 3);
        else if (o === 1) add(pts, g.bIds, 3);
        else { add(pts, g.aIds, 1); add(pts, g.bIds, 1); }
      }
      const rank = rankOfFocus(pts);
      if (rank < bestRank) { bestRank = rank; bestPts = pts; if (rank === 1) break; }
    }
  } else if (k > CAP) {
    for (const g of rivalGames) { add(bestPts, g.aIds, 1); add(bestPts, g.bIds, 1); }
  }

  const proj: BestCaseRow[] = players.map((p) => ({
    playerId: p.id,
    name: p.display_name,
    pts: bestPts.get(p.id) ?? 0,
    isFocus: p.id === focusId,
  }));
  proj.sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    if (x.isFocus !== y.isFocus) return x.isFocus ? -1 : 1;
    const gx = baseGd.get(x.playerId) ?? 0;
    const gy = baseGd.get(y.playerId) ?? 0;
    if (gy !== gx) return gy - gx;
    return x.name.localeCompare(y.name);
  });
  const pos = proj.findIndex((r) => r.playerId === focusId) + 1;
  return { proj, pos, focusWins };
}
