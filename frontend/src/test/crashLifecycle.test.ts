import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BLANK_NOTICE_ID, paintBlankNotice, removeBlankNotice } from "../diagnostics/blankNotice";
import { recordCrumb, resetCrumbs } from "../diagnostics/breadcrumbs";
import { readCrashLog, recordUnexpectedEnd, resetCrashLog } from "../diagnostics/crashLog";
import { reportBlankScreen } from "../diagnostics/install";
import {
  ALIVE_KEY,
  type AliveMarker,
  BOOT_GRACE_MS,
  RENDER_CHECK_MS,
  markAlive,
  resetLifecycle,
  setBlankScreenHandler,
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
    removeBlankNotice();
    document.body.innerHTML = "";
  });

  describe("unexpectedEnd", () => {
    it("reports a session that was still in the foreground when it stopped", () => {
      const end = unexpectedEnd(marker({ u: "/stats?view=h2h" }));
      expect(end).not.toBeNull();
      expect(end?.kind).toBe("stopped");
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

  /**
   * The rule Roli's second unrecorded crash forced into existence: a screen that
   * blanks while the document stays alive. The old heartbeat kept writing
   * `visible` because nothing ever asked whether anything was on screen, and his
   * only possible reaction — backgrounding it — rewrote the marker to `hidden`,
   * which is never reported. Both halves are covered here.
   */
  describe("the blank-screen detector", () => {
    let seen: { ts: number; url: string; trail: { u: string }[] }[] = [];

    function mountRoot(withContent: boolean): HTMLElement {
      const root = document.createElement("div");
      root.id = "root";
      if (withContent) root.appendChild(document.createElement("div"));
      document.body.appendChild(root);
      return root;
    }

    beforeEach(() => {
      document.body.innerHTML = "";
      seen = [];
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-16T10:00:00Z"));
      setBlankScreenHandler((end) => seen.push(end));
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("records the blank there and then, with the trail and the URL, and nothing thrown", () => {
      const root = mountRoot(true);
      startLifecycleMonitor();
      recordCrumb("/tournaments", "PUSH");
      recordCrumb("/live/4", "PUSH");

      vi.advanceTimersByTime(RENDER_CHECK_MS); // a tick that sees the app drawing: armed
      expect(seen).toHaveLength(0);

      root.replaceChildren(); // the root emptied from outside React
      vi.advanceTimersByTime(RENDER_CHECK_MS);

      expect(seen).toHaveLength(1);
      expect(seen[0].url).toBe("/");
      expect(seen[0].trail.map((c) => c.u)).toEqual(["/tournaments", "/live/4"]);
    });

    it("cannot fire twice for the same incident", () => {
      const root = mountRoot(true);
      startLifecycleMonitor();
      vi.advanceTimersByTime(RENDER_CHECK_MS);
      root.replaceChildren();

      vi.advanceTimersByTime(RENDER_CHECK_MS * 10);

      expect(seen).toHaveLength(1);
    });

    it("stamps the blank into the marker, so backgrounding cannot bury it", () => {
      const root = mountRoot(true);
      startLifecycleMonitor();
      vi.advanceTimersByTime(RENDER_CHECK_MS);
      root.replaceChildren();
      vi.advanceTimersByTime(RENDER_CHECK_MS);

      // ...and now the only sensible reaction to a black screen.
      window.dispatchEvent(new Event("pagehide"));

      const stored = takePreviousMarker();
      expect(stored?.phase).toBe("hidden");
      expect(typeof stored?.blank).toBe("number");
      const end = unexpectedEnd(stored);
      expect(end?.kind).toBe("blank");
      expect(end?.ts).toBe(stored?.blank);
    });

    it("sees a blank screen on the way out, when the backgrounding beats the next tick", () => {
      const root = mountRoot(true);
      startLifecycleMonitor();
      vi.advanceTimersByTime(RENDER_CHECK_MS);

      root.replaceChildren();
      window.dispatchEvent(new Event("pagehide")); // no tick in between

      expect(seen).toHaveLength(1);
      const stored = takePreviousMarker();
      expect(stored?.phase).toBe("hidden");
      expect(unexpectedEnd(stored)?.kind).toBe("blank");
    });

    it("says nothing about the window between createRoot and the first paint", () => {
      mountRoot(false); // React has not committed yet — the root is legitimately empty
      startLifecycleMonitor();

      vi.advanceTimersByTime(RENDER_CHECK_MS * 20);
      window.dispatchEvent(new Event("pagehide"));

      expect(seen).toHaveLength(0);
      expect(unexpectedEnd(takePreviousMarker())).toBeNull();
    });

    it("says nothing inside the boot grace, even once it has seen the app draw", () => {
      const root = mountRoot(true);
      startLifecycleMonitor();
      recordCrumb("/dashboard", "PUSH");
      markAlive(); // the first navigation arms the detector

      vi.advanceTimersByTime(500);
      root.replaceChildren();
      markAlive();

      expect(BOOT_GRACE_MS).toBeGreaterThan(500);
      expect(seen).toHaveLength(0);

      vi.advanceTimersByTime(RENDER_CHECK_MS); // past the grace: now it counts
      expect(seen).toHaveLength(1);
    });

    it("says nothing about a page that legitimately renders very little", () => {
      const root = mountRoot(true);
      root.replaceChildren(document.createElement("div")); // one empty element is still a render
      startLifecycleMonitor();

      vi.advanceTimersByTime(RENDER_CHECK_MS * 20);

      expect(seen).toHaveLength(0);
    });

    it("says nothing when React replaced the root rather than emptying it", () => {
      const root = mountRoot(true);
      startLifecycleMonitor();
      vi.advanceTimersByTime(RENDER_CHECK_MS);

      root.remove();
      const replacement = mountRoot(true);
      vi.advanceTimersByTime(RENDER_CHECK_MS * 3);
      expect(seen).toHaveLength(0);

      // ...but the replacement going empty is still a blank screen.
      replacement.replaceChildren();
      vi.advanceTimersByTime(RENDER_CHECK_MS);
      expect(seen).toHaveLength(1);
    });

    it("says nothing about an ordinary backgrounding", () => {
      mountRoot(true);
      startLifecycleMonitor();
      vi.advanceTimersByTime(RENDER_CHECK_MS * 4);

      window.dispatchEvent(new Event("pagehide"));

      expect(seen).toHaveLength(0);
      const stored = takePreviousMarker();
      expect(stored?.phase).toBe("hidden");
      expect(stored?.blank).toBeUndefined();
      expect(unexpectedEnd(stored)).toBeNull();
    });

    it("looks five times per storage write, so the write cadence is unchanged", () => {
      mountRoot(true);
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      startLifecycleMonitor();

      vi.advanceTimersByTime(15_000);

      // The boot write plus exactly one heartbeat write in 15 s — five looks, two writes.
      expect(setItem.mock.calls.filter((c) => c[0] === ALIVE_KEY)).toHaveLength(2);
    });

    it("never throws, whatever the document or the handler does", () => {
      const root = mountRoot(true);
      setBlankScreenHandler(() => {
        throw new Error("the handler itself is broken");
      });
      startLifecycleMonitor();
      vi.advanceTimersByTime(RENDER_CHECK_MS);
      root.replaceChildren();

      expect(() => vi.advanceTimersByTime(RENDER_CHECK_MS * 3)).not.toThrow();
      expect(() => window.dispatchEvent(new Event("pagehide"))).not.toThrow();
    });
  });

  describe("what a blank screen leaves behind", () => {
    beforeEach(() => {
      document.body.innerHTML = "";
    });

    it("records it, and says so on the screen that is otherwise empty", () => {
      const root = document.createElement("div");
      root.id = "root";
      document.body.appendChild(root);

      reportBlankScreen({ ts: 1_700_000_000_000, url: "/live/9", trail: [] });

      const entry = readCrashLog()[0];
      expect(entry.source).toBe("blank-screen");
      expect(entry.url).toBe("/live/9");

      const notice = document.getElementById(BLANK_NOTICE_ID);
      expect(notice).not.toBeNull();
      expect(root.contains(notice)).toBe(true);
      expect(notice?.textContent).toContain("stopped drawing");
      expect(notice?.textContent).toContain("Diagnostics");
      const labels = Array.from(notice?.querySelectorAll("button") ?? []).map((b) => b.textContent);
      expect(labels).toContain("Reload");
    });

    it("paints once, needs no root, and never throws", () => {
      const root = document.createElement("div");
      root.id = "root";
      document.body.appendChild(root);

      paintBlankNotice();
      paintBlankNotice();
      expect(document.querySelectorAll(`#${BLANK_NOTICE_ID}`)).toHaveLength(1);

      removeBlankNotice();
      root.remove();
      expect(() => paintBlankNotice()).not.toThrow();
      expect(document.body.querySelector(`#${BLANK_NOTICE_ID}`)).not.toBeNull();
    });
  });

});
