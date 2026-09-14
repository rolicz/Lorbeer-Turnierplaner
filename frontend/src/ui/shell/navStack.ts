/**
 * A thin mirror of the browser history stack: which in-app URL sits at each
 * history index.
 *
 * React Router exposes the current location but not the one behind it, and
 * `history.state.idx` is the same counter `navigate(-1)` moves along. Recording
 * `idx → path` lets "back" ask the one question that matters: *is the entry I
 * would pop to actually this page's parent?* If it is, popping restores that
 * page's own scroll/tab state; if it is not (you jumped in from a bookmark, a
 * notification, or the nav bar's remembered page), back has to navigate up
 * instead — otherwise it throws you somewhere unrelated.
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

/** How a location became current — the browser's own three kinds. */
export type NavKind = "PUSH" | "POP" | "REPLACE";

/**
 * Has this page load recorded anything yet? Module scope, so it is false again
 * on every load — which is exactly the question the first record has to ask.
 */
let recordedThisLoad = false;

/**
 * Record the current location at its history index.
 *
 * Only a **push** truncates: it drops whatever the browser dropped in front of
 * the new entry. A pop or a replace leaves the forward entries in place, which
 * is what makes "is there anything to go forward to?" answerable at all
 * (`canGoForward`) — the swipe-left gesture needs that answer before it fires.
 *
 * The **first** record of a page load truncates too (A9). React Router reports
 * an initial load as a POP, and this mirror lives in sessionStorage, which a
 * browser copies into a duplicated tab without the forward history it described.
 * Trusting those entries makes `canGoForward()` promise a forward step the
 * browser cannot take, and the swipe that asks for it does nothing at all —
 * a burnt gesture. Forgetting them costs nothing but a swipe-forward that the
 * browser's own forward button still performs.
 */
export function recordNavigation(pathname: string, search = "", kind: NavKind = "PUSH"): void {
  const idx = currentHistoryIndex();
  const truncate = kind === "PUSH" || !recordedThisLoad;
  recordedThisLoad = true;
  const stack = read();
  stack[String(idx)] = `${pathname}${search || ""}`;
  for (const key of Object.keys(stack)) {
    const n = Number(key);
    const stale = !Number.isFinite(n) || n < idx - MAX_ENTRIES || n > idx + MAX_ENTRIES;
    if (stale || (truncate && n > idx)) delete stack[key];
  }
  write(stack);
}

/** The URL of the entry `navigate(-1)` would land on, when we know it. */
export function previousEntryPath(): string | null {
  const idx = currentHistoryIndex();
  if (idx <= 0) return null;
  return read()[String(idx - 1)] ?? null;
}

/** The front of the mirrored stack: the highest index still recorded. */
export function highestHistoryIndex(): number {
  let max = 0;
  for (const key of Object.keys(read())) {
    const n = Number(key);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * Is there an entry in front of the current one — i.e. would `navigate(1)`
 * actually move? `history.length` cannot answer this (it counts the whole
 * session), but the mirrored stack can.
 */
export function canGoForward(): boolean {
  return currentHistoryIndex() < highestHistoryIndex();
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
  recordedThisLoad = false;
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(SCROLL_KEY);
  } catch {
    // ignore
  }
}
