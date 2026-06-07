import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export type RouteMeta = {
  /** Detail/sub page that should show a back affordance instead of the menu. */
  isDetail: boolean;
  /** Sensible fallback destination when there's no in-app history to pop. */
  backTo: string | null;
};

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
  // React Router gives the very first history entry the key "default".
  const canPop = loc.key !== "default";

  const goBack = useCallback(() => {
    if (canPop) nav(-1);
    else nav(meta.backTo ?? "/dashboard");
  }, [canPop, nav, meta.backTo]);

  return { isDetail: meta.isDetail, backTo: meta.backTo, goBack };
}
