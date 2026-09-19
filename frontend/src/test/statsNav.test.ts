import { describe, it, expect } from "vitest";
import {
  CUP_PARAM,
  canonicalStatsParams,
  collapseMatchupSide,
  cupSectionHref,
  cupSectionId,
  defaultSubFor,
  formatMatchupSide,
  parseMatchupSide,
  parseSortDir,
  recordSectionId,
  resolveStatsView,
  statsMatchupHref,
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

  it("keeps the source section's sub (and every other param) for a section without sub-views", () => {
    // Trends and Player have no sub-views; `resolveStatsView` ignores a foreign sub,
    // and keeping it is what brings a Records row tap back to Records (N4).
    const p = canonicalStatsParams(new URLSearchParams("sub=records&player=2&source=both"), "player", "table");
    expect(p.get("sub")).toBe("records");
    expect(p.get("player")).toBe("2");
    expect(p.get("source")).toBe("both");
    expect(p.get("view")).toBe("player");
    // …and the section it returns to opens on that sub again.
    expect(subForSection("overview", p.get("sub"))).toBe("records");
    // A foreign sub does not leak into the resolved view.
    expect(resolveStatsView(p, "", null)).toEqual({ view: "player", sub: "table", legacy: false });
  });

  it("adds no sub when the URL never had one", () => {
    const p = canonicalStatsParams(new URLSearchParams("player=2"), "trends", "table");
    expect(p.get("sub")).toBeNull();
    expect(p.toString()).toBe("player=2&view=trends");
  });

  it("keeps sort, dir and record — it copies unknown params rather than allow-listing them", () => {
    const p = canonicalStatsParams(new URLSearchParams("sort=ppm&dir=asc&record=win_streak"), "overview", "streaks");
    expect(p.get("sort")).toBe("ppm");
    expect(p.get("dir")).toBe("asc");
    expect(p.get("record")).toBe("win_streak");
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

describe("the Cups deep link", () => {
  it("opens the Cups sub-view at one cup's section", () => {
    expect(cupSectionHref("bauernkranz")).toBe("/stats?view=overview&sub=cups&cup=bauernkranz");
    expect(cupSectionId("bauernkranz")).toBe("cup-bauernkranz");
    // The dashboard's default cup and anything that needs escaping survive the trip.
    expect(cupSectionHref("default")).toBe("/stats?view=overview&sub=cups&cup=default");
    expect(cupSectionHref("a b&c")).toBe("/stats?view=overview&sub=cups&cup=a%20b%26c");
  });

  it("resolves to Overview / Cups and keeps the one-shot param for the view to consume", () => {
    const search = new URLSearchParams(cupSectionHref("bauernkranz").split("?")[1]);
    expect(resolveStatsView(search, "", null)).toEqual({ view: "overview", sub: "cups", legacy: false });
    expect(search.get(CUP_PARAM)).toBe("bauernkranz");
    // A filter change (canonicalisation) must not drop it before the jump happened.
    expect(canonicalStatsParams(search, "overview", "cups").get(CUP_PARAM)).toBe("bauernkranz");
  });
});

describe("matchup sides (one player or a 2v2 team, T7)", () => {
  it("parses one id exactly as before", () => {
    expect(parseMatchupSide("2")).toEqual([2]);
    expect(parseMatchupSide(null)).toEqual([]);
    expect(parseMatchupSide("")).toEqual([]);
  });

  it("parses two comma-separated ids as a team, keeping the URL's order", () => {
    expect(parseMatchupSide("1,5")).toEqual([1, 5]);
    expect(parseMatchupSide("5,1")).toEqual([5, 1]);
    expect(parseMatchupSide(" 1 , 5 ")).toEqual([1, 5]);
  });

  it("drops junk, zero, duplicates and anything past the second id", () => {
    expect(parseMatchupSide("abc")).toEqual([]);
    expect(parseMatchupSide("0,-3,2")).toEqual([2]);
    expect(parseMatchupSide("1.5,2")).toEqual([2]);
    expect(parseMatchupSide("3,3")).toEqual([3]);
    expect(parseMatchupSide("1,2,3")).toEqual([1, 2]);
  });

  it("formats a side back into the param value", () => {
    expect(formatMatchupSide([1])).toBe("1");
    expect(formatMatchupSide([1, 5])).toBe("1,5");
    expect(formatMatchupSide([])).toBe("");
    expect(formatMatchupSide([1, 5, 9])).toBe("1,5");
    expect(formatMatchupSide([0, 4])).toBe("4");
  });

  it("collapses a team to its first player when the matchup is left", () => {
    const p = new URLSearchParams("view=h2h&player=1,5&vs=2,4");
    collapseMatchupSide(p, "player");
    expect(p.get("player")).toBe("1");
    // A single id (and a missing param) is untouched.
    const q = new URLSearchParams("player=7");
    collapseMatchupSide(q, "player");
    expect(q.get("player")).toBe("7");
    const r = new URLSearchParams("view=h2h");
    collapseMatchupSide(r, "player");
    expect(r.get("player")).toBeNull();
  });
});

describe("statsMatchupHref — the shortcuts into H2H", () => {
  it("defaults to the Tournaments source (T7)", () => {
    expect(statsMatchupHref({ left: [1], right: [2] })).toBe(
      "/stats?view=h2h&mode=overall&source=tournaments&player=1&vs=2",
    );
  });

  it("addresses both teams for a 2v2 exact matchup", () => {
    expect(statsMatchupHref({ mode: "2v2", left: [1, 5], right: [2, 4] })).toBe(
      "/stats?view=h2h&mode=2v2&source=tournaments&player=1,5&vs=2,4",
    );
  });

  it("carries the together relation and honours an explicit scope", () => {
    expect(statsMatchupHref({ mode: "2v2", left: [1], right: [5], relation: "together", scope: "both" })).toBe(
      "/stats?view=h2h&mode=2v2&source=both&player=1&vs=5&rel=together",
    );
  });

  it("resolves to the H2H section with both sides intact", () => {
    const search = new URLSearchParams(statsMatchupHref({ mode: "2v2", left: [1, 5], right: [2, 4] }).split("?")[1]);
    expect(resolveStatsView(search, "", null)).toEqual({ view: "h2h", sub: "players", legacy: false });
    expect(parseMatchupSide(search.get("player"))).toEqual([1, 5]);
    expect(parseMatchupSide(search.get("vs"))).toEqual([2, 4]);
    expect(search.get("source")).toBe("tournaments");
  });
});

describe("parseSortDir — the Table's ?sort=/?dir= (M3)", () => {
  it("reads only 'asc' as ascending", () => {
    expect(parseSortDir("asc")).toBe("asc");
  });

  it("defaults everything else (absent, unknown, 'desc') to descending", () => {
    expect(parseSortDir(null)).toBe("desc");
    expect(parseSortDir("desc")).toBe("desc");
    expect(parseSortDir("nope")).toBe("desc");
    expect(parseSortDir("")).toBe("desc");
  });
});

describe("recordSectionId — the anchor a ?record= lands on", () => {
  it("prefixes the record key", () => {
    expect(recordSectionId("win_streak")).toBe("record-win_streak");
    expect(recordSectionId("highest_scoring_match")).toBe("record-highest_scoring_match");
  });
});
