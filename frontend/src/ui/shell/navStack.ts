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

/**
 * Record the current location at its history index. A push truncates whatever
 * the browser dropped above it, so entries beyond the current index go too.
 */
export function recordNavigation(pathname: string, search = ""): void {
  const idx = currentHistoryIndex();
  const stack = read();
  stack[String(idx)] = `${pathname}${search || ""}`;
  for (const key of Object.keys(stack)) {
    const n = Number(key);
    if (!Number.isFinite(n) || n > idx || n < idx - MAX_ENTRIES) delete stack[key];
  }
  write(stack);
}

/** The URL of the entry `navigate(-1)` would land on, when we know it. */
export function previousEntryPath(): string | null {
  const idx = currentHistoryIndex();
  if (idx <= 0) return null;
  return read()[String(idx - 1)] ?? null;
}

/** Test seam. */
export function resetNavStack(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
