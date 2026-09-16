import { describe, it, expect } from "vitest";

import { HOME, parentOf, placeOf } from "../ui/shell/routeHierarchy";

/**
 * Q6 — the one hierarchy. Every row of the scenario table starts here: `inside`
 * decides whether a back affordance exists at all, `parent` decides where it goes.
 */
describe("placeOf — pages you go into", () => {
  it("a match page belongs to its tournament", () => {
    expect(placeOf("/live/19/match/108")).toMatchObject({ parent: "/live/19", inside: true });
    expect(placeOf("/live/19/match/108/")).toMatchObject({ parent: "/live/19", inside: true });
  });

  it("…on the tab it was opened from, and only when that is a real tab name", () => {
    expect(parentOf("/live/19/match/108", "", { fromTab: "matches" })).toBe("/live/19?tab=matches");
    expect(parentOf("/live/19/match/108", "", { fromTab: "overview" })).toBe("/live/19?tab=overview");
    expect(parentOf("/live/19/match/108", "", { fromTab: 3 })).toBe("/live/19");
    expect(parentOf("/live/19/match/108", "", null)).toBe("/live/19");
  });

  it("a tournament belongs to the tournaments list", () => {
    expect(placeOf("/live/19")).toMatchObject({ parent: "/tournaments", inside: true });
    expect(placeOf("/live/19/")).toMatchObject({ parent: "/tournaments", inside: true });
  });

  it("a profile belongs to the players page — including the reader's own", () => {
    expect(placeOf("/profiles/7")).toMatchObject({ parent: "/players", inside: true });
    // The bug this kills: `/profile` used to show a hamburger and no back, while
    // `/profiles/2` — the very same page — showed a back arrow and no menu.
    expect(placeOf("/profile")).toMatchObject({ parent: "/players", inside: true });
  });

  it("the stats matchup belongs to the H2H list it drills into", () => {
    expect(placeOf("/stats", "?view=h2h&mode=1v1&source=both&player=1&vs=2")).toMatchObject({
      parent: "/stats?view=h2h&mode=1v1&source=both&player=1",
      inside: true,
      drillParam: "vs",
      sameParams: ["view"],
    });
  });

  it("a team matchup collapses to one player on the way up, and drops `rel`", () => {
    expect(parentOf("/stats", "?view=h2h&player=1,4&vs=2,5&rel=together")).toBe("/stats?view=h2h&player=1");
  });
});

describe("placeOf — destinations", () => {
  it("home has nothing above it", () => {
    expect(placeOf("/dashboard")).toEqual({ parent: null, inside: false });
    expect(placeOf("/dashboard/")).toEqual({ parent: null, inside: false });
  });

  it("every other destination has home above it and no back affordance", () => {
    for (const path of ["/tournaments", "/friendlies", "/stats", "/players", "/clubs", "/ideas", "/settings"]) {
      expect(placeOf(path), path).toEqual({ parent: HOME, inside: false });
    }
  });

  it("a stats section or sub-view is still just `/stats`", () => {
    expect(placeOf("/stats", "?view=h2h&sub=duos&mode=2v2")).toEqual({ parent: HOME, inside: false });
    expect(placeOf("/stats", "?view=overview&sub=cups")).toEqual({ parent: HOME, inside: false });
  });

  it("`?vs=` outside the H2H section is not a drill-in", () => {
    // `/stats?view=player&vs=2` shows no matchup, so there is nothing to leave.
    expect(placeOf("/stats", "?view=player&player=1&vs=2")).toEqual({ parent: HOME, inside: false });
    expect(placeOf("/stats", "?view=h2h&vs=")).toEqual({ parent: HOME, inside: false });
    expect(placeOf("/stats", "?view=h2h&vs=abc")).toEqual({ parent: HOME, inside: false });
  });

  it("login and an unknown URL behave like destinations: no ladder, but never a dead end", () => {
    expect(placeOf("/login")).toEqual({ parent: HOME, inside: false });
    expect(placeOf("/nope/whatever")).toEqual({ parent: HOME, inside: false });
  });
});
