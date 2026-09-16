/**
 * What URL sits at each history index — and what offset that entry was left at.
 *
 * React Router exposes the current location but not the one behind it, and
 * `history.state.idx` is the same counter `navigate(-1)` moves along. Recording
 * `idx → url` lets back ask the one question that matters: *is the entry I would
 * pop to already this page's parent?* If it is, popping restores that page's own
 * scroll and open tab; if it is not (you jumped in from a bookmark, a
 * notification, or the nav bar's remembered page), back navigates up instead.
 *
 * **The mirror only remembers the past** (Q6). It used to describe the future as
 * well — how far forward the stack went, truncated on every push — and that half
 * was the one that could be *wrong in a way you could see*: it promised the
 * swipe-left gesture a step the browser could not take. The forward gesture is
 * gone and so is all of that. What is left answers one question about `idx - 1`,
 * and it is fail-degraded by construction: a missing or stale answer does not
 * misroute back, it only makes it navigate up to the same page it would have
 * popped to, losing that page's scroll offset and nothing else.
 *
 * sessionStorage, so a reload keeps the mapping for the entries it reloads into;
 * every accessor is failure-tolerant (private mode / quota) and never throws.
 */
const KEY = "lk:nav-stack";
/** Plenty for a session; keeps the stored object small. */
const MAX_ENTRIES = 50;

type Stack = Record<string, string>;

export function currentHistoryIndex(): number {
  const idx = Number((window.history.state as { idx?: number } | null)?.idx ?? 0);
  return Number.isFinite(idx) && idx >= 0 ? idx : 0;
}

/**
 * Does the history stack have anything behind the current entry?
 * `window.history.state.idx` is the index React Router's HTML5 history stack
 * maintains; a fresh/replaced location can still get a non-"default" router key
 * while `idx` stays 0, so this is the reliable signal to pop vs. navigate.
 */
export function canPop(): boolean {
  return currentHistoryIndex() > 0;
}

function read(): Stack {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Stack = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function write(stack: Stack): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack));
  } catch {
    // ignore storage failures
  }
}

/**
 * Record the current location at its history index.
 *
 * No truncation: only `idx - 1` is ever read, and that entry is rewritten by the
 * very navigation that lands on it, so a stale entry in front of us can never be
 * consulted. (It used to truncate on a push, and on the first record of a page
 * load, purely so `canGoForward()` could be honest — both went with the forward
 * gesture, Q6.)
 */
export function recordNavigation(pathname: string, search = ""): void {
  const idx = currentHistoryIndex();
  const stack = read();
  stack[String(idx)] = `${pathname}${search || ""}`;
  for (const key of Object.keys(stack)) {
    const n = Number(key);
    if (!Number.isFinite(n) || n < idx - MAX_ENTRIES || n > idx + MAX_ENTRIES) delete stack[key];
  }
  write(stack);
}

/** The URL of the entry `navigate(-1)` would land on, when we know it. */
export function previousEntryPath(): string | null {
  const idx = currentHistoryIndex();
  if (idx <= 0) return null;
  return read()[String(idx - 1)] ?? null;
}

/* ── Scroll offsets per history entry ───────────────────────────────────────
 *
 * Same idea, second key: the vertical offset each history entry was left at, so
 * a POP can put the user back exactly where they were instead of at the top.
 * The pathname is stored next to the offset because an index is reused — a push
 * after a back creates a *different* page at the same index, and its predecessor's
 * offset must not leak onto it.
 */
const SCROLL_KEY = "lk:nav-scroll";

type ScrollEntry = { p: string; y: number };
type ScrollStack = Record<string, ScrollEntry>;

function readScroll(): ScrollStack {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: ScrollStack = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const e = v as { p?: unknown; y?: unknown } | null;
      if (e && typeof e.p === "string" && typeof e.y === "number" && Number.isFinite(e.y)) out[k] = { p: e.p, y: e.y };
    }
    return out;
  } catch {
    return {};
  }
}

/** Remember the offset `pathname` was left at, at history index `idx`. */
export function saveScroll(idx: number, y: number, pathname: string): void {
  if (!Number.isFinite(idx) || idx < 0 || !Number.isFinite(y)) return;
  const stack = readScroll();
  stack[String(idx)] = { p: pathname, y: Math.max(0, Math.round(y)) };
  for (const key of Object.keys(stack)) {
    const n = Number(key);
    if (!Number.isFinite(n) || n < idx - MAX_ENTRIES || n > idx + MAX_ENTRIES) delete stack[key];
  }
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(stack));
  } catch {
    // ignore storage failures
  }
}

/** The offset saved for `idx`, but only if that entry still is `pathname`. */
export function scrollFor(idx: number, pathname: string): number | null {
  const entry = readScroll()[String(idx)];
  if (!entry || entry.p !== pathname) return null;
  return entry.y;
}

/** Test seam. */
export function resetNavStack(): void {
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(SCROLL_KEY);
  } catch {
    // ignore
  }
}
