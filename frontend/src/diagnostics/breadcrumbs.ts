/**
 * The last ~20 navigations, in memory.
 *
 * This is the one thing a crash report cannot reconstruct afterwards: *how* the
 * app got to the screen it died on. A render loop in the navigation layer looks
 * like a burst of POPs or the same pair of URLs alternating, and that single
 * fact decides whether a crash belongs to the nav refactor or to something else.
 *
 * Memory only, deliberately: the trail exists to be **attached** to a recorded
 * error (`crashLog`) or to the liveness marker (`lifecycle`), never to be
 * persisted on its own. Writing it to storage on every navigation would put a
 * `localStorage` write in the hot path of the very layer under suspicion.
 */
/** How a location became current — the browser's own three kinds. */
export type NavKind = "PUSH" | "POP" | "REPLACE";

/** One navigation: when, where, and how it arrived. */
export type Crumb = {
  /** `Date.now()` at the navigation. */
  t: number;
  /** `pathname + search`. */
  u: string;
  /** PUSH | POP | REPLACE — the browser's own three kinds. */
  k: NavKind;
};

/** Enough to show a loop without bloating an entry. */
export const MAX_CRUMBS = 20;
/** A pathological URL must not blow up an entry either. */
const MAX_URL_CHARS = 200;

let crumbs: Crumb[] = [];

/** Record a navigation. Never throws — a breadcrumb is not worth an exception. */
export function recordCrumb(url: string, kind: NavKind, now = Date.now()): void {
  try {
    crumbs.push({ t: now, u: String(url).slice(0, MAX_URL_CHARS), k: kind });
    if (crumbs.length > MAX_CRUMBS) crumbs = crumbs.slice(crumbs.length - MAX_CRUMBS);
  } catch {
    // ignore — the recorder is never the reason something breaks
  }
}

/** A copy of the trail, oldest first. */
export function readCrumbs(): Crumb[] {
  try {
    return crumbs.slice();
  } catch {
    return [];
  }
}

/** Test seam. */
export function resetCrumbs(): void {
  crumbs = [];
}
