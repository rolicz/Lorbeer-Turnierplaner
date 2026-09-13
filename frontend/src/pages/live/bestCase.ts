/**
 * The "What if" model for one tournament: the best case a player can still reach, and
 * any scenario the reader edits from it. `WhatIfSection` renders exactly what is
 * computed here; nothing in this file touches the DOM.
 *
 * ── SEMANTICS ────────────────────────────────────────────────────────────────────
 *
 * Facts
 *   • A **finished** match is a fact: its goals and its 3/1/0 points are fixed and it
 *     can never be edited.
 *   • A match that is **being played** counts as it stands: the goals are on the board
 *     and the side that is ahead takes the three points (level = one each). That is the
 *     same reading the live Standings table uses, and it is deliberately *not* the old
 *     behaviour, which treated a side 0:5 down as an unplayed match it would still win.
 *     Because the game is genuinely undecided, it is still listed as editable — the
 *     honest default, the reader's call.
 *
 * Best case for the focus player F
 *   • Every remaining match F plays: **F's side wins**. In 2v2 that is +3 for both
 *     players on the side, so a partner gains with them.
 *   • Every other remaining match (a "rival match") resolves to whatever **minimises the
 *     number of players finishing strictly above F**. Exact, no cap — see below.
 *   • **Ties go to F**: a player level on points finishes behind them, so
 *     `position(F) = 1 + #{p : pts(p) > pts(F)}`.
 *
 * Goals and tie-breaks
 *   • An assumed result has no scoreline, so the projection must not invent goal
 *     difference: **only points decide the projected position**, and a tie goes to F.
 *     The other players are ordered among themselves by points, then by the goal
 *     difference they have actually played out (a fact), then goals for, then name —
 *     purely so the list is stable. That order can never move F.
 *
 * Why "F wins everything they play" is optimal — in 2v2 as well
 *   Look at one match F plays through the only quantity that decides their position,
 *   `pts(p) − pts(F)` for every other player p:
 *     • F's **partner** q moves exactly with F (both +3, both +1, both 0), so the
 *       difference to q is untouched whatever F does — winning can never cost F a place
 *       to their own partner.
 *     • an **opponent** gains 0 / 1 / 3 while F gains 3 / 1 / 0, so the difference is
 *       smallest (−3) when F's side wins.
 *     • anybody **not in the match** gains nothing while F gains 3 / 1 / 0, so again the
 *       difference is smallest when F's side wins.
 *   "F's side wins" therefore minimises `pts(p) − pts(F)` simultaneously for every p, in
 *   every match F plays, independently of every other match. Giving up points is never
 *   better for F's rank, so the search only has to explore the rival matches.
 *
 * Exactness
 *   The old implementation brute-forced `3^k` rival outcomes with `CAP = 13` and, above
 *   the cap, simply drew every rival game — a valid scenario, but not the best one. This
 *   one is exact for every k. F's own total is fixed, so for every other player p:
 *       slack(p) = pts(F) − fixed(p)   points p may still collect and stay level with F
 *       reach(p) = 3 × (rival matches p plays)
 *     slack < 0        → p finishes above F whatever happens (counted once, then dropped)
 *     slack ≥ reach    → p can never catch F (dropped)
 *     otherwise        → *contender*; only contenders are searched over.
 *   Branch and bound over the rival matches that contain a contender, most dangerous
 *   first (smallest slack), seeded with a greedy assignment as the incumbent. Points only
 *   ever go up, so a contender who has passed their slack can never come back: the number
 *   of contenders already above F is a valid lower bound for the whole subtree, and a
 *   branch is cut the moment it reaches the incumbent. The search stops at zero.
 *   A rival match with no contender in it cannot change F's position at all; it is filled
 *   in as a draw (the points-conserving choice) and the tab marks it "any result".
 */
import type { Match } from "../../api/types";
import { sideBy } from "../../helpers";
import { computeFinishedStandings, type PlayerLite } from "./tournamentStandings";

/** Home win / draw / away win — `A` and `B` are the match's two sides. */
export type Outcome = "A" | "D" | "B";

const POINTS: Record<Outcome, [number, number]> = { A: [3, 0], D: [1, 1], B: [0, 3] };
/** Preference order for equally good outcomes: a draw hands out the fewest points. */
const OUTCOMES: Outcome[] = ["D", "A", "B"];

/**
 * Safety valve for the branch and bound. Sized so it cannot trigger for any tournament
 * this app can create (6 players, two legs → at most ~20 free rival matches, and the
 * pruning cuts that to a few thousand nodes); if it ever did, the result is still a real
 * scenario and `exact` says the position is an upper bound, not proven optimal.
 */
const NODE_BUDGET = 2_000_000;

export type ProjectedRow = {
  playerId: number;
  name: string;
  /** Points in this scenario (facts + assumptions). */
  pts: number;
  /** Points today, exactly as the live Standings table counts them. */
  nowPts: number;
  /** Goal difference actually played out — a fact, never projected. */
  gd: number;
  /** Goals actually scored — a fact, never projected. */
  gf: number;
  isFocus: boolean;
};

export type Projection = {
  proj: ProjectedRow[];
  /** Focus position in this scenario (ties go to the focus player). */
  pos: number;
  /** Focus position in the live Standings table today. */
  nowPos: number;
};

export type BestCaseResult = Projection & {
  /** The chosen outcome of every editable (scheduled or playing) match. */
  outcomes: Map<number, Outcome>;
  /** Scheduled matches the focus player is in — all of them assumed won. */
  focusWins: number;
  /** False only if the node budget stopped the search (never in practice). */
  exact: boolean;
};

/** The result a scoreline implies. */
export function outcomeOfGoals(ag: number, bg: number): Outcome {
  return ag > bg ? "A" : ag < bg ? "B" : "D";
}

type Parsed = {
  id: number;
  aIds: number[];
  bIds: number[];
  ag: number;
  bg: number;
  state: Match["state"];
};

function parseMatches(matches: Match[]): Parsed[] {
  const out: Parsed[] = [];
  for (const m of matches) {
    const a = sideBy(m, "A");
    const b = sideBy(m, "B");
    if (!a || !b) continue;
    out.push({
      id: m.id,
      aIds: a.players.map((p) => p.id),
      bIds: b.players.map((p) => p.id),
      ag: Number(a.goals ?? 0),
      bg: Number(b.goals ?? 0),
      state: m.state,
    });
  }
  return out;
}

/** Editable = not finished yet: scheduled, or being played right now. */
export function isEditableMatch(m: Match): boolean {
  return m.state !== "finished";
}

/** What a match contributes when no scenario says otherwise. */
function fallbackOutcome(p: Parsed): Outcome {
  return p.state === "scheduled" ? "D" : outcomeOfGoals(p.ag, p.bg);
}

function bump(map: Map<number, number>, ids: number[], n: number) {
  for (const id of ids) map.set(id, (map.get(id) ?? 0) + n);
}

/**
 * Apply a scenario (an outcome per editable match) to the facts and rank the field.
 * Finished matches ignore the scenario — they are facts.
 */
export function projectScenario(
  matches: Match[],
  players: PlayerLite[],
  focusId: number,
  outcomes: ReadonlyMap<number, Outcome>,
): Projection {
  const parsed = parseMatches(matches);
  const pts = new Map<number, number>();
  const gf = new Map<number, number>();
  const ga = new Map<number, number>();
  for (const p of players) {
    pts.set(p.id, 0);
    gf.set(p.id, 0);
    ga.set(p.id, 0);
  }

  for (const p of parsed) {
    const outcome =
      p.state === "finished" ? outcomeOfGoals(p.ag, p.bg) : outcomes.get(p.id) ?? fallbackOutcome(p);
    const [aPts, bPts] = POINTS[outcome];
    bump(pts, p.aIds, aPts);
    bump(pts, p.bIds, bPts);
    // Goals are only ever facts: a scheduled match has none, an assumed result has no
    // scoreline, and a match in progress keeps the goals already on the board.
    if (p.state !== "scheduled") {
      bump(gf, p.aIds, p.ag);
      bump(ga, p.aIds, p.bg);
      bump(gf, p.bIds, p.bg);
      bump(ga, p.bIds, p.ag);
    }
  }

  // "Now" is whatever the live Standings table shows, so the two never disagree.
  const live = computeFinishedStandings(matches, players, { includePlaying: true });
  const nowPts = new Map(live.map((r) => [r.playerId, r.pts]));
  const nowPos = live.findIndex((r) => r.playerId === focusId) + 1;

  const proj: ProjectedRow[] = players.map((p) => ({
    playerId: p.id,
    name: p.display_name,
    pts: pts.get(p.id) ?? 0,
    nowPts: nowPts.get(p.id) ?? 0,
    gd: (gf.get(p.id) ?? 0) - (ga.get(p.id) ?? 0),
    gf: gf.get(p.id) ?? 0,
    isFocus: p.id === focusId,
  }));

  proj.sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    // Ties go to the focus player; everyone else keeps a stable, factual order.
    if (x.isFocus !== y.isFocus) return x.isFocus ? -1 : 1;
    if (y.gd !== x.gd) return y.gd - x.gd;
    if (y.gf !== x.gf) return y.gf - x.gf;
    return x.name.localeCompare(y.name);
  });

  const focusPts = pts.get(focusId) ?? 0;
  let above = 0;
  for (const p of players) {
    if (p.id === focusId) continue;
    if ((pts.get(p.id) ?? 0) > focusPts) above++;
  }

  return { proj, pos: above + 1, nowPos };
}

type Search = {
  /** Outcome per free rival match id. */
  outcomes: Map<number, Outcome>;
  exact: boolean;
};

type RivalMatch = {
  id: number;
  /** Contender indices on each side, and the same as bit masks. */
  aIdx: number[];
  bIdx: number[];
  aMask: number;
  bMask: number;
};

function popcount(n: number): number {
  let c = 0;
  for (let m = n; m; m &= m - 1) c++;
  return c;
}

/**
 * Exact branch and bound over the rival matches (see the semantics at the top).
 * `fixed` already holds the facts plus every point the focus player's own wins hand out,
 * so the focus total is settled and each other player is measured by their slack.
 */
function searchRivalMatches(
  free: Parsed[],
  fixed: Map<number, number>,
  focusPts: number,
  otherIds: number[],
): Search {
  const outcomes = new Map<number, Outcome>();
  if (!free.length) return { outcomes, exact: true };

  const reach = new Map<number, number>(otherIds.map((id) => [id, 0]));
  for (const m of free) {
    for (const id of m.aIds) if (reach.has(id)) reach.set(id, (reach.get(id) ?? 0) + 3);
    for (const id of m.bIds) if (reach.has(id)) reach.set(id, (reach.get(id) ?? 0) + 3);
  }

  const contenders: number[] = [];
  for (const id of otherIds) {
    const slack = focusPts - (fixed.get(id) ?? 0);
    if (slack < 0) continue; // finishes above the focus player whatever happens
    if (slack >= (reach.get(id) ?? 0)) continue; // can never catch up
    contenders.push(id);
  }

  const C = contenders.length;
  const slackOf = contenders.map((id) => focusPts - (fixed.get(id) ?? 0));
  const indexOf = new Map(contenders.map((id, i) => [id, i]));

  const rival: RivalMatch[] = [];
  for (const m of free) {
    const aIdx = m.aIds.map((id) => indexOf.get(id)).filter((i): i is number => i != null);
    const bIdx = m.bIds.map((id) => indexOf.get(id)).filter((i): i is number => i != null);
    if (!aIdx.length && !bIdx.length) {
      // No contender in it: no outcome of this match can change the focus player's
      // position. A draw hands out the fewest points; the tab marks it "any result".
      outcomes.set(m.id, "D");
      continue;
    }
    let aMask = 0;
    let bMask = 0;
    for (const i of aIdx) aMask |= 1 << i;
    for (const i of bIdx) bMask |= 1 << i;
    rival.push({ id: m.id, aIdx, bIdx, aMask, bMask });
  }
  const K = rival.length;
  if (!K) return { outcomes, exact: true };

  const gains = new Array<number>(C).fill(0);

  const eachDelta = (slot: number, o: Outcome, fn: (i: number, n: number) => void) => {
    const r = rival[slot];
    if (o === "A") for (const i of r.aIdx) fn(i, 3);
    else if (o === "B") for (const i of r.bIdx) fn(i, 3);
    else {
      for (const i of r.aIdx) fn(i, 1);
      for (const i of r.bIdx) fn(i, 1);
    }
  };
  const apply = (slot: number, o: Outcome) => eachDelta(slot, o, (i, n) => { gains[i] += n; });
  const undo = (slot: number, o: Outcome) => eachDelta(slot, o, (i, n) => { gains[i] -= n; });
  const aboveCount = () => {
    let n = 0;
    for (let i = 0; i < C; i++) if (gains[i] > slackOf[i]) n++;
    return n;
  };
  const belowMask = () => {
    let m = 0;
    for (let i = 0; i < C; i++) if (gains[i] <= slackOf[i]) m |= 1 << i;
    return m;
  };

  // Most dangerous first: the match holding the contender with the least room.
  rival.sort((x, y) => {
    const tight = (r: RivalMatch) => {
      let t = Infinity;
      for (const i of [...r.aIdx, ...r.bIdx]) t = Math.min(t, slackOf[i]);
      return t;
    };
    return tight(x) - tight(y) || x.id - y.id;
  });

  /**
   * Admissible lower bound on the number of contenders that end up above the focus
   * player. Beyond "those already above can never come back", it counts the points the
   * open matches are *forced* to hand to players who are still below: a match with a
   * below-contender on both sides must give at least one point to each of them (a draw
   * is its cheapest outcome). If that total does not fit in the room those players have
   * left, at least one more of them must go above; if it does not fit for any choice of
   * a single player dropped from the set either, at least two more must.
   */
  const capacity = (mask: number) => {
    let c = 0;
    for (let i = 0; i < C; i++) if ((mask >> i) & 1) c += slackOf[i] - gains[i];
    return c;
  };
  const forced = (slot: number, mask: number) => {
    let f = 0;
    for (let s = slot; s < K; s++) {
      const am = rival[s].aMask & mask;
      const bm = rival[s].bMask & mask;
      if (am && bm) f += popcount(am) + popcount(bm);
    }
    return f;
  };
  const lowerBound = (slot: number, above: number, mask: number) => {
    if (forced(slot, mask) <= capacity(mask)) return above;
    for (let i = 0; i < C; i++) {
      if (!((mask >> i) & 1)) continue;
      const m2 = mask & ~(1 << i);
      if (forced(slot, m2) <= capacity(m2)) return above + 1;
    }
    return above + 2;
  };

  /**
   * Greedy scenario that lets the players in `sacrifice` collect the points nobody else
   * can afford. Run for every plausible sacrifice set, this finds the shape of the
   * optimum ("one rival runs away with it, the rest stay level") that a plain
   * cheapest-outcome greedy never sees, and gives the search a tight incumbent.
   */
  const greedy = (sacrifice: number): { above: number; choice: Outcome[] } => {
    gains.fill(0);
    const choice: Outcome[] = [];
    for (let slot = 0; slot < K; slot++) {
      let pick: Outcome = "D";
      let pickKey: [number, number] | null = null;
      for (const o of OUTCOMES) {
        let harm = 0;
        let dump = 0;
        eachDelta(slot, o, (i, n) => {
          if ((sacrifice >> i) & 1) dump += n;
          else if (gains[i] <= slackOf[i]) harm += n;
        });
        const key: [number, number] = [harm, -dump];
        if (!pickKey || key[0] < pickKey[0] || (key[0] === pickKey[0] && key[1] < pickKey[1])) {
          pickKey = key;
          pick = o;
        }
      }
      choice.push(pick);
      apply(slot, pick);
    }
    const above = aboveCount();
    gains.fill(0);
    return { above, choice };
  };

  // Seed the incumbent: no sacrifice first (the most neutral scenario wins ties), then
  // every subset of contenders while that stays cheap, else every single player.
  const seeds: number[] = [];
  if (C <= 8) for (let s = 0; s < 1 << C; s++) seeds.push(s);
  else for (let i = 0; i < C; i++) seeds.push(i === 0 ? 0 : 1 << i);
  let best = Infinity;
  let bestChoice: Outcome[] = [];
  for (const s of seeds) {
    const g = greedy(s);
    if (g.above < best) {
      best = g.above;
      bestChoice = g.choice;
      if (best === 0) break;
    }
  }

  /** Equally good outcomes are ordered so the shown scenario keeps the field low. */
  const ranked = (slot: number): Outcome[] =>
    OUTCOMES.map((o) => {
      let harm = 0;
      let gain = 0;
      let worst = -Infinity;
      eachDelta(slot, o, (i, n) => {
        gain += n;
        if (gains[i] <= slackOf[i]) harm += n;
        worst = Math.max(worst, gains[i] + n - slackOf[i]);
      });
      return { o, harm, gain, worst };
    })
      .sort((x, y) => x.harm - y.harm || x.gain - y.gain || x.worst - y.worst)
      .map((x) => x.o);

  const chosen = new Array<Outcome>(K);
  let nodes = 0;
  let exact = true;
  const dfs = (slot: number) => {
    const above = aboveCount();
    if (above >= best) return; // points only go up: this subtree cannot improve
    if (slot === K) {
      best = above;
      bestChoice = chosen.slice();
      return;
    }
    if (lowerBound(slot, above, belowMask()) >= best) return;
    if (++nodes > NODE_BUDGET) {
      exact = false;
      return;
    }
    for (const o of ranked(slot)) {
      apply(slot, o);
      chosen[slot] = o;
      dfs(slot + 1);
      undo(slot, o);
      if (best === 0 || !exact) return;
    }
  };
  if (best > 0) dfs(0);

  for (let slot = 0; slot < K; slot++) outcomes.set(rival[slot].id, bestChoice[slot]);
  return { outcomes, exact };
}

/**
 * The highest position `focusId` can still reach, and the scenario that produces it.
 * See the semantics at the top of this file.
 */
export function computeBestCase(matches: Match[], players: PlayerLite[], focusId: number): BestCaseResult {
  const parsed = parseMatches(matches);
  const ids = players.map((p) => p.id);
  const fixed = new Map<number, number>(ids.map((id) => [id, 0]));
  const outcomes = new Map<number, Outcome>();
  const free: Parsed[] = [];
  let focusWins = 0;

  for (const p of parsed) {
    if (p.state === "finished" || p.state === "playing") {
      // Facts: a finished match, and a match in progress counted as it stands.
      const outcome = outcomeOfGoals(p.ag, p.bg);
      if (p.state === "playing") outcomes.set(p.id, outcome);
      const [aPts, bPts] = POINTS[outcome];
      bump(fixed, p.aIds, aPts);
      bump(fixed, p.bIds, bPts);
      continue;
    }
    const onA = p.aIds.includes(focusId);
    const onB = p.bIds.includes(focusId);
    if (onA || onB) {
      // The focus player's side wins — provably optimal, 1v1 and 2v2 (see the header).
      const outcome: Outcome = onA ? "A" : "B";
      outcomes.set(p.id, outcome);
      bump(fixed, onA ? p.aIds : p.bIds, 3);
      focusWins++;
      continue;
    }
    free.push(p);
  }

  const search = searchRivalMatches(
    free,
    fixed,
    fixed.get(focusId) ?? 0,
    ids.filter((id) => id !== focusId),
  );
  for (const [id, o] of search.outcomes) outcomes.set(id, o);

  return { ...projectScenario(matches, players, focusId, outcomes), outcomes, focusWins, exact: search.exact };
}

export type WhatIfRowKind = "played" | "live" | "open";

export type WhatIfRow = {
  match: Match;
  kind: WhatIfRowKind;
  /** The outcome this scenario uses (a fact for `played`). */
  outcome: Outcome;
  /** What the best case chose — `null` for a played match. */
  best: Outcome | null;
  /** The reader moved this one away from the best case. */
  edited: boolean;
  /** Which side the focus player is on, if any. */
  focusSide: "A" | "B" | null;
  /** False when no outcome of this match can change the focus player's position. */
  matters: boolean;
};

/**
 * One row per match, in playing order, with everything the tab needs to render it.
 * `matters` is answered against the scenario on screen: hold every other match and try
 * this one's three outcomes — if the position never moves, the row says "any result".
 */
export function buildWhatIfRows(
  matches: Match[],
  players: PlayerLite[],
  focusId: number,
  bestOutcomes: ReadonlyMap<number, Outcome>,
  outcomes: ReadonlyMap<number, Outcome>,
): WhatIfRow[] {
  const basePos = projectScenario(matches, players, focusId, outcomes).pos;
  const parsedById = new Map(parseMatches(matches).map((p) => [p.id, p]));

  return matches.map((m) => {
    const p = parsedById.get(m.id);
    const kind: WhatIfRowKind = m.state === "finished" ? "played" : m.state === "playing" ? "live" : "open";
    const best = kind === "played" ? null : bestOutcomes.get(m.id) ?? null;
    const outcome =
      kind === "played" && p
        ? outcomeOfGoals(p.ag, p.bg)
        : outcomes.get(m.id) ?? best ?? (p ? fallbackOutcome(p) : "D");
    const focusSide: "A" | "B" | null = !p
      ? null
      : p.aIds.includes(focusId)
        ? "A"
        : p.bIds.includes(focusId)
          ? "B"
          : null;

    let matters = false;
    if (kind !== "played") {
      const probe = new Map(outcomes);
      for (const alt of OUTCOMES) {
        if (alt === outcome) continue;
        probe.set(m.id, alt);
        if (projectScenario(matches, players, focusId, probe).pos !== basePos) {
          matters = true;
          break;
        }
      }
    }

    return { match: m, kind, outcome, best, edited: best != null && outcome !== best, focusSide, matters };
  });
}
