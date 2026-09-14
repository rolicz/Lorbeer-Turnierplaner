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
 * What the in-view back button of a **param drill-in** should do (T11).
 *
 * A drill-in that is a query param on the page it drills into — the stats
 * matchup, `?vs=` — is opened with a *push*, so it owns a history entry and the
 * swipe gesture and the browser's back button simply pop it. The in-view button
 * asks this function before doing the same, because popping is only the way back
 * when the entry behind us is this very page *without* the param (then the pop
 * also restores the list's scroll offset, N2). Arriving by deep link a match
 * page or a profile sits behind the drill-in instead: popping would leave the
 * page the button points at, so it clears the param in place.
 *
 * Same pathname is not enough on a page that is several bodies under one URL
 * (A9): `/stats` is Overview, Trends, H2H and Player, told apart by `?view=`.
 * A matchup opened from the Player section has `/stats?view=player` behind it —
 * popping there lands on a page the "Head-to-head" button never named. So the
 * caller lists the params that must agree (`sameParams`) alongside the search
 * they must agree *with*, and a body that does not match is cleared in place.
 */
export type DrillInBackAction = { kind: "pop" } | { kind: "clear" };

export type DrillInBackInput = {
  /** The page the drill-in lives on. */
  pathname: string;
  /** The page's own query string — what `sameParams` is compared against. */
  search?: string;
  /** The query param that *is* the drill-in (`"vs"`). */
  param: string;
  /** Params that pick the *body* under this URL; the entry behind us must agree on all of them. */
  sameParams?: readonly string[];
  /** Does the history stack have anything behind this entry? */
  canPop: boolean;
  /** The URL of the entry a pop would land on, when we know it. */
  previousPath: string | null;
};

function paramsOf(url: string): URLSearchParams {
  const q = url.indexOf("?");
  return new URLSearchParams(q < 0 ? "" : url.slice(q + 1));
}

export function resolveDrillInBackAction({
  pathname,
  search = "",
  param,
  sameParams = [],
  canPop,
  previousPath,
}: DrillInBackInput): DrillInBackAction {
  if (!canPop || !previousPath) return { kind: "clear" };
  if (pathnameOf(previousPath) !== pathnameOf(pathname)) return { kind: "clear" };
  const previousParams = paramsOf(previousPath);
  // Another drill-in behind us is not the page this button promises either.
  if (previousParams.get(param)) return { kind: "clear" };
  const here = paramsOf(search);
  for (const key of sameParams) {
    if ((previousParams.get(key) ?? "") !== (here.get(key) ?? "")) return { kind: "clear" };
  }
  return { kind: "pop" };
}

/** `resolveDrillInBackAction` against the live browser/session state. */
export function drillInBackActionFor(
  pathname: string,
  param: string,
  opts?: { search?: string; sameParams?: readonly string[] },
): DrillInBackAction {
  return resolveDrillInBackAction({
    pathname,
    search: opts?.search,
    param,
    sameParams: opts?.sameParams,
    canPop: historyCanPop(),
    previousPath: previousEntryPath(),
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
