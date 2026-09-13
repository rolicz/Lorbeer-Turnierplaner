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
