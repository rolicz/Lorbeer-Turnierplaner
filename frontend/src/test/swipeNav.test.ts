import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { backActionFor } from "../ui/shell/backNavigation";
import { canPop, previousEntryPath, recordNavigation, resetNavStack } from "../ui/shell/navStack";

/**
 * Q6 — the gesture is not "like" the chevron, it *is* the chevron: `useSwipeNav`
 * calls `backActionFor` and nothing else, so the cases below are the same rows of
 * the scenario table the button answers. What is specific to the gesture is the
 * two things it must **not** do: go forward (row 31 — that gesture is gone), and
 * fight a horizontal scroller (row 32, `isBlocked`).
 *
 * The DOM guards are verified at runtime with real touch events; a jsdom drag
 * cannot exercise them (no layout, no `scrollWidth`).
 */
function atIndex(idx: number) {
  window.history.replaceState({ idx }, "");
}

describe("the swipe's decision (rows 12–27)", () => {
  const original = window.history.state as unknown;

  beforeEach(() => resetNavStack());
  afterEach(() => {
    window.history.replaceState(original, "");
    resetNavStack();
  });

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

  it("row 16: a match page opened from its own tournament pops, keeping its offset", () => {
    atIndex(0);
    recordNavigation("/live/19", "?tab=matches");
    atIndex(1);
    recordNavigation("/live/19/match/108");

    expect(backActionFor("/live/19/match/108", "", { fromTab: "matches" })).toEqual({ kind: "pop" });
  });

  it("row 24: the matchup pops back onto the H2H list it was opened from", () => {
    atIndex(0);
    recordNavigation("/stats", "?view=h2h&mode=overall");
    atIndex(1);
    recordNavigation("/stats", "?view=h2h&mode=overall&player=1&vs=4");

    expect(backActionFor("/stats", "?view=h2h&mode=overall&player=1&vs=4", null)).toEqual({ kind: "pop" });
  });

  it("row 25: opened from a match page, it goes up to that list instead", () => {
    atIndex(0);
    recordNavigation("/live/19/match/104");
    atIndex(1);
    recordNavigation("/stats", "?view=h2h&mode=overall&player=1&vs=4");

    expect(backActionFor("/stats", "?view=h2h&mode=overall&player=1&vs=4", null)).toEqual({
      kind: "up",
      to: "/stats?view=h2h&mode=overall&player=1",
    });
  });

  it("row 6: on a destination it is the step behind you", () => {
    atIndex(0);
    recordNavigation("/players");
    atIndex(1);
    recordNavigation("/stats");

    expect(backActionFor("/stats", "", null)).toEqual({ kind: "pop" });
  });

  it("row 1: at home with nothing behind it, the gesture does nothing at all", () => {
    atIndex(0);
    recordNavigation("/dashboard");

    expect(backActionFor("/dashboard", "", null)).toEqual({ kind: "none" });
  });

  it("row 5: on any other destination with nothing behind it, it goes home", () => {
    atIndex(0);
    recordNavigation("/stats");

    expect(backActionFor("/stats", "", null)).toEqual({ kind: "up", to: "/dashboard" });
  });
});

/**
 * Row 31 — there is no forward gesture, and with it the mirror lost every
 * question about the future. What is left only ever looks one entry back.
 */
describe("the mirror remembers the past only", () => {
  const original = window.history.state as unknown;

  beforeEach(() => resetNavStack());
  afterEach(() => {
    window.history.replaceState(original, "");
    resetNavStack();
  });

  it("exports nothing that claims to know what is in front of us", async () => {
    const navStack = await import("../ui/shell/navStack");
    expect(Object.keys(navStack)).not.toContain("canGoForward");
    expect(Object.keys(navStack)).not.toContain("highestHistoryIndex");
  });

  it("answers `idx - 1`, and nothing about `idx + 1`", () => {
    atIndex(0);
    recordNavigation("/dashboard");
    atIndex(1);
    recordNavigation("/stats", "?view=h2h");
    atIndex(2);
    recordNavigation("/players");

    expect(previousEntryPath()).toBe("/stats?view=h2h");
    atIndex(1);
    expect(previousEntryPath()).toBe("/dashboard");
    atIndex(0);
    expect(previousEntryPath()).toBeNull();
    expect(canPop()).toBe(false);
  });

  it("a push after a back overwrites the entry it replaced", () => {
    atIndex(0);
    recordNavigation("/dashboard");
    atIndex(1);
    recordNavigation("/stats");
    // Back, then somewhere else: index 1 is a different page now.
    atIndex(0);
    recordNavigation("/dashboard");
    atIndex(1);
    recordNavigation("/players");

    atIndex(2);
    expect(previousEntryPath()).toBe("/players");
  });

  it("a mirror that lost its entry degrades to 'up', which is the same page", () => {
    atIndex(3); // nothing recorded at 2
    expect(previousEntryPath()).toBeNull();
    expect(backActionFor("/profiles/7", "", null)).toEqual({ kind: "up", to: "/players" });
  });
});
