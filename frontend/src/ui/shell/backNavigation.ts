import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { canPop as historyCanPop, currentArrival, previousEntryPath, type Arrival } from "./navStack";
import { placeOf } from "./routeHierarchy";
import type { Place } from "./routeHierarchy";

/**
 * What "back" does from here, as data (Q6).
 *
 * One function, four affordances: the mobile top-bar chevron, the desktop
 * chevron in the title row, the swipe-right gesture and — wherever the browser's
 * own history allows it — its back button. They cannot drift apart because there
 * is nothing to drift: they all call this.
 *
 * **Back returns you to the page you came from — except after a jump** (Q6b,
 * Roli on his phone, 2026-09-16; it supersedes Q6's "back is always one level
 * up"). The rule, in full:
 *
 * - On a page you went **into** (`placeOf().inside`), back **pops** whenever the
 *   entry behind us is where the reader came from — free, and better, because
 *   that page comes back with its scroll offset (N2), its open tab and its data.
 *   That covers both the parent sitting behind us and any other page that drilled
 *   in here (a match page's "All matches" → the matchup, T11).
 * - **Except after a jump.** Tapping a nav destination is not walking into
 *   something, it is teleporting: "Tournaments" that lands on the tournament U6
 *   remembered must go **up to the tournaments list**, not back out into the part
 *   of the app you were in before (N1). Arriving from nowhere — a cold link, a
 *   push notification — is the same case, and so is an arrival we cannot vouch
 *   for. All of them navigate to the parent.
 *
 *   The two look identical from the outside: the entry behind is somewhere else
 *   entirely either way. So the difference is **recorded when the navigation is
 *   made** (`NAV_JUMP_STATE` below, stored per history entry by `navStack`) and
 *   never inferred afterwards by comparing the two URLs — comparing them is
 *   exactly the test that gets one of the two cases wrong.
 * - On a **destination** there is no up: its siblings are laid out in the bar,
 *   not above it. Back is the history step you took to get here, which is what
 *   the browser, iOS and Android all do between siblings — and the only answer
 *   that agrees with the browser's own button on the app's five busiest pages.
 *   With nothing behind it — a cold deep link — it goes home rather than out of
 *   the app.
 * - Home with nothing behind it is the one place back does nothing at all.
 *
 * Going up is a **`replace`**: it consumes the page being left, the way popping
 * a native stack does. Walking up a deep link therefore never grows history, the
 * ladder terminates instead of ping-ponging (`/settings` → home → `/settings` …),
 * and a page you deliberately left cannot be swiped back into.
 */
export type BackAction =
  /** The entry behind us *is* the right page: pop it, and it keeps its scroll and open tab. */
  | { kind: "pop" }
  /** Go to that page (a `replace` — see above). */
  | { kind: "up"; to: string }
  /** Nothing sensible to do. Stay exactly where we are. */
  | { kind: "none" };

/**
 * The mark a navigation carries to say **it is a jump, not a drill-in** — the one
 * fact back cannot work out for itself afterwards (Q6b).
 *
 * Put it on every nav-destination link (the bottom bar, the sidebar, the drawer,
 * the "Live now" shortcut — all built by `useDestinationLinks`), and on the few
 * in-page controls whose whole promise is *leaving* the page they sit on ("Save
 * and return", "Cancel"): popping straight back into a page the reader just
 * dismissed contradicts the button they pressed.
 *
 * An ordinary link or row carries nothing — going *into* something is the default,
 * and the absence of this mark is never what decides back: the recorded arrival
 * is, and a missing record means "up" (`navStack.currentArrival`).
 */
export const NAV_JUMP_STATE = { navJump: true } as const;

/** Did this navigation carry the jump mark? (`location.state`, `NAV_JUMP_STATE`.) */
export function isJumpNavigation(state: unknown): boolean {
  return (state as { navJump?: unknown } | null)?.navJump === true;
}

/** Path part of a URL that may carry a query string, without a trailing slash. */
function pathnameOf(url: string): string {
  const i = url.indexOf("?");
  return (i < 0 ? url : url.slice(0, i)).replace(/\/+$/, "") || "/";
}

function paramsOf(url: string): URLSearchParams {
  const q = url.indexOf("?");
  return new URLSearchParams(q < 0 ? "" : url.slice(q + 1));
}

/** Is the entry a pop would land on the parent this page names? */
function isParentEntry(previousPath: string, parent: string, place: Place): boolean {
  if (pathnameOf(previousPath) !== pathnameOf(parent)) return false;
  // A parent at a *different* path is identified by that path alone.
  if (!place.drillParam && !place.sameParams?.length) return true;
  const previous = paramsOf(previousPath);
  // Another drill-in behind us is not the page we are leaving this one for.
  if (place.drillParam && previous.get(place.drillParam)) return false;
  const here = paramsOf(parent);
  for (const key of place.sameParams ?? []) {
    if ((previous.get(key) ?? "") !== (here.get(key) ?? "")) return false;
  }
  return true;
}

export type BackInput = {
  pathname: string;
  /** The current query string — the matchup drill-in lives in it. */
  search?: string;
  /** `location.state` — carries `fromTab` for match pages. */
  state?: unknown;
  /** Does the history stack have anything behind this entry? */
  canPop: boolean;
  /** The URL of the entry a pop would land on, when we know it. */
  previousPath: string | null;
  /**
   * How this entry was arrived at (Q6b). Omitted is `"unknown"`, which behaves
   * like a jump: back goes up, never to a page we cannot vouch for.
   */
  arrival?: Arrival | "unknown";
};

/** Contextual back, as a pure function of the route and the history stack. */
export function resolveBackAction({
  pathname,
  search = "",
  state,
  canPop,
  previousPath,
  arrival = "unknown",
}: BackInput): BackAction {
  const place = placeOf(pathname, search, state);
  if (place.inside && place.parent) {
    // The parent is right behind us: pop it back, whatever brought us here.
    if (canPop && previousPath && isParentEntry(previousPath, place.parent, place)) return { kind: "pop" };
    // Something else is behind us, and we drilled in from it: that is the page
    // the reader came from, so that is where back goes (Q6b).
    if (canPop && arrival === "drill") return { kind: "pop" };
    // A jump, a cold arrival, or an arrival we cannot vouch for: up the ladder.
    return { kind: "up", to: place.parent };
  }
  if (canPop) return { kind: "pop" };
  return place.parent ? { kind: "up", to: place.parent } : { kind: "none" };
}

/** `resolveBackAction` against the live browser/session state. */
export function backActionFor(pathname: string, search: string, state: unknown): BackAction {
  return resolveBackAction({
    pathname,
    search,
    state,
    canPop: historyCanPop(),
    previousPath: previousEntryPath(),
    arrival: currentArrival(pathname),
  });
}

export type Back = {
  /** Should this page draw a back affordance? (Only a page you went into does.) */
  hasBack: boolean;
  /** Take the one back decision and act on it. */
  goBack: () => void;
};

/**
 * The single back control of the app. `MobileChrome`'s chevron, `PageLayout`'s
 * desktop chevron, the swipe gesture and the matchup's in-view button all use it.
 */
export function useBack(): Back {
  const loc = useLocation();
  const nav = useNavigate();
  const place = placeOf(loc.pathname, loc.search, loc.state);

  const goBack = useCallback(() => {
    const action = backActionFor(loc.pathname, loc.search, loc.state);
    if (action.kind === "pop") nav(-1);
    else if (action.kind === "up") nav(action.to, { replace: true });
  }, [loc.pathname, loc.search, loc.state, nav]);

  return { hasBack: place.inside, goBack };
}
