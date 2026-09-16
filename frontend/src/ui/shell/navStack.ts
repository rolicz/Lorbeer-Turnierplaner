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
 * gone and so is all of that. What is left answers two questions about the past,
 * and both are fail-degraded by construction: a missing or stale answer does not
 * misroute back, it only makes it navigate up to the same page the hierarchy
 * names, losing that page's scroll offset and nothing else.
 *
 * The second question is **how the current entry was arrived at** (Q6b). Back
 * returns the reader to the page they came from, *except* after a jump — a nav
 * destination tapped in the bar, the sidebar or the drawer — where it goes one
 * level up instead, because "Tournaments" must not pop back out into whatever
 * part of the app you were in before (N1). A drill-in and a jump look identical
 * from the outside — the entry behind is in another part of the app either way —
 * so the difference is **recorded when the navigation happens** and never
 * inferred afterwards from the two URLs.
 *
 * **An entry's arrival kind is decided once, when the entry is created, and never
 * rewritten.** A `replace` that only rewrites the query string of the same page
 * (`?tab=`, a stats filter) keeps it — which matters, because such a replace
 * wipes `location.state` and with it the marker the navigation carried. A
 * `replace` onto a *different* page clears it, a pop reads it back, and anything
 * unknown means "up": the Q6 behaviour, which is never a wrong page.
 *
 * sessionStorage, so a reload keeps the mapping for the entries it reloads into;
 * every accessor is failure-tolerant (private mode / quota) and never throws.
 */
const KEY = "lk:nav-stack";
/** Plenty for a session; keeps the stored object small. */
const MAX_ENTRIES = 50;

/**
 * How the reader got to a history entry (Q6b).
 *
 * - `jump` — a nav destination was tapped (bottom bar, sidebar, drawer, the
 *   "Live now" shortcut), or the app took them out of a page they were done with.
 *   Back does not pop out of it; it goes one level up.
 * - `drill` — an ordinary in-content link or row: they went *into* something, so
 *   back undoes exactly that step.
 *
 * Anything we do not know is treated as a jump — see `currentArrival`.
 */
export type Arrival = "jump" | "drill";

/** One history entry: the URL it holds, and how it was arrived at when we know. */
type Entry = { u: string; a?: Arrival };

type Stack = Record<string, Entry>;

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

/** Path part of a stored URL, without a trailing slash — what "the same page" means here. */
function pathOf(url: string): string {
  const i = url.indexOf("?");
  return (i < 0 ? url : url.slice(0, i)).replace(/\/+$/, "") || "/";
}

function read(): Stack {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Stack = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // A session that started before Q6b stored bare URL strings: read them as
      // entries with no arrival kind, which degrades to "up" rather than to a
      // wrong page.
      if (typeof v === "string") out[k] = { u: v };
      else if (v && typeof v === "object") {
        const e = v as { u?: unknown; a?: unknown };
        if (typeof e.u === "string") out[k] = e.a === "jump" || e.a === "drill" ? { u: e.u, a: e.a } : { u: e.u };
      }
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
 * `arrival` is passed **only when this entry is being created** (a PUSH), because
 * that is the one moment the navigation itself says what it was. Pass `null` for
 * a REPLACE or a POP: the entry keeps the kind it was born with while it is still
 * the same page, and loses it when a replace turns it into a different one.
 *
 * No truncation: only `idx` and `idx - 1` are ever read, and both are rewritten
 * by the very navigation that lands on them, so a stale entry in front of us can
 * never be consulted. (It used to truncate on a push, and on the first record of
 * a page load, purely so `canGoForward()` could be honest — both went with the
 * forward gesture, Q6.)
 */
export function recordNavigation(pathname: string, search = "", arrival: Arrival | null = null): void {
  const idx = currentHistoryIndex();
  const stack = read();
  const previous = stack[String(idx)];
  const kept = previous && pathOf(previous.u) === pathname ? previous.a : undefined;
  const a = arrival ?? kept;
  const url = `${pathname}${search || ""}`;
  stack[String(idx)] = a ? { u: url, a } : { u: url };
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
  return read()[String(idx - 1)]?.u ?? null;
}

/**
 * How the reader arrived at the entry they are on (Q6b), or `"unknown"`.
 *
 * `"unknown"` is the answer whenever the record is missing (storage blocked or
 * cleared, a tab that never wrote it), whenever it is about a different page than
 * the one being asked about, and whenever the entry pre-dates this mechanism. It
 * is the **safe** answer: back then means one level up, which is what the app did
 * before Q6b — it loses the pop's scroll restoration and never lands anywhere
 * wrong. That asymmetry is the reason the *drill-in* is what gets recorded and
 * the jump is the default, and not the other way round.
 */
export function currentArrival(pathname: string): Arrival | "unknown" {
  const entry = read()[String(currentHistoryIndex())];
  if (!entry || pathOf(entry.u) !== pathOf(pathname)) return "unknown";
  return entry.a ?? "unknown";
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
