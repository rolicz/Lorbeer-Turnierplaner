/**
 * Liveness marker: making a death *without* a JavaScript error visible.
 *
 * The four error sources (`crashLog`) only fire when JS throws. When iOS
 * jettisons the web view under memory pressure — or the WebContent process is
 * killed outright — nothing throws, nothing is recorded, and the next boot looks
 * exactly like a boot after a clean exit. "No entry" would then mean either
 * "nothing broke" or "the whole engine went down", which are different bugs.
 *
 * So the app leaves a small "still alive, here is where I was" marker in storage
 * and keeps it current. The next boot reads it **once** (`takePreviousMarker`)
 * and asks one question: *what was the last thing this app was doing?*
 *
 * - `phase: "hidden"` — the last thing we saw was the app going to the
 *   background or the page unloading. Backgrounding a PWA is not a death, and
 *   neither is a reload or a closed tab, so this is **never** reported. That is
 *   what keeps the log from accusing the app every time Roli switches apps.
 * - `phase: "visible"` — the last thing we saw was the heartbeat, with the app
 *   in the foreground, and then the session simply stopped. Nothing ran the
 *   `pagehide`/`visibilitychange` handlers, which means the page did not leave:
 *   it was taken away. That is the unclean death, and it is reported as a
 *   synthetic entry marked "no error was thrown".
 *
 * Cost: one small `localStorage` write every 15 s while the app is in the
 * foreground (the timer is stopped while hidden), and a **trail-free** write on
 * `pagehide` — the hidden marker only has to say "it was backgrounded", and
 * `pagehide` gets very little time on iOS. The full trail rides on the visible
 * heartbeat, which is the only marker an unclean death can leave behind anyway.
 */
import { readStored, removeStored, writeStored } from "../utils/safeStorage";
import { readCrumbs, type Crumb } from "./breadcrumbs";

export const ALIVE_KEY = "lk:diag:alive";

/** How often the foreground marker is refreshed. */
export const HEARTBEAT_MS = 15_000;
/**
 * A recorded error this close to the last heartbeat already explains the death:
 * the crash entry is the better story, so no synthetic entry is added next to it.
 */
export const ERROR_EXPLAINS_MS = 60_000;
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
};

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;
let lastErrorTs = 0;
let lastErrorWriteTs = 0;
let lastNavWriteTs = 0;
let navTimer: ReturnType<typeof setTimeout> | null = null;

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

/** Write the marker. `full` carries the trail; the cheap form does not. */
function writeMarker(phase: AlivePhase, full: boolean): void {
  try {
    const marker: AliveMarker = { ts: Date.now(), phase, u: currentUrl() };
    if (full) marker.trail = readCrumbs();
    if (lastErrorTs) marker.err = lastErrorTs;
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
 * Did the previous session end unexpectedly? Pure, so the rule can be tested
 * without a browser. See the module comment for why only a foreground marker
 * counts.
 */
export function unexpectedEnd(marker: AliveMarker | null): { ts: number; url: string; trail: Crumb[] } | null {
  if (!marker) return null;
  // Backgrounded, reloaded or closed — an ordinary end, not a death.
  if (marker.phase !== "visible") return null;
  // An error was recorded right before the app stopped: that entry is the story.
  if (typeof marker.err === "number" && marker.ts - marker.err <= ERROR_EXPLAINS_MS) return null;
  return { ts: marker.ts, url: marker.u, trail: marker.trail ?? [] };
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
 * death two seconds after a swipe still carries the swipes that led to it.
 */
export function markAlive(): void {
  try {
    if (!started || isHidden() || navTimer != null) return;
    const now = Date.now();
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

function startTimer(): void {
  stopTimer();
  try {
    timer = setInterval(() => writeMarker("visible", true), HEARTBEAT_MS);
  } catch {
    // ignore
  }
}

/** Begin marking this session alive. Idempotent. */
export function startLifecycleMonitor(): void {
  if (started) return;
  started = true;
  try {
    const onHide = () => {
      stopTimer();
      writeMarker("hidden", false); // cheap: pagehide gets very little time on iOS
    };
    const onVisibility = () => {
      if (isHidden()) onHide();
      else {
        writeMarker("visible", true);
        startTimer();
      }
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
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
  stopTimer();
}
