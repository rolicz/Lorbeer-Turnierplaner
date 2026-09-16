/**
 * Liveness marker + blank-screen detector: making a death that throws nothing
 * visible, and making a death that leaves the document behind visible *at all*.
 *
 * The four error sources (`crashLog`) only fire when JS throws. Two deaths do
 * not throw, and this module owns both.
 *
 * **1. The page is taken away.** iOS jettisons the web view under memory
 * pressure, or the renderer is killed outright: nothing throws, nothing is
 * recorded, and the next boot looks exactly like a boot after a clean exit. So
 * the app leaves a small "still alive, here is where I was" marker in storage
 * and keeps it current. The next boot reads it **once** (`takePreviousMarker`)
 * and asks one question: *what was the last thing this app was doing?*
 *
 * - `phase: "hidden"` — the last thing we saw was the app going to the
 *   background or the page unloading. Backgrounding a PWA is not a death, and
 *   neither is a reload or a closed tab, so this is **never** reported (unless it
 *   carries `blank`, below). That is what keeps the log from accusing the app
 *   every time Roli switches apps.
 * - `phase: "visible"` — the last thing we saw was the heartbeat, with the app
 *   in the foreground, and then the session simply stopped. Nothing ran the
 *   `pagehide`/`visibilitychange` handlers, which means the page did not leave:
 *   it was taken away. That is the unclean death, reported as a synthetic entry.
 *
 * **2. The screen goes blank and the document survives** — the case that used to
 * leave no trace at all, and the one Roli keeps hitting (2026-09-16: *"i now
 * just had a crash again ... but nothing recorded"*). The diagnostics install
 * before React and run independently of it, so when the React root is emptied
 * the heartbeat carries happily on writing `phase: "visible"`: nothing ever asked
 * whether anything was still on screen. And the only sensible reaction to a black
 * screen — backgrounding it, force-quitting it — rewrites the marker to `hidden`,
 * which is deliberately never reported. Reacting to the crash destroyed the
 * evidence of it.
 *
 * So every tick now **looks at the screen**: is the mount point still holding a
 * rendered tree? If it is not, the entry is recorded *there and then*, with the
 * URL and the navigation trail, without anything having thrown — and the fact is
 * stamped into the marker as well (`blank`), so a `pagehide` a second later
 * cannot erase it. The instrument stopped depending on someone watching when it
 * happens.
 *
 * **What the look costs.** Two property reads: `isConnected` (a flag on the node)
 * and `firstElementChild` (a pointer). Neither forces layout, neither walks the
 * tree — no `offsetHeight`, no `getBoundingClientRect`, no `getComputedStyle`.
 * The tick runs every 3 s; the *storage* write stays exactly where it was, one
 * small `localStorage` write per 15 s of foreground (every 5th tick), plus a
 * trail-free write on `pagehide` — the hidden marker only has to say "it was
 * backgrounded", and `pagehide` gets very little time on iOS. The full trail
 * rides on the visible heartbeat, which is the only marker an unclean death can
 * leave behind anyway.
 *
 * **What cannot happen.** A false "your app died" is worse than none — it trains
 * the reader to ignore the log — so the detector fires only when *all* of these
 * hold: it has seen a rendered tree at least once in this document (so a boot
 * that never drew, and the window between `createRoot` and the first paint, are
 * not it); the mount point is empty now (a legitimately small render still has
 * the shell in it, and a root React *replaced* rather than emptied is re-resolved
 * by id before it counts); the document has been alive longer than `BOOT_GRACE_MS`;
 * and it has not already fired in this document.
 */
import { readStored, removeStored, writeStored } from "../utils/safeStorage";
import { readCrumbs, type Crumb } from "./breadcrumbs";

export const ALIVE_KEY = "lk:diag:alive";

/** How often the foreground marker is refreshed. */
export const HEARTBEAT_MS = 15_000;
/**
 * How often the app is *looked at*. Five times per marker write: the look costs
 * two property reads, and a blank screen should be named while the reader is
 * still in front of it, not up to 15 s later.
 */
export const RENDER_CHECK_MS = 3000;
/** Ticks per storage write — so the write cadence is unchanged by the faster look. */
const TICKS_PER_MARKER = Math.max(1, Math.round(HEARTBEAT_MS / RENDER_CHECK_MS));
/**
 * A recorded error this close to the last heartbeat already explains the death:
 * the crash entry is the better story, so no synthetic entry is added next to it.
 */
export const ERROR_EXPLAINS_MS = 60_000;
/**
 * Nothing is called a blank screen before the document has had this long to
 * exist. Belt and braces only — the detector already refuses to fire before it
 * has seen a rendered tree, which cannot happen before the first commit.
 */
export const BOOT_GRACE_MS = 2500;
/** The element `main.tsx` mounts React into. */
const ROOT_ID = "root";
/** A loop of errors must not turn into a loop of marker writes. */
const ERROR_WRITE_THROTTLE_MS = 2000;
/**
 * ...and neither must a loop of navigations. The marker is refreshed on every
 * navigation (that is when its trail changes, and a 15 s heartbeat would leave
 * the first seconds of a document with an empty one), but never more than once
 * a second, leading write plus a trailing one so nothing recent is missed.
 */
const NAV_WRITE_THROTTLE_MS = 1000;

export type AlivePhase = "visible" | "hidden";

export type AliveMarker = {
  /** When the marker was last written. */
  ts: number;
  phase: AlivePhase;
  /** `pathname + search` at that moment. */
  u: string;
  /** The navigation trail — only carried by a foreground marker. */
  trail?: Crumb[];
  /** When this session last recorded a real error, if it did. */
  err?: number;
  /**
   * When this session was last seen with nothing on screen. Survives the
   * `pagehide` rewrite on purpose: backgrounding a blank screen is how a reader
   * reacts to one, and it must not be how the evidence disappears.
   */
  blank?: number;
};

/** What the previous session's marker turned out to mean. */
export type UnexpectedEnd = {
  /** `blank` — it had stopped drawing. `stopped` — it was in the foreground and simply ended. */
  kind: "blank" | "stopped";
  ts: number;
  url: string;
  trail: Crumb[];
};

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let ticks = 0;
let lastErrorTs = 0;
let lastErrorWriteTs = 0;
let lastNavWriteTs = 0;
let navTimer: ReturnType<typeof setTimeout> | null = null;
let startedTs = 0;
/** The mount point we last found, held so the common tick is a single flag read. */
let rootEl: Element | null = null;
/** Has a rendered tree ever been seen in this document? Nothing fires before it has. */
let sawRender = false;
/** When the blank screen was seen. Also the "one incident, one report" guard. */
let blankTs = 0;
let onBlank: ((end: { ts: number; url: string; trail: Crumb[] }) => void) | null = null;

function currentUrl(): string {
  try {
    return `${window.location.pathname}${window.location.search}`;
  } catch {
    return "";
  }
}

function isHidden(): boolean {
  try {
    return typeof document !== "undefined" && document.visibilityState === "hidden";
  } catch {
    return false;
  }
}

/* -- is anything on screen? ----------------------------------------------- */

/**
 * The mount point. Held between ticks; re-resolved by id only when the element
 * we were holding has left the document — React replacing the container (or
 * anything else rewriting `<body>`) must not read as a death.
 */
function rootNode(): Element | null {
  try {
    if (rootEl && rootEl.isConnected) return rootEl;
    rootEl = typeof document !== "undefined" ? document.getElementById(ROOT_ID) : null;
    return rootEl;
  } catch {
    return null;
  }
}

/**
 * Is the app still drawing? Two O(1) property reads, neither layout-forcing.
 * "Drawing" deliberately means *the mount point holds an element* — not that it
 * is visible, not that it has a given size: anything richer would need geometry,
 * and geometry costs a reflow on every tick.
 */
function isRendering(): boolean {
  const el = rootNode();
  if (!el) return false; // the mount point itself is gone from the document
  try {
    return el.firstElementChild != null;
  } catch {
    return true; // cannot tell — never accuse the app on a failed read
  }
}

/**
 * One look. Returns true exactly once, on the tick that first finds the app no
 * longer drawing. See the module comment for every condition that has to hold.
 */
function checkRender(now: number): boolean {
  try {
    if (blankTs) return false; // one incident, one report
    if (isRendering()) {
      sawRender = true;
      return false;
    }
    if (!sawRender) return false; // it never drew: a boot failure, not a blanking
    if (now - startedTs < BOOT_GRACE_MS) return false;
    blankTs = now;
    const end = { ts: now, url: currentUrl(), trail: readCrumbs() };
    try {
      onBlank?.(end);
    } catch {
      // the recorder is never the reason something breaks
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * What to do the moment the app stops drawing. Wired by `install.ts` (record it,
 * flush it, paint a message into the empty root) — kept as a callback so this
 * module never has to import the recorder it feeds.
 */
export function setBlankScreenHandler(fn: ((end: { ts: number; url: string; trail: Crumb[] }) => void) | null): void {
  onBlank = fn;
}

/* -- the marker ----------------------------------------------------------- */

/** Write the marker. `full` carries the trail; the cheap form does not. */
function writeMarker(phase: AlivePhase, full: boolean): void {
  try {
    const marker: AliveMarker = { ts: Date.now(), phase, u: currentUrl() };
    if (full) marker.trail = readCrumbs();
    if (lastErrorTs) marker.err = lastErrorTs;
    if (blankTs) marker.blank = blankTs;
    writeStored(ALIVE_KEY, JSON.stringify(marker));
  } catch {
    // ignore — the recorder is never the reason something breaks
  }
}

function parseMarker(raw: string | null): AliveMarker | null {
  try {
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const m = parsed as Record<string, unknown>;
    if (typeof m.ts !== "number" || !Number.isFinite(m.ts)) return null;
    if (m.phase !== "visible" && m.phase !== "hidden") return null;
    const trail: Crumb[] = [];
    if (Array.isArray(m.trail)) {
      for (const raw of m.trail) {
        const c = raw as Record<string, unknown> | null;
        if (!c || typeof c.t !== "number" || typeof c.u !== "string") continue;
        const k = c.k === "PUSH" || c.k === "POP" || c.k === "REPLACE" ? c.k : "PUSH";
        trail.push({ t: c.t, u: c.u, k });
      }
    }
    return {
      ts: m.ts,
      phase: m.phase,
      u: typeof m.u === "string" ? m.u : "",
      trail,
      err: typeof m.err === "number" && Number.isFinite(m.err) ? m.err : undefined,
      blank: typeof m.blank === "number" && Number.isFinite(m.blank) ? m.blank : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Read the marker the previous session left behind and clear it, so whatever it
 * says is reported exactly once.
 */
export function takePreviousMarker(): AliveMarker | null {
  const marker = parseMarker(readStored(ALIVE_KEY));
  removeStored(ALIVE_KEY);
  return marker;
}

/**
 * Did the previous session end unexpectedly, and how? Pure, so the rule can be
 * tested without a browser. See the module comment for why a plain backgrounding
 * never counts — and why one carrying `blank` does.
 */
export function unexpectedEnd(marker: AliveMarker | null): UnexpectedEnd | null {
  if (!marker) return null;
  // The screen was blank when we last looked. It stays reportable however the
  // session then ended: backgrounding a dead app is the reaction, not the cause.
  if (typeof marker.blank === "number") {
    return { kind: "blank", ts: marker.blank, url: marker.u, trail: marker.trail ?? [] };
  }
  // Backgrounded, reloaded or closed — an ordinary end, not a death.
  if (marker.phase !== "visible") return null;
  // An error was recorded right before the app stopped: that entry is the story.
  if (typeof marker.err === "number" && marker.ts - marker.err <= ERROR_EXPLAINS_MS) return null;
  return { kind: "stopped", ts: marker.ts, url: marker.u, trail: marker.trail ?? [] };
}

/** Told by `crashLog` that a real error was recorded, so a death right after it is explained. */
export function noteErrorRecorded(ts: number): void {
  try {
    lastErrorTs = ts;
    // The first error of a burst persists immediately (it is the one that counts);
    // the rest only update the in-memory value the next marker write will carry.
    if (ts - lastErrorWriteTs < ERROR_WRITE_THROTTLE_MS) return;
    lastErrorWriteTs = ts;
    writeMarker(isHidden() ? "hidden" : "visible", !isHidden());
  } catch {
    // ignore
  }
}

/**
 * Called on every navigation: keeps the marker's trail current, so an unclean
 * death two seconds after a swipe still carries the swipes that led to it. It is
 * also the earliest moment the detector can arm — this runs from an effect, so
 * the tree is committed by the time it does.
 */
export function markAlive(): void {
  try {
    if (!started || isHidden()) return;
    const now = Date.now();
    if (checkRender(now)) {
      writeMarker("visible", true);
      return;
    }
    if (navTimer != null) return;
    const since = now - lastNavWriteTs;
    if (since >= NAV_WRITE_THROTTLE_MS) {
      lastNavWriteTs = now;
      writeMarker("visible", true);
      return;
    }
    navTimer = setTimeout(() => {
      navTimer = null;
      lastNavWriteTs = Date.now();
      if (!isHidden()) writeMarker("visible", true);
    }, NAV_WRITE_THROTTLE_MS - since);
  } catch {
    // ignore
  }
}

function stopTimer(): void {
  if (navTimer != null) {
    clearTimeout(navTimer);
    navTimer = null;
  }
  if (timer != null) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * One tick: look at the screen every time, write the marker every fifth time.
 * A blank screen writes immediately — that marker is the evidence.
 */
function tick(): void {
  try {
    const now = Date.now();
    const blank = checkRender(now);
    ticks += 1;
    if (blank || ticks % TICKS_PER_MARKER === 0) writeMarker("visible", true);
  } catch {
    // ignore
  }
}

function startTimer(): void {
  stopTimer();
  ticks = 0;
  try {
    timer = setInterval(tick, RENDER_CHECK_MS);
  } catch {
    // ignore
  }
}

/** Begin marking this session alive. Idempotent. */
export function startLifecycleMonitor(): void {
  if (started) return;
  started = true;
  startedTs = Date.now();
  try {
    const onHide = () => {
      stopTimer();
      // Look before the marker is rewritten: if the screen was already blank, a
      // backgrounding must not be what buries it.
      checkRender(Date.now());
      writeMarker("hidden", false); // cheap: pagehide gets very little time on iOS
    };
    const onVisibility = () => {
      if (isHidden()) onHide();
      else {
        checkRender(Date.now());
        writeMarker("visible", true);
        startTimer();
      }
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    // Restored from the back/forward cache: the timer was stopped on the way out.
    window.addEventListener("pageshow", (event: PageTransitionEvent) => {
      if (!event.persisted || isHidden()) return;
      checkRender(Date.now());
      writeMarker("visible", true);
      startTimer();
    });
    if (isHidden()) writeMarker("hidden", false);
    else {
      writeMarker("visible", true);
      startTimer();
    }
  } catch {
    // ignore — a missing marker is worse than nothing, but not worth a crash
  }
}

/** Test seam. */
export function resetLifecycle(): void {
  started = false;
  lastErrorTs = 0;
  lastErrorWriteTs = 0;
  lastNavWriteTs = 0;
  startedTs = 0;
  ticks = 0;
  rootEl = null;
  sawRender = false;
  blankTs = 0;
  onBlank = null;
  stopTimer();
}
