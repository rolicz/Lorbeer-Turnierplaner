/**
 * The crash recorder: a small ring buffer of the last things that went wrong,
 * kept on the device so a crash can be read *after* it happened.
 *
 * Roli's iPhone PWA blanks to the themed page background with an empty body --
 * the bundle had loaded and the theme had been applied, so the tree was mounted
 * and then went away. There is no console on that phone, and it does not
 * reproduce in Chromium, so the only way to learn what threw is to have the app
 * write it down itself. Four sources feed this log (the top-level boundary, the
 * route boundary, `window.onerror`, `unhandledrejection`) plus a fifth synthetic
 * one for a death with no error at all (`lifecycle`).
 *
 * Three rules hold this file together:
 *
 * 1. **The recorder is never the reason something breaks.** Every entry point is
 *    wrapped; a value that cannot be serialised is described as best we can and
 *    otherwise skipped; a storage failure is ignored (`safeStorage`, the path A9
 *    hardened) and the in-memory buffer keeps working.
 * 2. **A loop must not thrash storage.** A repeat of the same error merges into
 *    the newest entry as a count instead of appending, a burst of *different*
 *    errors merges once the burst budget is spent, and storage is written at
 *    most once a second (leading write + trailing flush). A 100/s loop therefore
 *    costs one entry and one write per second.
 * 3. **One incident, one entry.** React re-throws a boundary-caught error to
 *    `window` in dev, so the same object arrives twice; the second arrival
 *    upgrades the entry it already made (boundary detail beats window detail)
 *    rather than counting again.
 */
import { readStored, removeStored, writeStored } from "../utils/safeStorage";
import { readCrumbs, type Crumb } from "./breadcrumbs";
import { noteErrorRecorded } from "./lifecycle";

export const CRASH_LOG_KEY = "lk:diag:crashes";

/** The last 10 is plenty -- this is evidence, not telemetry. */
export const MAX_CRASH_ENTRIES = 10;
/** Caps so one pathological value cannot fill the quota. */
const MAX_MESSAGE_CHARS = 600;
const MAX_STACK_CHARS = 4000;
/** While the same thing keeps happening, it stays one entry. Measured from the last hit. */
const MERGE_WINDOW_MS = 10_000;
/** New entries one burst may append before everything folds into the newest. */
const BURST_WINDOW_MS = 10_000;
const BURST_MAX_NEW_ENTRIES = 5;
/** Storage is written at most this often. */
const FLUSH_INTERVAL_MS = 1000;
/**
 * One throw reaches the recorder more than once: React re-renders a failed tree
 * to build the component stack, and in a dev build it re-throws to `window` as
 * well, so a single crash arrives two or three times within a few milliseconds
 * as *different* Error objects (object identity, rule 3, cannot catch those).
 * A repeat this soon after the last *counted* hit is therefore the same throw
 * being told again -- it refreshes the entry but does not count. `count` is thus
 * sampled at 400 ms: a one-off crash reads 1 however many channels shouted it,
 * and a render loop keeps climbing while `lastTs - ts` says how long it ran.
 */
const SAME_THROW_MS = 400;

export type CrashSource =
  /** Top-level boundary -- the shell, a provider or the router threw. */
  | "app-boundary"
  /** Route boundary -- the page threw. */
  | "route-boundary"
  | "window-error"
  | "unhandled-rejection"
  /** Synthetic: the app ended without anything throwing (`lifecycle`). */
  | "lifecycle";

export type CrashEntry = {
  id: string;
  /** First occurrence. */
  ts: number;
  /** Last occurrence, when it happened more than once. */
  lastTs?: number;
  /** How many times this entry was hit. */
  count: number;
  /** Other errors folded in because the burst budget was spent. */
  suppressed?: number;
  source: CrashSource;
  message: string;
  stack?: string;
  componentStack?: string;
  /** `pathname + search` the error happened on. */
  url: string;
  /** Vite mode -- "development" means the stack points at real source. */
  mode?: string;
  trail: Crumb[];
};

export type RecordInput = {
  source: CrashSource;
  value: unknown;
  componentStack?: string | null;
  /** Overrides, used by the synthetic lifecycle entry. */
  url?: string;
  ts?: number;
  trail?: Crumb[];
};

/** Which source carries the most detail; a richer arrival upgrades an entry. */
const RICHNESS: Record<CrashSource, number> = {
  lifecycle: 0,
  "window-error": 1,
  "unhandled-rejection": 1,
  "route-boundary": 2,
  "app-boundary": 3,
};

let buffer: CrashEntry[] = [];
let loaded = false;
let burstStart = 0;
let burstCount = 0;
let lastFlush = 0;
/** When the newest entry's `count` last moved -- see `SAME_THROW_MS`. */
let lastCountedTs = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Error object -> the entry it already produced (see rule 3). */
let seen = new WeakMap<object, string>();

/* -- describing whatever was thrown --------------------------------------- */

/**
 * Turn any thrown value into a message and, where there is one, a stack.
 *
 * The hostile cases are real: a `Symbol` (which `String()` throws on), an object
 * whose `toString`/`message` getter throws, a circular object `JSON.stringify`
 * refuses. Every one of them ends as a sentence rather than as a second crash.
 */
export function describeThrown(value: unknown): { message: string; stack?: string } {
  try {
    if (value instanceof Error) {
      const message = typeof value.message === "string" && value.message ? value.message : value.name || "Error";
      const name = typeof value.name === "string" && value.name && value.name !== "Error" ? `${value.name}: ` : "";
      return { message: `${name}${message}`, stack: typeof value.stack === "string" ? value.stack : undefined };
    }
    if (typeof value === "string") return { message: value || "Empty string thrown" };
    if (value === null) return { message: "null was thrown" };
    if (value === undefined) return { message: "undefined was thrown" };
    if (typeof value === "object") {
      const bag = value as { message?: unknown; stack?: unknown };
      const stack = typeof bag.stack === "string" ? bag.stack : undefined;
      if (typeof bag.message === "string" && bag.message) return { message: bag.message, stack };
      try {
        const json = JSON.stringify(value);
        if (json && json !== "{}") return { message: json, stack };
      } catch {
        // circular, or a getter that throws
      }
      return { message: safeToString(value) ?? "Non-Error object thrown", stack };
    }
    return { message: safeToString(value) ?? `${typeof value} thrown` };
  } catch {
    return { message: "Unserialisable value thrown" };
  }
}

function safeToString(value: unknown): string | null {
  try {
    const s = String(value);
    return s ? s : null;
  } catch {
    return null;
  }
}

function clamp(text: string | undefined, max: number): string | undefined {
  if (typeof text !== "string" || !text) return undefined;
  return text.length > max ? `${text.slice(0, max)}\n... (truncated)` : text;
}

function firstStackLine(stack?: string): string {
  if (!stack) return "";
  const lines = stack.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("at ") || t.includes("@")) return t.slice(0, 200);
  }
  return (lines[1] ?? "").trim().slice(0, 200);
}

/** What makes two arrivals "the same thing happening again". Source is not part of it (rule 3). */
function signature(entry: Pick<CrashEntry, "message" | "stack">): string {
  return `${entry.message} ${firstStackLine(entry.stack)}`;
}

/* -- storage -------------------------------------------------------------- */

function sanitiseEntry(raw: unknown): CrashEntry | null {
  try {
    const e = raw as Record<string, unknown> | null;
    if (!e || typeof e.message !== "string" || typeof e.ts !== "number" || !Number.isFinite(e.ts)) return null;
    const source = e.source as CrashSource;
    if (!(source in RICHNESS)) return null;
    return {
      id: typeof e.id === "string" ? e.id : `${e.ts}`,
      ts: e.ts,
      lastTs: typeof e.lastTs === "number" ? e.lastTs : undefined,
      count: typeof e.count === "number" && e.count > 0 ? e.count : 1,
      suppressed: typeof e.suppressed === "number" ? e.suppressed : undefined,
      source,
      message: e.message,
      stack: typeof e.stack === "string" ? e.stack : undefined,
      componentStack: typeof e.componentStack === "string" ? e.componentStack : undefined,
      url: typeof e.url === "string" ? e.url : "",
      mode: typeof e.mode === "string" ? e.mode : undefined,
      trail: sanitiseTrail(e.trail),
    };
  } catch {
    // a bad entry is skipped, never thrown on
    return null;
  }
}

export function sanitiseTrail(raw: unknown): Crumb[] {
  const trail: Crumb[] = [];
  try {
    if (!Array.isArray(raw)) return trail;
    for (const item of raw) {
      const c = item as Record<string, unknown> | null;
      if (!c || typeof c.t !== "number" || typeof c.u !== "string") continue;
      const k = c.k === "PUSH" || c.k === "POP" || c.k === "REPLACE" ? c.k : "PUSH";
      trail.push({ t: c.t, u: c.u, k });
    }
  } catch {
    return trail;
  }
  return trail;
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = readStored(CRASH_LOG_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const out: CrashEntry[] = [];
    for (const item of parsed) {
      const entry = sanitiseEntry(item);
      if (entry) out.push(entry);
      if (out.length >= MAX_CRASH_ENTRIES) break;
    }
    buffer = out;
  } catch {
    buffer = [];
  }
}

function flush(): void {
  try {
    lastFlush = Date.now();
    writeStored(CRASH_LOG_KEY, JSON.stringify(buffer));
  } catch {
    // ignore storage failures -- the in-memory buffer keeps working
  }
}

function scheduleFlush(): void {
  try {
    if (flushTimer != null) return; // a trailing write is already queued
    const now = Date.now();
    const since = now - lastFlush;
    if (since >= FLUSH_INTERVAL_MS) {
      flush();
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, FLUSH_INTERVAL_MS - since);
  } catch {
    // ignore
  }
}

/** Write anything still pending right now (called on `pagehide`). */
export function flushCrashLog(): void {
  try {
    if (flushTimer != null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (loaded) flush();
  } catch {
    // ignore
  }
}

/* -- recording ------------------------------------------------------------ */

function makeId(ts: number): string {
  try {
    return `${ts.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  } catch {
    return `${ts}`;
  }
}

function currentUrl(): string {
  try {
    return `${window.location.pathname}${window.location.search}`;
  } catch {
    return "";
  }
}

function buildMode(): string | undefined {
  try {
    return import.meta.env?.MODE;
  } catch {
    return undefined;
  }
}

/**
 * Record one crash. Returns the entry's id, or `null` when nothing was recorded
 * (a duplicate arrival, or a failure the recorder swallowed).
 */
export function recordCrash(input: RecordInput): string | null {
  try {
    ensureLoaded();
    const now = typeof input.ts === "number" && Number.isFinite(input.ts) ? input.ts : Date.now();
    const described = describeThrown(input.value);
    const message = clamp(described.message, MAX_MESSAGE_CHARS) ?? "Unknown error";
    const stack = clamp(described.stack, MAX_STACK_CHARS);
    const componentStack = clamp(input.componentStack ?? undefined, MAX_STACK_CHARS);

    // Rule 3: the same object arriving through a second channel upgrades its entry.
    const key = typeof input.value === "object" && input.value !== null ? input.value : null;
    if (key) {
      const knownId = seen.get(key);
      if (knownId) {
        const existing = buffer.find((e) => e.id === knownId);
        if (existing) {
          if (RICHNESS[input.source] > RICHNESS[existing.source]) existing.source = input.source;
          if (!existing.stack && stack) existing.stack = stack;
          if (!existing.componentStack && componentStack) existing.componentStack = componentStack;
          scheduleFlush();
          return null;
        }
      }
    }

    if (now - burstStart > BURST_WINDOW_MS) {
      burstStart = now;
      burstCount = 0;
    }
    const burstExhausted = burstCount >= BURST_MAX_NEW_ENTRIES;

    const newest = buffer[0];
    if (newest && now - (newest.lastTs ?? newest.ts) <= MERGE_WINDOW_MS) {
      const same = signature(newest) === signature({ message, stack });
      if (same || burstExhausted) {
        if (now - lastCountedTs > SAME_THROW_MS) {
          newest.count += 1;
          lastCountedTs = now;
        }
        newest.lastTs = now;
        if (!same) newest.suppressed = (newest.suppressed ?? 0) + 1;
        // A boundary knows more than `window` does about the same throw.
        if (same && RICHNESS[input.source] > RICHNESS[newest.source]) newest.source = input.source;
        if (same && !newest.stack && stack) newest.stack = stack;
        if (!newest.componentStack && componentStack) newest.componentStack = componentStack;
        if (key) seen.set(key, newest.id);
        scheduleFlush();
        if (input.source !== "lifecycle") noteErrorRecorded(now);
        return newest.id;
      }
    }

    const entry: CrashEntry = {
      id: makeId(now),
      ts: now,
      count: 1,
      source: input.source,
      message,
      stack,
      componentStack,
      url: input.url ?? currentUrl(),
      mode: buildMode(),
      trail: input.trail ?? readCrumbs(),
    };
    buffer.unshift(entry);
    if (buffer.length > MAX_CRASH_ENTRIES) buffer.length = MAX_CRASH_ENTRIES;
    lastCountedTs = now;
    burstCount += 1;
    if (key) seen.set(key, entry.id);
    scheduleFlush();
    if (input.source !== "lifecycle") noteErrorRecorded(now);
    return entry.id;
  } catch {
    // The recorder is never the reason something breaks.
    return null;
  }
}

/** The synthetic entry for a session that ended with nothing thrown (`lifecycle`). */
export function recordUnexpectedEnd(end: { ts: number; url: string; trail: Crumb[] }): string | null {
  return recordCrash({
    source: "lifecycle",
    value: "The app stopped while it was in the foreground.",
    ts: end.ts,
    url: end.url,
    trail: end.trail,
  });
}

/* -- reading -------------------------------------------------------------- */

/** The recorded entries, newest first. */
export function readCrashLog(): CrashEntry[] {
  try {
    ensureLoaded();
    return buffer.map((e) => ({ ...e, trail: e.trail.slice() }));
  } catch {
    return [];
  }
}

export function clearCrashLog(): void {
  try {
    if (flushTimer != null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    buffer = [];
    loaded = true;
    seen = new WeakMap<object, string>();
    removeStored(CRASH_LOG_KEY);
  } catch {
    // ignore
  }
}

/** Test seam: forget everything this module holds, storage included. */
export function resetCrashLog(): void {
  buffer = [];
  loaded = false;
  burstStart = 0;
  burstCount = 0;
  lastFlush = 0;
  lastCountedTs = 0;
  if (flushTimer != null) clearTimeout(flushTimer);
  flushTimer = null;
  seen = new WeakMap<object, string>();
  removeStored(CRASH_LOG_KEY);
}

/* -- the copyable report -------------------------------------------------- */

export const SOURCE_LABEL: Record<CrashSource, string> = {
  "app-boundary": "App boundary",
  "route-boundary": "Page boundary",
  "window-error": "window.onerror",
  "unhandled-rejection": "Unhandled rejection",
  lifecycle: "Ended unexpectedly",
};

export function formatTimestamp(ts: number): string {
  try {
    const d = new Date(ts);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  } catch {
    return String(ts);
  }
}

function indent(text: string, pad = "    "): string {
  return text
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

/** The whole log as plain text -- what the "Copy all" button puts on the clipboard. */
export function formatCrashLog(entries: CrashEntry[]): string {
  try {
    const lines: string[] = [];
    lines.push(`Lorbeerkranz diagnostics, ${formatTimestamp(Date.now())}`);
    try {
      lines.push(`Device: ${navigator.userAgent}`);
    } catch {
      // ignore
    }
    lines.push(`Entries: ${entries.length}`);
    if (!entries.length) lines.push("", "(nothing recorded)");
    entries.forEach((e, i) => {
      lines.push("", `#${i + 1}  ${formatTimestamp(e.ts)}  ${SOURCE_LABEL[e.source] ?? e.source}`);
      lines.push(`  Message:   ${e.message}`);
      lines.push(`  Where:     ${e.url || "(unknown)"}`);
      lines.push(`  Build:     ${e.mode ?? "(unknown)"}`);
      if (e.count > 1) lines.push(`  Repeats:   ${e.count}x (last ${formatTimestamp(e.lastTs ?? e.ts)})`);
      if (e.suppressed) lines.push(`  Folded in: ${e.suppressed} other error(s) during the same burst`);
      if (e.stack) lines.push("  Stack:", indent(e.stack));
      if (e.componentStack) lines.push("  Component stack:", indent(e.componentStack));
      lines.push(`  Navigation trail (${e.trail.length}):`);
      if (!e.trail.length) lines.push("    (none recorded)");
      for (const c of e.trail) {
        const delta = `${((c.t - e.ts) / 1000).toFixed(2)}s`;
        lines.push(`    ${delta.padStart(9)}  ${c.k.padEnd(7)} ${c.u}`);
      }
    });
    return lines.join("\n");
  } catch {
    return "Diagnostics could not be formatted.";
  }
}
