import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type RouteMeta = {
  /** Detail/sub page that should show a back affordance instead of the menu. */
  isDetail: boolean;
  /** Sensible fallback destination when there's no in-app history to pop. */
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

/**
 * Contextual back navigation: pops in-app history when available, otherwise
 * routes to a sensible fallback (so deep links / fresh loads still go somewhere).
 */
export function useContextualBack() {
  const loc = useLocation();
  const nav = useNavigate();
  const meta = routeMeta(loc.pathname);

  const goBack = useCallback(() => {
    if (historyCanPop()) nav(-1);
    else nav(meta.backTo ?? "/dashboard");
  }, [nav, meta.backTo]);

  return { isDetail: meta.isDetail, backTo: meta.backTo, goBack };
}
