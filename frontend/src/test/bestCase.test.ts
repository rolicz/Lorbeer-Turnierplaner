import { describe, it, expect } from "vitest";
import { computeBestCase, projectScenario, buildWhatIfRows, type Outcome } from "../pages/live/bestCase";
import type { Match } from "../api/types";

let MID = 1;
function match(state: Match["state"], a: number[], b: number[], ag = 0, bg = 0): Match {
  return {
    id: MID++,
    tournament_id: 1,
    leg: 1,
    order_index: 0,
    state,
    started_at: null,
    finished_at: null,
    odds: null,
    sides: [
      { id: 1, side: "A", club_id: null, goals: ag, players: a.map((id) => ({ id, display_name: `P${id}` })) },
      { id: 2, side: "B", club_id: null, goals: bg, players: b.map((id) => ({ id, display_name: `P${id}` })) },
    ],
  };
}

const players = (ids: number[]) => ids.map((id) => ({ id, display_name: `P${id}` }));

/**
 * Independent evaluator for the proof below: points straight from the match list, an
 * outcome per open match, position = 1 + the number of players strictly above the focus
 * (ties go to the focus player). Deliberately written from the semantics, not from the
 * implementation it checks.
 */
function positionUnder(
  matches: Match[],
  ids: number[],
  focusId: number,
  assignment: ReadonlyMap<number, Outcome>,
): number {
  const pts = new Map<number, number>(ids.map((id) => [id, 0]));
  for (const m of matches) {
    const a = m.sides.find((s) => s.side === "A")!;
    const b = m.sides.find((s) => s.side === "B")!;
    const ag = Number(a.goals ?? 0);
    const bg = Number(b.goals ?? 0);
    // Facts: a finished match, and a match in progress counted as it stands.
    const o: Outcome =
      m.state === "scheduled" ? assignment.get(m.id)! : ag > bg ? "A" : ag < bg ? "B" : "D";
    const add = (side: typeof a, n: number) => {
      for (const p of side.players) pts.set(p.id, (pts.get(p.id) ?? 0) + n);
    };
    if (o === "A") add(a, 3);
    else if (o === "B") add(b, 3);
    else {
      add(a, 1);
      add(b, 1);
    }
  }
  const focus = pts.get(focusId) ?? 0;
  let above = 0;
  for (const id of ids) if (id !== focusId && (pts.get(id) ?? 0) > focus) above++;
  return above + 1;
}

/** True optimum over every combination of outcomes for the open matches. */
function bruteForceBest(matches: Match[], ids: number[], focusId: number): number {
  const open = matches.filter((m) => m.state === "scheduled");
  const combos = 3 ** open.length;
  const outs: Outcome[] = ["A", "D", "B"];
  let best = Infinity;
  const assignment = new Map<number, Outcome>();
  for (let c = 0; c < combos; c++) {
    let n = c;
    for (const m of open) {
      assignment.set(m.id, outs[n % 3]);
      n = Math.floor(n / 3);
    }
    const pos = positionUnder(matches, ids, focusId, assignment);
    if (pos < best) best = pos;
    if (best === 1) break;
  }
  return best === Infinity ? 1 : best;
}

describe("computeBestCase — 1v1", () => {
  it("rival-vs-rival game still hands out points (rivals can't both stay on 0)", () => {
    // 3 players (1=Berni focus, 2=Flo, 3=Roli), nothing played yet, full round-robin remaining.
    const matches = [
      match("scheduled", [1], [2]), // focus vs Flo
      match("scheduled", [1], [3]), // focus vs Roli
      match("scheduled", [2], [3]), // Flo vs Roli  (rival game)
    ];
    const res = computeBestCase(matches, players([1, 2, 3]), 1);
    expect(res.focusWins).toBe(2);
    const berni = res.proj.find((r) => r.playerId === 1)!;
    const flo = res.proj.find((r) => r.playerId === 2)!;
    const roli = res.proj.find((r) => r.playerId === 3)!;
    expect(berni.pts).toBe(6); // wins both
    expect(res.pos).toBe(1);
    // The Flo-vs-Roli game must distribute points — not both zero. Neither of them can
    // reach 6, so the result cannot change the position and the scenario shows the
    // cheapest one, a draw (the old cap-limited search happened to pick a home win).
    expect(flo.pts + roli.pts).toBeGreaterThanOrEqual(2);
  });

  it("best case can lift the focus player above a current leader when reachable", () => {
    // 1=focus has 0, 2=leader has 6 from finished games; focus has 3 remaining wins available.
    const matches = [
      match("finished", [2], [3], 3, 0),
      match("finished", [2], [4], 3, 0),
      match("scheduled", [1], [2]),
      match("scheduled", [1], [3]),
      match("scheduled", [1], [4]),
    ];
    const res = computeBestCase(matches, players([1, 2, 3, 4]), 1);
    expect(res.focusWins).toBe(3); // focus wins all 3 remaining → 9 pts
    expect(res.proj.find((r) => r.playerId === 1)!.pts).toBe(9);
    expect(res.pos).toBe(1); // 9 > leader's 6
  });

  it("a tie is resolved in the focus player's favour", () => {
    // Focus (1) can only reach 3 points; 2 already has 3 and plays nobody else.
    const matches = [match("finished", [2], [3], 1, 0), match("scheduled", [1], [3])];
    const res = computeBestCase(matches, players([1, 2, 3]), 1);
    expect(res.proj.find((r) => r.playerId === 1)!.pts).toBe(3);
    expect(res.proj.find((r) => r.playerId === 2)!.pts).toBe(3);
    expect(res.pos).toBe(1);
    expect(res.proj[0].playerId).toBe(1); // level on points, shown ahead
  });
});

describe("computeBestCase — a match in progress", () => {
  it("counts a live match as it stands instead of assuming the trailing side wins", () => {
    // Focus (1) is 0:5 down right now; that is a loss, not a free win.
    const matches = [match("playing", [1], [2], 0, 5), match("scheduled", [1], [3])];
    const res = computeBestCase(matches, players([1, 2, 3]), 1);
    expect(res.focusWins).toBe(1); // only the scheduled one is assumed won
    expect(res.proj.find((r) => r.playerId === 1)!.pts).toBe(3);
    expect(res.proj.find((r) => r.playerId === 2)!.pts).toBe(3);
    expect(res.pos).toBe(1); // level with P2, tie goes to the focus player
    // The live match is listed as editable, defaulted to the score on the board.
    expect(res.outcomes.get(matches[0].id)).toBe("B");
  });

  it("a live match's goals stay facts in the projected goal difference", () => {
    const matches = [match("playing", [1], [2], 4, 0)];
    const res = computeBestCase(matches, players([1, 2]), 1);
    expect(res.proj.find((r) => r.playerId === 1)!.gd).toBe(4);
    expect(res.proj.find((r) => r.playerId === 2)!.gd).toBe(-4);
  });
});

describe("computeBestCase — exactness", () => {
  it("is exact far above the old 13-match cap, where drawing everything is not the best case", () => {
    // Focus (1) finishes on 6 points; 2,3,4,5 play a triple round-robin (18 rival matches,
    // well past the old CAP = 13) and start from zero.
    const matches = [match("finished", [1], [2], 3, 0), match("finished", [1], [3], 3, 0)];
    const rivals = [2, 3, 4, 5];
    for (let leg = 0; leg < 3; leg++) {
      for (let i = 0; i < rivals.length; i++) {
        for (let j = i + 1; j < rivals.length; j++) matches.push(match("scheduled", [rivals[i]], [rivals[j]]));
      }
    }
    const ids = [1, 2, 3, 4, 5];
    const res = computeBestCase(matches, players(ids), 1);
    expect(res.exact).toBe(true);

    // 18 matches hand out at least 2 points each = 36, and the four rivals can absorb at
    // most 4 × 6 = 24 while staying level with the focus player, so at least one of them
    // must finish above: #2 is optimal, and reachable (three of them draw everything
    // among themselves for exactly 6 each while the fourth wins the rest).
    expect(res.pos).toBe(2);

    // What the old implementation did above its cap — draw every rival game — is worse.
    const allDrawn = new Map<number, Outcome>();
    for (const m of matches) if (m.state === "scheduled") allDrawn.set(m.id, "D");
    expect(projectScenario(matches, players(ids), 1, allDrawn).pos).toBe(5);
  });

  it("the focus player's own assumed wins count towards their goal-difference tie-break… by not inventing goals", () => {
    // Assumed results carry no scoreline, so the projection must not invent one: both
    // players end on 3 points and the focus player is ranked first on the tie rule alone.
    const matches = [match("scheduled", [1], [2]), match("scheduled", [2], [3])];
    const res = computeBestCase(matches, players([1, 2, 3]), 1);
    expect(res.proj.every((r) => r.gd === 0)).toBe(true);
    expect(res.pos).toBe(1);
  });
});

describe("computeBestCase — 2v2", () => {
  it("awards points to both teammates on a side", () => {
    // focus=1 partners with 2 vs (3,4); plus a rival game (3,4) vs (5,6).
    const matches = [
      match("scheduled", [1, 2], [3, 4]), // focus side
      match("scheduled", [3, 4], [5, 6]), // rival game
    ];
    const res = computeBestCase(matches, players([1, 2, 3, 4, 5, 6]), 1);
    expect(res.focusWins).toBe(1);
    // Focus AND partner both get +3 from the won focus game.
    expect(res.proj.find((r) => r.playerId === 1)!.pts).toBe(3);
    expect(res.proj.find((r) => r.playerId === 2)!.pts).toBe(3);
    // The rival game distributes points: (3,4) or (5,6) gain — not all four on 0.
    const rivalPts = [3, 4, 5, 6].reduce((s, id) => s + (res.proj.find((r) => r.playerId === id)!.pts), 0);
    expect(rivalPts).toBeGreaterThanOrEqual(2);
  });

  it("keeps a partner who is also a rival from climbing above the focus player", () => {
    // 1 (focus) partners with 2 and wins, so 2 is level on 3 points. 2 then plays a rival
    // match: letting them win — or even draw — puts the focus player's own partner above
    // them, so the best case is the other side winning that one.
    const withPartner = match("scheduled", [1, 2], [3, 4]);
    const rival = match("scheduled", [2, 5], [3, 6]);
    const matches = [withPartner, rival];
    const ids = [1, 2, 3, 4, 5, 6];
    const res = computeBestCase(matches, players(ids), 1);
    expect(res.outcomes.get(rival.id)).toBe("B");
    expect(res.pos).toBe(1);
    expect(res.proj.find((r) => r.playerId === 2)!.pts).toBe(3); // level, so still behind
    expect(bruteForceBest(matches, ids, 1)).toBe(1);
  });
});

/* ── The proof: randomised fixtures against a full brute force ─────────────────── */

/** Small deterministic PRNG so a failure is always reproducible from its seed. */
function rng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

type Fixture = { matches: Match[]; ids: number[]; focusId: number };

function randomFixture(rand: () => number, mode: "1v1" | "2v2"): Fixture {
  const n = mode === "1v1" ? 3 + Math.floor(rand() * 4) : 4 + Math.floor(rand() * 3); // 3–6 / 4–6
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  const pairings: [number[], number[]][] = [];

  if (mode === "1v1") {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairings.push([[ids[i]], [ids[j]]]);
  } else {
    // Random 2v2 pairings: four distinct players, split into two duos. Partners rotate,
    // so a rival is regularly the focus player's partner in another match.
    for (let k = 0; k < 10; k++) {
      const pool = ids.slice();
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      pairings.push([[pool[0], pool[1]], [pool[2], pool[3]]]);
    }
  }

  // Shuffle, then keep at most 12 matches with at most 8 still open (3^8 brute force).
  for (let i = pairings.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pairings[i], pairings[j]] = [pairings[j], pairings[i]];
  }
  const take = pairings.slice(0, 12);

  const matches: Match[] = [];
  let open = 0;
  for (const [a, b] of take) {
    const roll = rand();
    let state: Match["state"] = roll < 0.45 ? "finished" : roll < 0.55 ? "playing" : "scheduled";
    if (state === "scheduled" && open >= 8) state = "finished";
    if (state === "scheduled") open++;
    const ag = state === "scheduled" ? 0 : Math.floor(rand() * 5);
    const bg = state === "scheduled" ? 0 : Math.floor(rand() * 5);
    matches.push(match(state, a, b, ag, bg));
  }
  // Half the fixtures focus on the player who is trailing, where the race is actually
  // contested — a random focus is #1 in the best case four times out of five.
  let focusId = ids[Math.floor(rand() * ids.length)];
  if (rand() < 0.5) {
    const pts = new Map<number, number>(ids.map((id) => [id, 0]));
    for (const m of matches) {
      if (m.state === "scheduled") continue;
      const [a, b] = m.sides;
      const ag = Number(a.goals ?? 0);
      const bg = Number(b.goals ?? 0);
      for (const p of a.players) pts.set(p.id, (pts.get(p.id) ?? 0) + (ag > bg ? 3 : ag === bg ? 1 : 0));
      for (const p of b.players) pts.set(p.id, (pts.get(p.id) ?? 0) + (bg > ag ? 3 : ag === bg ? 1 : 0));
    }
    focusId = ids.slice().sort((x, y) => (pts.get(x) ?? 0) - (pts.get(y) ?? 0))[0];
  }
  return { matches, ids, focusId };
}

function proveFixture({ matches, ids, focusId }: Fixture) {
  const res = computeBestCase(matches, players(ids), focusId);
  expect(res.exact).toBe(true);

  // 1. The position the algorithm reports is the true optimum.
  expect(res.pos).toBe(bruteForceBest(matches, ids, focusId));

  // 2. The scenario it hands to the UI really produces that position — checked by the
  //    independent evaluator, so the search and the projection cannot drift apart.
  const open = matches.filter((m) => m.state === "scheduled");
  for (const m of open) expect(res.outcomes.has(m.id)).toBe(true);
  expect(positionUnder(matches, ids, focusId, res.outcomes)).toBe(res.pos);

  // 3. No edit of a single open match can beat the best case.
  for (const m of open) {
    for (const alt of ["A", "D", "B"] as Outcome[]) {
      const probe = new Map(res.outcomes);
      probe.set(m.id, alt);
      expect(projectScenario(matches, players(ids), focusId, probe).pos).toBeGreaterThanOrEqual(res.pos);
    }
  }
}

describe("computeBestCase — brute-force proof", () => {
  it("matches the true optimum on 120 randomised 1v1 fixtures", () => {
    const rand = rng(20260913);
    for (let i = 0; i < 120; i++) proveFixture(randomFixture(rand, "1v1"));
  });

  it("matches the true optimum on 120 randomised 2v2 fixtures (rotating partners)", () => {
    const rand = rng(13092026);
    for (let i = 0; i < 120; i++) proveFixture(randomFixture(rand, "2v2"));
  });

  it("matches the true optimum when a rival is the focus player's partner in another match", () => {
    const rand = rng(555);
    let seen = 0;
    for (let i = 0; i < 200 && seen < 40; i++) {
      const f = randomFixture(rand, "2v2");
      const partners = new Set<number>();
      const rivals = new Set<number>();
      for (const m of f.matches) {
        if (m.state !== "scheduled") continue;
        const a = m.sides[0].players.map((p) => p.id);
        const b = m.sides[1].players.map((p) => p.id);
        const side = a.includes(f.focusId) ? a : b.includes(f.focusId) ? b : null;
        if (side) for (const id of side) if (id !== f.focusId) partners.add(id);
        else for (const id of [...a, ...b]) rivals.add(id);
      }
      if (![...partners].some((id) => rivals.has(id))) continue;
      seen++;
      proveFixture(f);
    }
    expect(seen).toBeGreaterThan(10);
  });
});

describe("buildWhatIfRows", () => {
  it("classifies every match and flags the ones whose result cannot change the position", () => {
    const played = match("finished", [2], [3], 2, 1);
    const live = match("playing", [1], [4], 1, 0);
    const mine = match("scheduled", [1], [2]);
    const theirs = match("scheduled", [3], [4]);
    const matches = [played, live, mine, theirs];
    const ids = [1, 2, 3, 4];
    const res = computeBestCase(matches, players(ids), 1);
    const rows = buildWhatIfRows(matches, players(ids), 1, res.outcomes, res.outcomes);

    expect(rows.map((r) => r.kind)).toEqual(["played", "live", "open", "open"]);
    expect(rows[0].best).toBeNull();
    expect(rows[1].outcome).toBe("A"); // live, counted as it stands
    expect(rows[2].outcome).toBe("A"); // the focus player wins their own match
    expect(rows[2].focusSide).toBe("A");
    expect(rows[3].focusSide).toBeNull();
    expect(rows.every((r) => !r.edited)).toBe(true);

    // Focus ends on 6 and is #1. Their own two matches can still cost them that (losing
    // one drops them to 3 while a rival climbs), so those rows matter; the rival game
    // between two players who cannot reach 6 either way says "any result".
    expect(res.pos).toBe(1);
    expect(rows[2].matters).toBe(true);
    expect(rows[3].matters).toBe(false);

    // An edit is reported as such.
    const edited = new Map(res.outcomes);
    edited.set(mine.id, "B");
    const after = buildWhatIfRows(matches, players(ids), 1, res.outcomes, edited);
    expect(after[2].edited).toBe(true);
    expect(projectScenario(matches, players(ids), 1, edited).pos).toBeGreaterThanOrEqual(res.pos);
  });
});
