import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { previousEntryPath } from "./navStack";

export type RouteMeta = {
  /** Detail/sub page that should show a back affordance instead of the menu. */
  isDetail: boolean;
  /** The page one level up — where "back" goes when popping would not land there. */
  backTo: string | null;
};

/**
 * Whether the browser history actually has entries behind the current one.
 * `window.history.state.idx` is the index React Router's HTML5 history stack
 * maintains; a fresh/replaced location can still get a non-"default" router
 * key while `idx` stays 0, so this is the reliable signal to pop vs. fall back.
 */
export function historyCanPop(): boolean {
  const idx = Number((window.history.state as { idx?: number } | null)?.idx ?? 0);
  return idx > 0;
}

/** Classify a pathname as a top-level destination or a detail/sub page. */
export function routeMeta(pathname: string): RouteMeta {
  const match = pathname.match(/^\/live\/([^/]+)\/match\/[^/]+\/?$/);
  if (match) return { isDetail: true, backTo: `/live/${match[1]}` };
  if (/^\/live\/[^/]+\/?$/.test(pathname)) return { isDetail: true, backTo: "/tournaments" };
  if (/^\/profiles\/[^/]+\/?$/.test(pathname)) return { isDetail: true, backTo: "/players" };
  return { isDetail: false, backTo: null };
}

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

/**
 * Contextual back navigation for detail pages — hierarchical, not "whatever was
 * on the stack".
 *
 * Popping is only right when the entry behind us *is* the parent page, and then
 * it is the best option (the parent keeps its scroll position and open tab).
 * Otherwise — arriving from a deep link, a notification, or the nav bar's
 * remembered page — back navigates up one level, so a match page always returns
 * to its tournament instead of to whatever you were looking at before.
 */
export function useContextualBack() {
  const loc = useLocation();
  const nav = useNavigate();
  const meta = routeMeta(loc.pathname);
  const backTo = resolveBackTarget(loc.pathname, loc.state);

  const goBack = useCallback(() => {
    if (!backTo) {
      // Not a detail page: plain history back, with a safe landing spot.
      if (historyCanPop()) nav(-1);
      else nav("/dashboard");
      return;
    }
    const prev = previousEntryPath();
    if (historyCanPop() && prev && pathnameOf(prev) === pathnameOf(backTo)) {
      nav(-1);
      return;
    }
    nav(backTo);
  }, [backTo, nav]);

  return { isDetail: meta.isDetail, backTo, goBack };
}
