import { describe, it, expect } from "vitest";
import {
  canonicalStatsParams,
  defaultSubFor,
  resolveStatsView,
  subForSection,
  subsFor,
} from "../pages/stats/statsNav";

const resolve = (search: string, hash = "", state: unknown = null) =>
  resolveStatsView(new URLSearchParams(search), hash, state);

describe("resolveStatsView — canonical URLs", () => {
  it("defaults to Overview / Table", () => {
    expect(resolve("")).toEqual({ view: "overview", sub: "table", legacy: false });
  });

  it("opens the Player section when a player is deep-linked", () => {
    expect(resolve("player=3")).toEqual({ view: "player", sub: "table", legacy: false });
    // A junk player id does not steer the default section.
    expect(resolve("player=abc").view).toBe("overview");
    expect(resolve("player=0").view).toBe("overview");
  });

  it("reads view + sub", () => {
    expect(resolve("view=overview&sub=positions")).toEqual({ view: "overview", sub: "positions", legacy: false });
    expect(resolve("view=h2h&sub=duos")).toEqual({ view: "h2h", sub: "duos", legacy: false });
    expect(resolve("view=trends")).toEqual({ view: "trends", sub: "table", legacy: false });
  });

  it("falls back to the section default for an unknown or foreign sub", () => {
    expect(resolve("view=overview&sub=nope").sub).toBe("table");
    expect(resolve("view=overview&sub=duos").sub).toBe("table");
    expect(resolve("view=h2h&sub=records").sub).toBe("players");
    expect(resolve("view=nope")).toEqual({ view: "overview", sub: "table", legacy: false });
  });
});

describe("resolveStatsView — legacy mapping", () => {
  it("maps the old flat ?view= tabs onto Overview sub-views", () => {
    expect(resolve("view=table")).toEqual({ view: "overview", sub: "table", legacy: true });
    expect(resolve("view=positions")).toEqual({ view: "overview", sub: "positions", legacy: true });
    expect(resolve("view=streaks")).toEqual({ view: "overview", sub: "streaks", legacy: true });
    expect(resolve("view=records")).toEqual({ view: "overview", sub: "records", legacy: true });
    expect(resolve("view=cups")).toEqual({ view: "overview", sub: "cups", legacy: true });
  });

  it("maps the old Stars tab onto the Player section", () => {
    expect(resolve("view=stars")).toEqual({ view: "player", sub: "table", legacy: true });
  });

  it("maps classic ?section= values", () => {
    expect(resolve("section=players")).toEqual({ view: "overview", sub: "table", legacy: true });
    expect(resolve("section=ratings")).toEqual({ view: "overview", sub: "table", legacy: true });
    expect(resolve("section=streaks")).toEqual({ view: "overview", sub: "streaks", legacy: true });
    expect(resolve("section=trends")).toEqual({ view: "trends", sub: "table", legacy: true });
    expect(resolve("section=h2h")).toEqual({ view: "h2h", sub: "players", legacy: true });
    expect(resolve("section=stars")).toEqual({ view: "player", sub: "table", legacy: true });
    expect(resolve("section=matches")).toEqual({ view: "player", sub: "table", legacy: true });
  });

  it("prefers ?view= over ?section= but still rewrites (the dashboard sent both)", () => {
    expect(resolve("section=players&view=table")).toEqual({ view: "overview", sub: "table", legacy: true });
    // A stale section next to a canonical view is dropped by the rewrite.
    expect(resolve("section=players&view=trends")).toEqual({ view: "trends", sub: "table", legacy: true });
  });

  it("maps an unknown section to the default section", () => {
    expect(resolve("section=nope")).toEqual({ view: "overview", sub: "table", legacy: true });
  });

  it("maps the trends hash and nav state", () => {
    expect(resolve("", "#trends")).toEqual({ view: "trends", sub: "table", legacy: true });
    expect(resolve("", "#stats-trends")).toEqual({ view: "trends", sub: "table", legacy: true });
    expect(resolve("", "", { focus: "trends" })).toEqual({ view: "trends", sub: "table", legacy: true });
    expect(resolve("", "#other")).toEqual({ view: "overview", sub: "table", legacy: false });
  });

  it("maps state.statsTab (canonical and legacy values)", () => {
    expect(resolve("", "", { statsTab: "trends" })).toEqual({ view: "trends", sub: "table", legacy: true });
    expect(resolve("", "", { statsTab: "table" })).toEqual({ view: "overview", sub: "table", legacy: true });
    expect(resolve("", "", { statsTab: "stars" })).toEqual({ view: "player", sub: "table", legacy: true });
    // Unknown state is ignored, not "legacy".
    expect(resolve("", "", { statsTab: "nope" })).toEqual({ view: "overview", sub: "table", legacy: false });
    expect(resolve("", "", { statsTab: 7 })).toEqual({ view: "overview", sub: "table", legacy: false });
  });

  it("lets an explicit view win over nav state", () => {
    expect(resolve("view=h2h", "#trends", { statsTab: "table" })).toEqual({ view: "h2h", sub: "players", legacy: true });
  });

  it("does not resolve inherited object keys", () => {
    expect(resolve("view=toString")).toEqual({ view: "overview", sub: "table", legacy: false });
    expect(resolve("section=constructor")).toEqual({ view: "overview", sub: "table", legacy: true });
  });
});

describe("canonicalStatsParams", () => {
  it("writes view + sub and drops the legacy section", () => {
    const p = canonicalStatsParams(new URLSearchParams("section=players&mode=1v1"), "overview", "table");
    expect(p.toString()).toBe("mode=1v1&view=overview&sub=table");
  });

  it("drops sub for sections without sub-views and keeps other params", () => {
    const p = canonicalStatsParams(new URLSearchParams("sub=duos&player=2&source=both"), "trends", "table");
    expect(p.get("sub")).toBeNull();
    expect(p.get("player")).toBe("2");
    expect(p.get("source")).toBe("both");
    expect(p.get("view")).toBe("trends");
  });
});

describe("subsFor / defaultSubFor / subForSection", () => {
  it("knows which sections have sub-views", () => {
    expect(subsFor("overview")).toEqual(["table", "positions", "streaks", "records", "cups"]);
    expect(subsFor("h2h")).toEqual(["players", "duos"]);
    expect(subsFor("trends")).toEqual([]);
    expect(subsFor("player")).toEqual([]);
    expect(defaultSubFor("overview")).toBe("table");
    expect(defaultSubFor("h2h")).toBe("players");
  });

  it("keeps a fitting sub when switching sections, else takes the default", () => {
    expect(subForSection("overview", "records")).toBe("records");
    expect(subForSection("overview", "duos")).toBe("table");
    expect(subForSection("h2h", "duos")).toBe("duos");
    expect(subForSection("h2h", null)).toBe("players");
    expect(subForSection("trends", "duos")).toBe("table");
  });
});
