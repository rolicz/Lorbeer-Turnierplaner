import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recordCrumb, resetCrumbs } from "../diagnostics/breadcrumbs";
import { readCrashLog, recordUnexpectedEnd, resetCrashLog } from "../diagnostics/crashLog";
import {
  ALIVE_KEY,
  type AliveMarker,
  markAlive,
  resetLifecycle,
  startLifecycleMonitor,
  takePreviousMarker,
  unexpectedEnd,
} from "../diagnostics/lifecycle";

function marker(over: Partial<AliveMarker> = {}): AliveMarker {
  return { ts: 1_000_000, phase: "visible", u: "/live/4", trail: [], ...over };
}

describe("the liveness marker", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLifecycle();
    resetCrashLog();
    resetCrumbs();
  });

  afterEach(() => {
    resetLifecycle();
    resetCrashLog();
  });

  describe("unexpectedEnd", () => {
    it("reports a session that was still in the foreground when it stopped", () => {
      const end = unexpectedEnd(marker({ u: "/stats?view=h2h" }));
      expect(end).not.toBeNull();
      expect(end?.url).toBe("/stats?view=h2h");
    });

    it("says nothing when the app was backgrounded, reloaded or closed", () => {
      // This is the case that would otherwise accuse the app every time Roli
      // switches apps: `pagehide`/`visibilitychange` ran, so the page *left*.
      expect(unexpectedEnd(marker({ phase: "hidden" }))).toBeNull();
    });

    it("says nothing when a recorded error already explains the end", () => {
      expect(unexpectedEnd(marker({ err: 1_000_000 - 5_000 }))).toBeNull();
    });

    it("still reports when the last error was long before the end", () => {
      expect(unexpectedEnd(marker({ err: 1_000_000 - 600_000 }))).not.toBeNull();
    });

    it("says nothing when there is no marker at all (a first boot)", () => {
      expect(unexpectedEnd(null)).toBeNull();
    });
  });

  describe("takePreviousMarker", () => {
    it("reads the marker once and clears it, so it is reported once", () => {
      localStorage.setItem(ALIVE_KEY, JSON.stringify(marker({ trail: [{ t: 1, u: "/dashboard", k: "PUSH" }] })));

      const first = takePreviousMarker();
      expect(first?.phase).toBe("visible");
      expect(first?.trail?.[0]?.u).toBe("/dashboard");
      expect(localStorage.getItem(ALIVE_KEY)).toBeNull();
      expect(takePreviousMarker()).toBeNull();
    });

    it("ignores a marker that is not a marker", () => {
      localStorage.setItem(ALIVE_KEY, "{not json");
      expect(takePreviousMarker()).toBeNull();
      localStorage.setItem(ALIVE_KEY, JSON.stringify({ ts: "soon", phase: "sideways" }));
      expect(takePreviousMarker()).toBeNull();
    });
  });

  describe("the heartbeat", () => {
    it("marks the session alive, and marks it hidden when the page goes away", () => {
      recordCrumb("/dashboard", "PUSH");
      startLifecycleMonitor();

      const alive = JSON.parse(localStorage.getItem(ALIVE_KEY) ?? "{}") as AliveMarker;
      expect(alive.phase).toBe("visible");
      expect(alive.trail?.[0]?.u).toBe("/dashboard");

      window.dispatchEvent(new Event("pagehide"));

      const hidden = JSON.parse(localStorage.getItem(ALIVE_KEY) ?? "{}") as AliveMarker;
      expect(hidden.phase).toBe("hidden");
      // The `pagehide` write is deliberately trail-free: iOS gives it very little time.
      expect(hidden.trail ?? []).toHaveLength(0);
    });

    it("keeps the marker's trail current as the user navigates", () => {
      startLifecycleMonitor();
      // The heartbeat is 15s apart; without this a death in the first seconds of
      // a document would carry an empty trail — the very case we are hunting.
      recordCrumb("/tournaments", "PUSH");
      recordCrumb("/live/4", "PUSH");
      markAlive();

      const alive = JSON.parse(localStorage.getItem(ALIVE_KEY) ?? "{}") as AliveMarker;
      expect((alive.trail ?? []).map((c) => c.u)).toEqual(["/tournaments", "/live/4"]);
    });
  });

  describe("the synthetic entry", () => {
    it("lands in the log as its own kind, carrying the trail the marker held", () => {
      recordUnexpectedEnd({
        ts: 1_700_000_000_000,
        url: "/live/9",
        trail: [{ t: 1_699_999_998_000, u: "/tournaments", k: "POP" }],
      });

      const entry = readCrashLog()[0];
      expect(entry.source).toBe("lifecycle");
      expect(entry.message).toContain("stopped while it was in the foreground");
      expect(entry.url).toBe("/live/9");
      expect(entry.trail[0].u).toBe("/tournaments");
    });
  });
});
