import { describe, it, expect } from "vitest";
import { NAV_DESTS, activeDest, visibleDests } from "../ui/shell/navConfig";

const keys = (role: "reader" | "editor" | "admin") => visibleDests(role).map((d) => d.key);

describe("visibleDests", () => {
  it("hides Clubs from a reader and keeps the bottom-bar five", () => {
    expect(keys("reader")).toEqual(["dashboard", "tournaments", "friendlies", "stats", "players"]);
  });

  it("adds Clubs for editors and admins", () => {
    expect(keys("editor")).toEqual(["dashboard", "tournaments", "friendlies", "stats", "players", "clubs"]);
    expect(keys("admin")).toEqual(keys("editor"));
  });

  it("keeps the declaration order of NAV_DESTS", () => {
    expect(keys("admin")).toEqual(NAV_DESTS.map((d) => d.key));
  });
});

describe("activeDest", () => {
  it("maps a destination root to itself", () => {
    expect(activeDest("/dashboard")?.key).toBe("dashboard");
    expect(activeDest("/tournaments")?.key).toBe("tournaments");
    expect(activeDest("/friendlies")?.key).toBe("friendlies");
    expect(activeDest("/stats")?.key).toBe("stats");
    expect(activeDest("/players")?.key).toBe("players");
    expect(activeDest("/clubs")?.key).toBe("clubs");
  });

  it("maps live tournament pages to Tournaments", () => {
    expect(activeDest("/live/3")?.key).toBe("tournaments");
    expect(activeDest("/live/3/match/17")?.key).toBe("tournaments");
    expect(activeDest("/tournaments/new")?.key).toBe("tournaments");
  });

  it("maps profile pages to Players", () => {
    expect(activeDest("/profiles/2")?.key).toBe("players");
    expect(activeDest("/profile")?.key).toBe("players");
  });

  it("returns null for pages outside the destinations", () => {
    expect(activeDest("/settings")).toBeNull();
    expect(activeDest("/login")).toBeNull();
    expect(activeDest("/nope")).toBeNull();
  });

  it("does not match a destination on a same-prefix path", () => {
    expect(activeDest("/statsomething")).toBeNull();
    expect(activeDest("/profiles")).toBeNull();
  });
});
