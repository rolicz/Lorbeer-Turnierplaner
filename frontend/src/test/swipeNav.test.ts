import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { resolveBackAction, swipeAction } from "../ui/shell/backNavigation";
import { canGoForward, highestHistoryIndex, recordNavigation, resetNavStack } from "../ui/shell/navStack";

/** Put the router's history index where the browser would have it. */
function atIndex(idx: number) {
  window.history.replaceState({ idx }, "");
}

describe("resolveBackAction", () => {
  const detail = { pathname: "/live/19/match/108", state: { fromTab: "matches" } };

  it("pops when the entry behind a detail page really is its parent", () => {
    expect(
      resolveBackAction({ ...detail, canPop: true, previousPath: "/live/19?tab=overview", fallback: "/dashboard" }),
    ).toEqual({ kind: "pop" });
  });

  it("goes up when the entry behind it is something else", () => {
    expect(
      resolveBackAction({ ...detail, canPop: true, previousPath: "/stats?view=h2h", fallback: "/dashboard" }),
    ).toEqual({ kind: "up", to: "/live/19?tab=matches" });
  });

  it("goes up from a deep-linked detail page with no history", () => {
    expect(resolveBackAction({ ...detail, canPop: false, previousPath: null, fallback: null })).toEqual({
      kind: "up",
      to: "/live/19?tab=matches",
    });
  });

  it("pops on a top-level page that has history", () => {
    expect(
      resolveBackAction({ pathname: "/stats", state: null, canPop: true, previousPath: "/dashboard", fallback: "/dashboard" }),
    ).toEqual({ kind: "pop" });
  });

  it("uses the fallback on a top-level page with nothing to pop — but only when one is offered", () => {
    const input = { pathname: "/stats", state: null, canPop: false, previousPath: null };
    // A button needs a landing spot…
    expect(resolveBackAction({ ...input, fallback: "/dashboard" })).toEqual({ kind: "up", to: "/dashboard" });
    // …a gesture must not invent one.
    expect(resolveBackAction({ ...input, fallback: null })).toEqual({ kind: "none" });
  });

  it("compares parents by path only, ignoring query strings and trailing slashes", () => {
    expect(
      resolveBackAction({ pathname: "/profiles/7", state: null, canPop: true, previousPath: "/players/?tab=all", fallback: null }),
    ).toEqual({ kind: "pop" });
  });
});

describe("swipeAction", () => {
  const original = window.history.state as unknown;

  beforeEach(() => {
    resetNavStack();
  });

  afterEach(() => {
    window.history.replaceState(original, "");
    resetNavStack();
  });

  it("swipe right on a match page entered from stats goes up to its tournament", () => {
    atIndex(0);
    recordNavigation("/stats", "?view=h2h");
    atIndex(1);
    recordNavigation("/live/19/match/108");

    expect(swipeAction(1, "/live/19/match/108", { fromTab: "matches" })).toEqual({
      kind: "up",
      to: "/live/19?tab=matches",
    });
  });

  it("swipe right on a match page entered from its tournament pops", () => {
    atIndex(0);
    recordNavigation("/live/19", "?tab=matches");
    atIndex(1);
    recordNavigation("/live/19/match/108");

    expect(swipeAction(1, "/live/19/match/108", { fromTab: "matches" })).toEqual({ kind: "pop" });
  });

  it("swipe right on a top-level page with no history does nothing", () => {
    atIndex(0);
    recordNavigation("/stats");

    expect(swipeAction(1, "/stats", null)).toEqual({ kind: "none" });
  });

  it("swipe left does nothing at the front of the stack", () => {
    atIndex(0);
    recordNavigation("/dashboard");
    atIndex(1);
    recordNavigation("/stats");

    expect(swipeAction(-1, "/stats", null)).toEqual({ kind: "none" });
  });

  it("swipe left goes forward after a back", () => {
    atIndex(0);
    recordNavigation("/dashboard");
    atIndex(1);
    recordNavigation("/stats");
    // Back to /dashboard: a pop must not drop the entry in front of it.
    atIndex(0);
    recordNavigation("/dashboard", "", "POP");

    expect(swipeAction(-1, "/dashboard", null)).toEqual({ kind: "forward" });
  });
});

describe("canGoForward", () => {
  const original = window.history.state as unknown;

  beforeEach(() => {
    resetNavStack();
  });

  afterEach(() => {
    window.history.replaceState(original, "");
    resetNavStack();
  });

  it("is false on a fresh session", () => {
    atIndex(0);
    recordNavigation("/dashboard");
    expect(highestHistoryIndex()).toBe(0);
    expect(canGoForward()).toBe(false);
  });

  it("a push after a back drops the entries it destroyed", () => {
    atIndex(0);
    recordNavigation("/dashboard");
    atIndex(1);
    recordNavigation("/stats");
    atIndex(2);
    recordNavigation("/players");
    // Two steps back…
    atIndex(0);
    recordNavigation("/dashboard", "", "POP");
    expect(highestHistoryIndex()).toBe(2);
    expect(canGoForward()).toBe(true);
    // …then a push: /stats and /players are gone from the browser's stack too.
    atIndex(1);
    recordNavigation("/tournaments", "", "PUSH");
    expect(highestHistoryIndex()).toBe(1);
    expect(canGoForward()).toBe(false);
  });

  it("a replace keeps the forward entries", () => {
    atIndex(0);
    recordNavigation("/tournaments");
    atIndex(1);
    recordNavigation("/stats");
    atIndex(0);
    recordNavigation("/tournaments", "", "POP");
    recordNavigation("/tournaments", "?tab=new", "REPLACE");
    expect(canGoForward()).toBe(true);
  });
});

/**
 * A9 — a mirrored stack can outlive the history it describes: sessionStorage is
 * copied into a duplicated tab, the forward entries are not. Believing them makes
 * `canGoForward()` promise a step the browser cannot take, and the swipe that
 * asks for it does nothing at all.
 *
 * A page load is simulated the only honest way: reset the modules (so the
 * "have we recorded anything yet" flag starts false again) while sessionStorage,
 * which a real load also keeps, stays exactly as it was.
 */
describe("a nav stack that outlived its history", () => {
  const original = window.history.state as unknown;

  beforeEach(() => {
    resetNavStack();
  });

  afterEach(() => {
    vi.resetModules();
    window.history.replaceState(original, "");
    resetNavStack();
  });

  /** Re-enter the module graph the way a reload does. */
  async function reload() {
    vi.resetModules();
    return await import("../ui/shell/navStack");
  }

  it("drops forward entries on the first record of a load", async () => {
    // What the previous session left behind: three entries, currently back at 0.
    atIndex(0);
    recordNavigation("/dashboard");
    atIndex(1);
    recordNavigation("/stats");
    atIndex(2);
    recordNavigation("/players");
    atIndex(0);
    expect(canGoForward()).toBe(true);

    const fresh = await reload();
    atIndex(0);
    fresh.recordNavigation("/dashboard", "", "POP"); // react-router calls a load a POP

    expect(fresh.highestHistoryIndex()).toBe(0);
    expect(fresh.canGoForward()).toBe(false);
  });

  it("a later pop still keeps what is in front of it", async () => {
    const fresh = await reload();
    atIndex(0);
    fresh.recordNavigation("/dashboard", "", "POP"); // the load
    atIndex(1);
    fresh.recordNavigation("/stats");
    atIndex(0);
    fresh.recordNavigation("/dashboard", "", "POP");

    expect(fresh.canGoForward()).toBe(true);
  });
});
