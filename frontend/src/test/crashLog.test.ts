import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_CRUMBS, readCrumbs, recordCrumb, resetCrumbs } from "../diagnostics/breadcrumbs";
import {
  CRASH_LOG_KEY,
  MAX_CRASH_ENTRIES,
  describeThrown,
  formatCrashLog,
  readCrashLog,
  recordCrash,
  resetCrashLog,
} from "../diagnostics/crashLog";
import { resetLifecycle } from "../diagnostics/lifecycle";

/** Distinct Error objects that share a message *and* a stack origin — a loop. */
function loopError(message: string): Error {
  return new Error(message);
}

function crashKeyWrites(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter((c) => c[0] === CRASH_LOG_KEY).length;
}

describe("crash recorder", () => {
  beforeEach(() => {
    localStorage.clear();
    resetCrashLog();
    resetCrumbs();
    resetLifecycle();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetCrashLog();
    resetLifecycle();
  });

  describe("the ring buffer", () => {
    it("keeps only the newest MAX_CRASH_ENTRIES, newest first", () => {
      for (let i = 0; i < MAX_CRASH_ENTRIES + 5; i++) {
        // Well outside both the merge and the burst window: each one is its own incident.
        vi.advanceTimersByTime(20_000);
        recordCrash({ source: "window-error", value: new Error(`boom ${i}`) });
      }

      const log = readCrashLog();
      expect(log).toHaveLength(MAX_CRASH_ENTRIES);
      expect(log[0].message).toBe(`boom ${MAX_CRASH_ENTRIES + 4}`);
      expect(log[log.length - 1].message).toBe("boom 5");
    });

    it("survives a reload: what was written is what is read back", () => {
      recordCrash({ source: "route-boundary", value: new Error("persisted") });
      vi.advanceTimersByTime(2000);
      const stored = localStorage.getItem(CRASH_LOG_KEY);
      expect(stored).toBeTruthy();

      // A fresh module state, storage as the next boot finds it.
      resetCrashLog();
      localStorage.setItem(CRASH_LOG_KEY, stored ?? "");
      expect(readCrashLog()[0]?.message).toBe("persisted");
    });

    it("skips a stored entry that is malformed instead of throwing on it", () => {
      localStorage.setItem(
        CRASH_LOG_KEY,
        JSON.stringify([{ nonsense: true }, { ts: 1, message: "good one", source: "window-error", trail: "no" }]),
      );
      const log = readCrashLog();
      expect(log).toHaveLength(1);
      expect(log[0].message).toBe("good one");
      expect(log[0].trail).toEqual([]);
    });
  });

  describe("the loop guard", () => {
    it("folds a repeating error into one entry and writes storage at most once a second", () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");

      // 200 hits over 2 seconds — a render loop.
      for (let i = 0; i < 200; i++) {
        recordCrash({ source: "window-error", value: loopError("Maximum update depth exceeded") });
        vi.advanceTimersByTime(10);
      }

      const log = readCrashLog();
      expect(log).toHaveLength(1);
      // `count` is sampled at 400 ms, so it says "it kept happening" without
      // claiming 200 separate incidents; the span is the real measure.
      expect(log[0].count).toBeGreaterThan(1);
      expect(log[0].count).toBeLessThan(10);
      expect((log[0].lastTs ?? 0) - log[0].ts).toBeGreaterThanOrEqual(1900);
      // Leading write + one per second, not 200.
      expect(crashKeyWrites(setItem)).toBeLessThanOrEqual(4);
    });

    it("folds a burst of *different* errors into the newest entry once its budget is spent", () => {
      for (let i = 0; i < 50; i++) {
        recordCrash({ source: "window-error", value: new Error(`different ${i}`) });
        vi.advanceTimersByTime(10);
      }

      const log = readCrashLog();
      expect(log).toHaveLength(5);
      // Every folded error is counted exactly; `count` stays the sampled measure.
      expect(log[0].suppressed).toBe(45);
      expect(log[0].count).toBeGreaterThanOrEqual(1);
    });

    it("starts a new entry once the same error comes back after a quiet spell", () => {
      recordCrash({ source: "window-error", value: loopError("flaky") });
      vi.advanceTimersByTime(30_000);
      recordCrash({ source: "window-error", value: loopError("flaky") });

      expect(readCrashLog()).toHaveLength(2);
    });

    it("counts one throw once however many channels shout about it", () => {
      // React re-renders a failed tree and, in dev, re-throws to `window`: the
      // same crash arrives two or three times within milliseconds, as different
      // Error objects. The user saw one crash and the log must say one.
      recordCrash({ source: "window-error", value: loopError("Maximum update depth exceeded") });
      vi.advanceTimersByTime(3);
      recordCrash({ source: "window-error", value: loopError("Maximum update depth exceeded") });
      vi.advanceTimersByTime(2);
      recordCrash({
        source: "app-boundary",
        value: loopError("Maximum update depth exceeded"),
        componentStack: "\n    at ShellInner",
      });

      const log = readCrashLog();
      expect(log).toHaveLength(1);
      expect(log[0].count).toBe(1);
      // ...and the entry says it came from the boundary, not from `window`.
      expect(log[0].source).toBe("app-boundary");
      expect(log[0].componentStack).toContain("ShellInner");
    });

    it("counts one incident once when it arrives through two channels", () => {
      // React re-throws a boundary-caught error to `window` in dev: same object, twice.
      const err = new Error("double reported");
      recordCrash({ source: "window-error", value: err });
      recordCrash({ source: "app-boundary", value: err, componentStack: "\n    at ShellInner" });

      const log = readCrashLog();
      expect(log).toHaveLength(1);
      expect(log[0].count).toBe(1);
      expect(log[0].source).toBe("app-boundary");
      expect(log[0].componentStack).toContain("ShellInner");
    });
  });

  describe("when storage is unavailable", () => {
    it("still records in memory and never throws", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("site data blocked");
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("quota exceeded");
      });

      expect(() => recordCrash({ source: "window-error", value: new Error("still recorded") })).not.toThrow();
      vi.advanceTimersByTime(2000);

      const log = readCrashLog();
      expect(log).toHaveLength(1);
      expect(log[0].message).toBe("still recorded");
    });
  });

  describe("values that are not Errors", () => {
    it("describes each one as a sentence instead of throwing a second time", () => {
      expect(describeThrown("plain string").message).toBe("plain string");
      expect(describeThrown(null).message).toBe("null was thrown");
      expect(describeThrown(undefined).message).toBe("undefined was thrown");
      expect(describeThrown(42).message).toBe("42");
      expect(describeThrown({ code: 7 }).message).toBe('{"code":7}');
      expect(describeThrown(new TypeError("bad type")).message).toBe("TypeError: bad type");

      const circular: Record<string, unknown> = {};
      circular.self = circular;
      expect(describeThrown(circular).message).toBeTruthy();

      const hostile = {
        get message(): string {
          throw new Error("even the message throws");
        },
      };
      expect(describeThrown(hostile).message).toBe("Unserialisable value thrown");
      expect(describeThrown(Symbol("sigil")).message).toContain("sigil");
    });

    it("records a hostile value without taking the app down with it", () => {
      const hostile = {
        get message(): string {
          throw new Error("nope");
        },
        get stack(): string {
          throw new Error("nope either");
        },
      };

      expect(() => recordCrash({ source: "unhandled-rejection", value: hostile })).not.toThrow();
      expect(() => recordCrash({ source: "unhandled-rejection", value: Symbol("weird") })).not.toThrow();

      const log = readCrashLog();
      expect(log.length).toBeGreaterThanOrEqual(1);
      expect(log.every((e) => typeof e.message === "string" && e.message.length > 0)).toBe(true);
    });
  });

  describe("the navigation trail", () => {
    it("attaches the last MAX_CRUMBS navigations, with how each one arrived", () => {
      for (let i = 0; i < MAX_CRUMBS + 5; i++) recordCrumb(`/p${i}`, i % 2 ? "POP" : "PUSH");
      expect(readCrumbs()).toHaveLength(MAX_CRUMBS);

      recordCrash({ source: "app-boundary", value: new Error("with trail") });
      const entry = readCrashLog()[0];

      expect(entry.trail).toHaveLength(MAX_CRUMBS);
      expect(entry.trail[0].u).toBe("/p5");
      expect(entry.trail[MAX_CRUMBS - 1].u).toBe(`/p${MAX_CRUMBS + 4}`);
      expect(entry.trail.map((c) => c.k)).toContain("POP");
    });

    it("shows a swipe-back loop as what it is: a burst of POPs", () => {
      for (let i = 0; i < 6; i++) {
        recordCrumb("/stats?view=h2h", "POP");
        vi.advanceTimersByTime(30);
      }
      recordCrash({ source: "app-boundary", value: new Error("Maximum update depth exceeded") });

      const trail = readCrashLog()[0].trail;
      expect(trail.every((c) => c.k === "POP")).toBe(true);
      expect(trail[trail.length - 1].t - trail[0].t).toBeLessThan(1000);
    });
  });

  describe("the copyable report", () => {
    it("names the source, the page and the trail of every entry", () => {
      recordCrumb("/tournaments", "PUSH");
      recordCrash({ source: "route-boundary", value: new Error("readable"), url: "/live/4" });

      const text = formatCrashLog(readCrashLog());
      expect(text).toContain("Page boundary");
      expect(text).toContain("readable");
      expect(text).toContain("/live/4");
      expect(text).toContain("/tournaments");
      expect(text).toContain("Navigation trail (1)");
    });

    it("says so when there is nothing recorded", () => {
      expect(formatCrashLog([])).toContain("(nothing recorded)");
    });
  });
});
