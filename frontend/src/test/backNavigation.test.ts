import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { backActionFor, isJumpNavigation, NAV_JUMP_STATE, resolveBackAction } from "../ui/shell/backNavigation";
import { recordNavigation, resetNavStack } from "../ui/shell/navStack";

/**
 * Q6 + Q6b — one back decision, one row of the scenario table per case.
 *
 * `resolveBackAction` is what the mobile chevron, the desktop chevron, the swipe
 * gesture and the browser's own button all land on. There is no second decision
 * function any more, and no "button vs gesture" argument: what a tap does, a
 * swipe does.
 *
 * Q6b added the fourth input: **how this entry was arrived at**. Back returns the
 * reader to the page they came from (`drill`), except after a `jump` — a nav
 * destination tapped in the bar — where it goes one level up. Every case below
 * says which it is, because the two are indistinguishable from the URLs alone.
 */
describe("resolveBackAction — a page you went into", () => {
  const match = { pathname: "/live/19/match/108", state: { fromTab: "matches" } };

  it("row 16: pops when the entry behind really is the parent", () => {
    expect(
      resolveBackAction({ ...match, canPop: true, previousPath: "/live/19?tab=overview" }),
    ).toEqual({ kind: "pop" });
  });

  it("row 17: pops back to the Stats row that drilled in here (Q6b)", () => {
    expect(
      resolveBackAction({ ...match, canPop: true, previousPath: "/stats?view=h2h", arrival: "drill" }),
    ).toEqual({ kind: "pop" });
  });

  it("row 17b: …but goes up when that entry was reached by a nav jump", () => {
    expect(
      resolveBackAction({ ...match, canPop: true, previousPath: "/stats?view=h2h", arrival: "jump" }),
    ).toEqual({ kind: "up", to: "/live/19?tab=matches" });
  });

  it("an arrival we cannot vouch for goes up, never to a page we are guessing at", () => {
    expect(resolveBackAction({ ...match, canPop: true, previousPath: "/stats?view=h2h" })).toEqual({
      kind: "up",
      to: "/live/19?tab=matches",
    });
  });

  it("row 18: goes up from a cold deep link, and never leaves the app", () => {
    expect(resolveBackAction({ ...match, canPop: false, previousPath: null })).toEqual({
      kind: "up",
      to: "/live/19?tab=matches",
    });
  });

  it("rows 12/14: a tournament pops to its list, or goes up to it", () => {
    const live = { pathname: "/live/19", state: null };
    // The parent is right behind us: popped whatever the arrival was.
    expect(resolveBackAction({ ...live, canPop: true, previousPath: "/tournaments", arrival: "jump" })).toEqual({
      kind: "pop",
    });
    expect(resolveBackAction({ ...live, canPop: false, previousPath: null })).toEqual({ kind: "up", to: "/tournaments" });
  });

  it("row 13 — N1: the Tournaments tab's remembered tournament goes UP to the list", () => {
    // The tab was tapped from another destination entirely; popping would drop
    // the reader back into Stats, which is the regression N1 fixed.
    expect(
      resolveBackAction({ pathname: "/live/21", state: null, canPop: true, previousPath: "/stats?view=trends", arrival: "jump" }),
    ).toEqual({ kind: "up", to: "/tournaments" });
  });

  it("row 13b: the same page reached by a dashboard card pops back to the dashboard", () => {
    expect(
      resolveBackAction({ pathname: "/live/21", state: null, canPop: true, previousPath: "/dashboard", arrival: "drill" }),
    ).toEqual({ kind: "pop" });
  });

  it("rows 20/21: a profile pops to the players page — and to the tournament it was opened from", () => {
    const profile = { pathname: "/profiles/7", state: null };
    // Query strings and trailing slashes do not make it a different page.
    expect(resolveBackAction({ ...profile, canPop: true, previousPath: "/players/?tab=all" })).toEqual({ kind: "pop" });
    // Q6b: a `PlayerLink` in a tournament's standings is a drill-in, so back
    // returns to the standings — under Q6 this went up to /players.
    expect(resolveBackAction({ ...profile, canPop: true, previousPath: "/live/19", arrival: "drill" })).toEqual({
      kind: "pop",
    });
    // …and the Players tab's remembered profile still goes up (N1's rule).
    expect(resolveBackAction({ ...profile, canPop: true, previousPath: "/live/19", arrival: "jump" })).toEqual({
      kind: "up",
      to: "/players",
    });
  });

  it("row 23: the reader's own profile answers exactly like anyone else's", () => {
    expect(
      resolveBackAction({ pathname: "/profile", state: null, canPop: true, previousPath: "/settings", arrival: "jump" }),
    ).toEqual({ kind: "up", to: "/players" });
    expect(
      resolveBackAction({ pathname: "/profile", state: null, canPop: true, previousPath: "/settings", arrival: "drill" }),
    ).toEqual({ kind: "pop" });
  });
});

describe("resolveBackAction — a destination", () => {
  it("rows 2/3/6: back is the history step you took to get here", () => {
    expect(
      resolveBackAction({ pathname: "/stats", state: null, canPop: true, previousPath: "/players" }),
    ).toEqual({ kind: "pop" });
  });

  it("rows 4/6: a destination does not consult the arrival — there is nothing to pop *out of*", () => {
    // Tapping a tab that lands on the destination's own root leaves nothing
    // deeper behind; back is the sibling step, which is also what the browser's
    // own button and the iOS edge do. The jump mark only changes pages you went
    // into, where popping would eject you from the destination you asked for.
    for (const arrival of ["jump", "drill", "unknown"] as const) {
      expect(
        resolveBackAction({ pathname: "/tournaments", state: null, canPop: true, previousPath: "/live/21", arrival }),
        arrival,
      ).toEqual({ kind: "pop" });
    }
  });

  it("rows 5/10/30: with nothing behind it, back goes home instead of out of the app", () => {
    for (const pathname of ["/tournaments", "/ideas", "/settings", "/login", "/nope"]) {
      expect(resolveBackAction({ pathname, state: null, canPop: false, previousPath: null }), pathname).toEqual({
        kind: "up",
        to: "/dashboard",
      });
    }
  });

  it("row 1: home with nothing behind it is the one place back does nothing", () => {
    expect(resolveBackAction({ pathname: "/dashboard", state: null, canPop: false, previousPath: null })).toEqual({
      kind: "none",
    });
    // …and with something behind it, it is an ordinary step back.
    expect(resolveBackAction({ pathname: "/dashboard", state: null, canPop: true, previousPath: "/stats" })).toEqual({
      kind: "pop",
    });
  });
});

describe("resolveBackAction — the stats matchup (rows 24–27)", () => {
  const matchup = { pathname: "/stats", search: "?view=h2h&mode=overall&player=1&vs=4", state: null };

  it("row 24: pops onto the H2H list it was opened from", () => {
    expect(
      resolveBackAction({ ...matchup, canPop: true, previousPath: "/stats?view=h2h&mode=overall&player=1" }),
    ).toEqual({ kind: "pop" });
  });

  it("row 25 — T11: pops back to the match page that opened it (Q6b restores this)", () => {
    expect(
      resolveBackAction({ ...matchup, canPop: true, previousPath: "/live/19/match/104", arrival: "drill" }),
    ).toEqual({ kind: "pop" });
  });

  it("row 26: and to the profile whose rival card opened it", () => {
    expect(resolveBackAction({ ...matchup, canPop: true, previousPath: "/profiles/1", arrival: "drill" })).toEqual({
      kind: "pop",
    });
  });

  it("rows 25/26 without a vouched arrival: the H2H list, never a guess", () => {
    const up = { kind: "up", to: "/stats?view=h2h&mode=overall&player=1" };
    expect(resolveBackAction({ ...matchup, canPop: true, previousPath: "/live/19/match/104" })).toEqual(up);
    expect(resolveBackAction({ ...matchup, canPop: true, previousPath: "/profiles/1", arrival: "jump" })).toEqual(up);
  });

  it("row 27: goes up from a cold deep link", () => {
    expect(resolveBackAction({ ...matchup, canPop: false, previousPath: null })).toEqual({
      kind: "up",
      to: "/stats?view=h2h&mode=overall&player=1",
    });
  });

  it("another matchup behind us is not the list this page drills into", () => {
    expect(
      resolveBackAction({ ...matchup, canPop: true, previousPath: "/stats?view=h2h&player=2&vs=5" }),
    ).toEqual({ kind: "up", to: "/stats?view=h2h&mode=overall&player=1" });
  });

  it("nor is a different stats body under the same path (A9)", () => {
    expect(
      resolveBackAction({ ...matchup, canPop: true, previousPath: "/stats?view=player&player=1" }),
    ).toEqual({ kind: "up", to: "/stats?view=h2h&mode=overall&player=1" });
  });
});

/** The mark nav links carry, and the only way a jump is ever recognised. */
describe("the jump mark", () => {
  it("is what a nav-destination link puts on its navigation, and nothing else is", () => {
    expect(isJumpNavigation(NAV_JUMP_STATE)).toBe(true);
    expect(isJumpNavigation({ ...NAV_JUMP_STATE, focusMatchId: 12 })).toBe(true);
    for (const state of [null, undefined, {}, { fromTab: "matches" }, { navJump: false }, "navJump", 1]) {
      expect(isJumpNavigation(state), JSON.stringify(state)).toBe(false);
    }
  });
});

/** The same decision against the live browser/session state. */
describe("backActionFor", () => {
  const original = window.history.state as unknown;

  beforeEach(() => resetNavStack());
  afterEach(() => {
    window.history.replaceState(original, "");
    resetNavStack();
  });

  function atIndex(idx: number) {
    window.history.replaceState({ idx }, "");
  }

  it("row 17: a match page opened from a Stats row pops back onto that row", () => {
    atIndex(0);
    recordNavigation("/stats", "?view=h2h", "drill");
    atIndex(1);
    recordNavigation("/live/19/match/108", "", "drill");

    expect(backActionFor("/live/19/match/108", "", { fromTab: "matches" })).toEqual({ kind: "pop" });
  });

  /**
   * **The acceptance pair (Q6b).** Two arrivals that are indistinguishable from
   * the URLs — the entry behind sits in another part of the app in both — and
   * Roli wants opposite answers. They are asserted here in one build, against one
   * mirror, because getting one of them right by breaking the other is the whole
   * trap of this task.
   */
  it("N1 and T11 in the same build: a jump goes up, a drill-in pops", () => {
    // N1 — Stats, then the Tournaments tab, which lands on the tournament U6
    // remembered. Back belongs to the destination that was asked for.
    atIndex(0);
    recordNavigation("/stats", "?view=trends", "drill");
    atIndex(1);
    recordNavigation("/live/21", "", "jump");
    expect(backActionFor("/live/21", "", null)).toEqual({ kind: "up", to: "/tournaments" });

    // T11 — a match page, then "All matches: A vs B" inside it.
    resetNavStack();
    atIndex(0);
    recordNavigation("/live/19/match/104", "", "drill");
    atIndex(1);
    recordNavigation("/stats", "?view=h2h&player=1&vs=4", "drill");
    expect(backActionFor("/stats", "?view=h2h&player=1&vs=4", null)).toEqual({ kind: "pop" });
  });

  it("keeps the kind an entry was born with when a `?tab=` replace rewrites its URL", () => {
    // The replace wipes `location.state`, so the mark itself is gone by then;
    // the entry's recorded kind is what survives, and N1 with it.
    atIndex(0);
    recordNavigation("/stats", "?view=trends", "drill");
    atIndex(1);
    recordNavigation("/live/21", "", "jump");
    recordNavigation("/live/21", "?tab=matches", null); // the page's own tab write
    expect(backActionFor("/live/21", "?tab=matches", null)).toEqual({ kind: "up", to: "/tournaments" });
  });

  it("forgets the kind when that index becomes a different page", () => {
    atIndex(0);
    recordNavigation("/dashboard", "", "drill");
    atIndex(1);
    recordNavigation("/profiles/7", "", "drill");
    recordNavigation("/players", "", null); // back went "up" with a replace
    atIndex(2);
    recordNavigation("/profiles/7", "", "drill");
    // …and the fresh drill-in at the new index still pops.
    expect(backActionFor("/profiles/7", "", null)).toEqual({ kind: "pop" });
  });

  it("row 16: a match page opened from its own tournament pops", () => {
    atIndex(0);
    recordNavigation("/live/19", "?tab=matches", "drill");
    atIndex(1);
    recordNavigation("/live/19/match/108", "", "drill");

    expect(backActionFor("/live/19/match/108", "", { fromTab: "matches" })).toEqual({ kind: "pop" });
  });

  it("row 5: a destination with nothing behind it goes home", () => {
    atIndex(0);
    recordNavigation("/tournaments", "", "jump");

    expect(backActionFor("/tournaments", "", null)).toEqual({ kind: "up", to: "/dashboard" });
  });

  it("a mirror that lost the entry behind it degrades to 'up', never to a wrong page", () => {
    atIndex(1); // an index the mirror knows nothing about (cleared storage, new tab)
    expect(backActionFor("/live/19/match/108", "", { fromTab: "matches" })).toEqual({
      kind: "up",
      to: "/live/19?tab=matches",
    });
  });

  it("degrades the same way when the mirror knows the trail but not the arrival", () => {
    // A session that started before Q6b stored bare URLs: the entry behind is
    // known, how we got here is not. That is the Q6 behaviour, one level up.
    sessionStorage.setItem("lk:nav-stack", JSON.stringify({ "0": "/stats?view=table", "1": "/profiles/7" }));
    atIndex(1);
    expect(backActionFor("/profiles/7", "", null)).toEqual({ kind: "up", to: "/players" });
  });
});
