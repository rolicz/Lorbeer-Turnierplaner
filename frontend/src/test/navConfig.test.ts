import { describe, it, expect } from "vitest";
import { NAV_DESTS, activeDest, visibleDests, type Role } from "../ui/shell/navConfig";

const keys = (role: Role) => visibleDests(role).map((d) => d.key);

describe("visibleDests", () => {
  it("shows nothing to an account with no membership", () => {
    // `none` never reaches the shell (RequireAuth shows "not in a group yet"), but the
    // list must not pretend otherwise if it ever did.
    expect(keys("none")).toEqual([]);
  });

  it("shows every destination but Admin, Clubs and Ideas included, to a member", () => {
    // There is no reader any more (L4): everyone behind the login is at least an editor,
    // and every destination but the admin page (L6, owner+) is theirs.
    expect(keys("editor")).toEqual([
      "dashboard",
      "tournaments",
      "friendlies",
      "stats",
      "players",
      "clubs",
      "ideas",
    ]);
  });

  it("adds Admin, last, for an owner and a site admin (L6)", () => {
    expect(keys("owner")).toEqual([...keys("editor"), "admin"]);
    expect(keys("admin")).toEqual(keys("owner"));
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
    expect(activeDest("/ideas")?.key).toBe("ideas");
    expect(activeDest("/admin")?.key).toBe("admin");
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
