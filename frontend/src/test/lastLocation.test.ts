import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  forgetDestination,
  forgetLocation,
  normalizePath,
  rememberLocation,
  resetForgottenPaths,
  resolveDestination,
} from "../ui/shell/lastLocation";
import { NAV_DESTS, type NavDest } from "../ui/shell/navConfig";

const KEY = "lk:dest-last";

function dest(key: string): NavDest {
  const d = NAV_DESTS.find((n) => n.key === key);
  if (!d) throw new Error(`unknown destination ${key}`);
  return d;
}

const TOURNAMENTS = dest("tournaments");
const PLAYERS = dest("players");
const STATS = dest("stats");

function stored(): Record<string, { path: string; ts: number }> {
  return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, { path: string; ts: number }>;
}

describe("lastLocation", () => {
  beforeEach(() => {
    localStorage.clear();
    resetForgottenPaths();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("rememberLocation", () => {
    it("stores the page under the destination that owns it", () => {
      rememberLocation("/live/19", "?tab=matches");

      expect(stored().tournaments.path).toBe("/live/19?tab=matches");
      expect(stored().tournaments.ts).toBeGreaterThan(0);
    });

    it("keeps one page per destination and overwrites it", () => {
      rememberLocation("/live/19", "?tab=matches");
      rememberLocation("/tournaments", "?tab=new");
      rememberLocation("/profiles/1", "?tab=guestbook");

      expect(stored().tournaments.path).toBe("/tournaments?tab=new");
      expect(stored().players.path).toBe("/profiles/1?tab=guestbook");
      expect(Object.keys(stored()).sort()).toEqual(["players", "tournaments"]);
    });

    it("ignores routes outside the nav destinations", () => {
      rememberLocation("/settings", "?tab=appearance");
      rememberLocation("/login", "");
      rememberLocation("/nope", "");

      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it("strips the one-shot deep-link params", () => {
      rememberLocation("/profiles/1", "?tab=guestbook&entry=7&unread=1&comment=3");

      expect(stored().players.path).toBe("/profiles/1?tab=guestbook");
    });

    it("keeps every stats param", () => {
      rememberLocation("/stats", "?view=h2h&sub=players&player=1&vs=2&mode=1v1&source=both");

      expect(stored().stats.path).toBe("/stats?view=h2h&sub=players&player=1&vs=2&mode=1v1&source=both");
    });

    it("keeps sort/dir (filter state) but strips the one-shot record anchor (M3)", () => {
      rememberLocation("/stats", "?view=overview&sub=table&sort=ppm&dir=asc&record=most_points");

      expect(stored().stats.path).toBe("/stats?view=overview&sub=table&sort=ppm&dir=asc");
    });

    it("survives a failing storage write", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota");
      });

      expect(() => rememberLocation("/stats", "?view=trends")).not.toThrow();
    });
  });

  describe("resolveDestination", () => {
    it("returns the root when nothing is remembered", () => {
      expect(resolveDestination(STATS, "/dashboard")).toBe("/stats");
    });

    it("returns the remembered page from another destination", () => {
      rememberLocation("/live/19", "?tab=matches");

      expect(resolveDestination(TOURNAMENTS, "/stats")).toBe("/live/19?tab=matches");
    });

    it("returns the root for the destination you are already in (second tap)", () => {
      rememberLocation("/live/19", "?tab=matches");

      expect(resolveDestination(TOURNAMENTS, "/live/19")).toBe("/tournaments");
      expect(resolveDestination(TOURNAMENTS, "/tournaments")).toBe("/tournaments");
    });

    it("prefers the remembered page over the fallback, and uses the fallback otherwise", () => {
      expect(resolveDestination(TOURNAMENTS, "/stats", "/live/19")).toBe("/live/19");

      rememberLocation("/tournaments", "?tab=new");
      expect(resolveDestination(TOURNAMENTS, "/stats", "/live/19")).toBe("/tournaments?tab=new");
    });

    it("ignores an entry older than the 12h TTL", () => {
      const old = Date.now() - 13 * 60 * 60 * 1000;
      localStorage.setItem(KEY, JSON.stringify({ tournaments: { path: "/live/19", ts: old } }));

      expect(resolveDestination(TOURNAMENTS, "/stats")).toBe("/tournaments");
    });

    it("keeps an entry inside the TTL", () => {
      const recent = Date.now() - 11 * 60 * 60 * 1000;
      localStorage.setItem(KEY, JSON.stringify({ tournaments: { path: "/live/19", ts: recent } }));

      expect(resolveDestination(TOURNAMENTS, "/stats")).toBe("/live/19");
    });

    it("rejects a stored path that the destination does not own", () => {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          tournaments: { path: "/stats?view=trends", ts: Date.now() },
          players: { path: "//evil.example.com", ts: Date.now() },
        }),
      );

      expect(resolveDestination(TOURNAMENTS, "/dashboard")).toBe("/tournaments");
      expect(resolveDestination(PLAYERS, "/dashboard")).toBe("/players");
    });

    it("ignores malformed storage", () => {
      localStorage.setItem(KEY, "{not json");
      expect(resolveDestination(STATS, "/dashboard")).toBe("/stats");

      localStorage.setItem(KEY, JSON.stringify({ stats: { path: 5 } }));
      expect(resolveDestination(STATS, "/dashboard")).toBe("/stats");
    });
  });

  describe("forgetting", () => {
    it("forgetDestination drops only that destination", () => {
      rememberLocation("/live/19", "?tab=matches");
      rememberLocation("/profiles/1", "");

      forgetDestination("tournaments");

      expect(resolveDestination(TOURNAMENTS, "/stats")).toBe("/tournaments");
      expect(resolveDestination(PLAYERS, "/stats")).toBe("/profiles/1");
    });

    it("forgetLocation drops the entry pointing at that exact URL", () => {
      rememberLocation("/live/99999", "");

      forgetLocation("/live/99999");

      expect(resolveDestination(TOURNAMENTS, "/stats")).toBe("/tournaments");
    });

    it("forgetLocation keeps a different remembered page", () => {
      rememberLocation("/live/19", "?tab=matches");

      forgetLocation("/live/99999");

      expect(resolveDestination(TOURNAMENTS, "/stats")).toBe("/live/19?tab=matches");
    });

    it("forgetLocation matches the stored path after stripping one-shot params", () => {
      rememberLocation("/profiles/999", "?tab=guestbook&entry=3");

      forgetLocation("/profiles/999?tab=guestbook&entry=3");

      expect(resolveDestination(PLAYERS, "/stats")).toBe("/players");
    });

    it("never remembers a forgotten URL again in this session", () => {
      rememberLocation("/live/99999", "");
      forgetLocation("/live/99999");

      // The shell's remember effect runs after the page's forget effect.
      rememberLocation("/live/99999", "");

      expect(resolveDestination(TOURNAMENTS, "/stats")).toBe("/tournaments");
    });

    it("does nothing for a URL outside the nav destinations", () => {
      rememberLocation("/stats", "?view=trends");

      forgetLocation("/nope");

      expect(resolveDestination(STATS, "/dashboard")).toBe("/stats?view=trends");
    });
  });

  describe("normalizePath", () => {
    it("drops an empty query and the one-shot params", () => {
      expect(normalizePath("/tournaments", "")).toBe("/tournaments");
      expect(normalizePath("/profiles/1", "?entry=3")).toBe("/profiles/1");
      expect(normalizePath("/profiles/1", "?tab=guestbook&unread=1")).toBe("/profiles/1?tab=guestbook");
      // `?cup=` jumps to one cup once; the Stats tab must not replay it (T5).
      expect(normalizePath("/stats", "?view=overview&sub=cups&cup=bauernkranz")).toBe("/stats?view=overview&sub=cups");
      // `?record=` is the same shape, for a badge's landing in Streaks/Records (M3).
      expect(normalizePath("/stats", "?view=overview&sub=streaks&record=win_streak")).toBe("/stats?view=overview&sub=streaks");
    });
  });
});
