import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { backActionFor, resolveBackAction } from "../ui/shell/backNavigation";
import { recordNavigation, resetNavStack } from "../ui/shell/navStack";

/**
 * Q6 — one back decision, one row of the scenario table per case.
 *
 * `resolveBackAction` is what the mobile chevron, the desktop chevron, the swipe
 * gesture and the matchup's in-view button all call. There is no second decision
 * function any more, and no "button vs gesture" argument: what a tap does, a
 * swipe does.
 */
describe("resolveBackAction — a page you went into", () => {
  const match = { pathname: "/live/19/match/108", state: { fromTab: "matches" } };

  it("row 16: pops when the entry behind really is the parent", () => {
    expect(
      resolveBackAction({ ...match, canPop: true, previousPath: "/live/19?tab=overview" }),
    ).toEqual({ kind: "pop" });
  });

  it("row 17: goes up when the entry behind is something else", () => {
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
    expect(resolveBackAction({ ...live, canPop: true, previousPath: "/tournaments" })).toEqual({ kind: "pop" });
    expect(resolveBackAction({ ...live, canPop: false, previousPath: null })).toEqual({ kind: "up", to: "/tournaments" });
  });

  it("rows 20/21: a profile pops to the players page, or goes up to it", () => {
    const profile = { pathname: "/profiles/7", state: null };
    // Query strings and trailing slashes do not make it a different page.
    expect(resolveBackAction({ ...profile, canPop: true, previousPath: "/players/?tab=all" })).toEqual({ kind: "pop" });
    expect(resolveBackAction({ ...profile, canPop: true, previousPath: "/live/19" })).toEqual({
      kind: "up",
      to: "/players",
    });
  });

  it("row 23: the reader's own profile answers exactly like anyone else's", () => {
    expect(resolveBackAction({ pathname: "/profile", state: null, canPop: true, previousPath: "/settings" })).toEqual({
      kind: "up",
      to: "/players",
    });
  });
});

describe("resolveBackAction — a destination", () => {
  it("rows 2/3/6: back is the history step you took to get here", () => {
    expect(
      resolveBackAction({ pathname: "/stats", state: null, canPop: true, previousPath: "/players" }),
    ).toEqual({ kind: "pop" });
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

  it("row 25/26: goes up when a match page or a profile sits behind it", () => {
    const up = { kind: "up", to: "/stats?view=h2h&mode=overall&player=1" };
    expect(resolveBackAction({ ...matchup, canPop: true, previousPath: "/live/19/match/104" })).toEqual(up);
    expect(resolveBackAction({ ...matchup, canPop: true, previousPath: "/profiles/1" })).toEqual(up);
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

  it("row 17: a match page opened from stats goes up to its tournament", () => {
    atIndex(0);
    recordNavigation("/stats", "?view=h2h");
    atIndex(1);
    recordNavigation("/live/19/match/108");

    expect(backActionFor("/live/19/match/108", "", { fromTab: "matches" })).toEqual({
      kind: "up",
      to: "/live/19?tab=matches",
    });
  });

  it("row 16: a match page opened from its own tournament pops", () => {
    atIndex(0);
    recordNavigation("/live/19", "?tab=matches");
    atIndex(1);
    recordNavigation("/live/19/match/108");

    expect(backActionFor("/live/19/match/108", "", { fromTab: "matches" })).toEqual({ kind: "pop" });
  });

  it("row 5: a destination with nothing behind it goes home", () => {
    atIndex(0);
    recordNavigation("/tournaments");

    expect(backActionFor("/tournaments", "", null)).toEqual({ kind: "up", to: "/dashboard" });
  });

  it("a mirror that lost the entry behind it degrades to 'up', never to a wrong page", () => {
    atIndex(1); // an index the mirror knows nothing about (cleared storage, new tab)
    expect(backActionFor("/live/19/match/108", "", { fromTab: "matches" })).toEqual({
      kind: "up",
      to: "/live/19?tab=matches",
    });
  });
});
