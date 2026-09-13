import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { canGoForward, previousEntryPath } from "./navStack";
import { historyCanPop, routeMeta } from "./routeMeta";

/**
 * What "back" should do from here, as data: one decision the top-bar chevron,
 * the desktop `InlineBack` button and the swipe gesture share, so no back
 * affordance can drift away from the others.
 */
export type BackAction =
  /** The entry behind us *is* the right page: pop it, and it keeps its scroll and open tab. */
  | { kind: "pop" }
  /** Walk one level up the hierarchy (a push — the parent opens at the top). */
  | { kind: "up"; to: string }
  /** Nothing sensible to do. Stay exactly where we are. */
  | { kind: "none" };

/** A swipe can also go forward; everything else it does is a `BackAction`. */
export type SwipeAction = BackAction | { kind: "forward" };

/** Path part of a URL that may carry a query string. */
function pathnameOf(url: string): string {
  const i = url.indexOf("?");
  return (i < 0 ? url : url.slice(0, i)).replace(/\/+$/, "") || "/";
}

/**
 * Where a detail page's back control leads, including the tab the caller came
 * from: a match page returns to the live tournament's *Matches* tab (or whatever
 * tab launched it), not to its default tab.
 */
export function resolveBackTarget(pathname: string, state: unknown): string | null {
  const meta = routeMeta(pathname);
  if (!meta.backTo) return null;
  const fromTab = (state as { fromTab?: unknown } | null)?.fromTab;
  if (/^\/live\/[^/]+\/match\//.test(pathname) && typeof fromTab === "string" && fromTab) {
    return `${meta.backTo}?tab=${encodeURIComponent(fromTab)}`;
  }
  return meta.backTo;
}

export type BackInput = {
  pathname: string;
  /** `location.state` — carries `fromTab` for match pages. */
  state: unknown;
  /** Does the history stack have anything behind this entry? */
  canPop: boolean;
  /** The URL of the entry a pop would land on, when we know it. */
  previousPath: string | null;
  /**
   * Where to go from a top-level page that has nothing to pop. A button needs a
   * safe landing spot (`/dashboard`); a *gesture* must pass `null` — silently
   * doing nothing beats teleporting the user somewhere they never asked for.
   */
  fallback: string | null;
};

/**
 * Contextual back, as a pure function of the route and the history stack.
 *
 * Popping is only right when the entry behind us *is* the parent page, and then
 * it is the best option (the parent keeps its scroll position and open tab).
 * Otherwise — arriving from a deep link, a notification, or the nav bar's
 * remembered page — back navigates up one level, so a match page always returns
 * to its tournament instead of to whatever you were looking at before.
 */
export function resolveBackAction({ pathname, state, canPop, previousPath, fallback }: BackInput): BackAction {
  const backTo = resolveBackTarget(pathname, state);
  if (!backTo) {
    // Not a detail page: there is no "up", so a plain history pop is the whole story.
    if (canPop) return { kind: "pop" };
    return fallback ? { kind: "up", to: fallback } : { kind: "none" };
  }
  if (canPop && previousPath && pathnameOf(previousPath) === pathnameOf(backTo)) return { kind: "pop" };
  return { kind: "up", to: backTo };
}

/** `resolveBackAction` against the live browser/session state. */
export function backActionFor(pathname: string, state: unknown, fallback: string | null): BackAction {
  return resolveBackAction({
    pathname,
    state,
    canPop: historyCanPop(),
    previousPath: previousEntryPath(),
    fallback,
  });
}

/**
 * What a horizontal swipe should do. `dir > 0` is a swipe right (back), which
 * follows the chevron exactly; a swipe left goes forward, but only while an
 * entry actually sits in front of us.
 */
export function swipeAction(dir: number, pathname: string, state: unknown): SwipeAction {
  if (dir > 0) return backActionFor(pathname, state, null);
  return canGoForward() ? { kind: "forward" } : { kind: "none" };
}

/**
 * Contextual back navigation for detail pages — hierarchical, not "whatever was
 * on the stack". See `resolveBackAction`.
 */
export function useContextualBack() {
  const loc = useLocation();
  const nav = useNavigate();
  const meta = routeMeta(loc.pathname);
  const backTo = resolveBackTarget(loc.pathname, loc.state);

  const goBack = useCallback(() => {
    const action = backActionFor(loc.pathname, loc.state, "/dashboard");
    if (action.kind === "pop") nav(-1);
    else if (action.kind === "up") nav(action.to);
  }, [loc.pathname, loc.state, nav]);

  return { isDetail: meta.isDetail, backTo, goBack };
}
