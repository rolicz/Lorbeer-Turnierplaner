/**
 * The group segment in the URL (L10) — `/g/<slug>/…` — and the only module in `src/`
 * that knows it exists.
 *
 * The app is mounted under react-router's `basename`, so every route string, every
 * `<Link to="/…">`, `navigate("/…")`, `routeHierarchy`, `navStack`, `lastLocation` and
 * `useTabParam` stay **basename-relative** and never see `/g/`. This module is imported
 * **first** by `main.tsx`: it reads the URL the document was opened with, and when that
 * URL carries no group (`/` from the manifest's `start_url`, a pre-batch bookmark, an
 * old push) it rewrites it in place with `history.replaceState` — before the router
 * exists, so the router's first render already sees the corrected URL and no navigation
 * happens.
 *
 * Part 1 has one group, `altherren`. A URL naming another slug is honoured as its
 * basename (part 2's group switch is a full navigation between two basenames).
 */

export const DEFAULT_GROUP_SLUG = "altherren";

const GROUP_RE = /^\/g\/([a-z0-9-]+)(?=\/|$)/;

export type EntryResolution = {
  slug: string;
  basename: string;
  /** The corrected URL (path + search + hash) to `replaceState` to, or null when the
   *  URL already names a group. */
  redirect: string | null;
};

/** Pure: which group this URL is in, and where a group-less URL belongs. */
export function resolveEntry(pathname: string, search = "", hash = ""): EntryResolution {
  const m = pathname.match(GROUP_RE);
  if (m) return { slug: m[1], basename: `/g/${m[1]}`, redirect: null };
  const basename = `/g/${DEFAULT_GROUP_SLUG}`;
  // `/` is the manifest's `start_url`; `/g` and `/g/` are a group segment with no group.
  // All three become the group's own root — router path `/` — and NOT `/dashboard`: the
  // router's `/` route redirects there itself, and `useLocationRestore` needs that first
  // render at `/` (a first render at `/dashboard` would be stored as the last location
  // before the restore reads it, and a cold PWA launch would never resume — measured).
  const rest = pathname === "/" || pathname === "" || pathname === "/g" || pathname === "/g/" ? "/" : pathname;
  return { slug: DEFAULT_GROUP_SLUG, basename, redirect: `${basename}${rest}${search}${hash}` };
}

const HAS_WINDOW = typeof window !== "undefined";

/** The URL the document was opened with, BEFORE the redirect below — `useLocationRestore`
 *  needs the cold-launch value (`/` from the manifest), not the corrected one. */
export const ORIGINAL_ENTRY_PATH = HAS_WINDOW ? window.location.pathname + window.location.search : "";

const entry = HAS_WINDOW
  ? resolveEntry(window.location.pathname, window.location.search, window.location.hash)
  : resolveEntry(`/g/${DEFAULT_GROUP_SLUG}`);

export const GROUP_SLUG = entry.slug;
export const APP_BASENAME = entry.basename;

if (HAS_WINDOW && entry.redirect) {
  // `history.state` is kept: `navStack`'s `idx` and react-router's key live there.
  window.history.replaceState(window.history.state, "", entry.redirect);
}

/**
 * Pure: a backend-emitted absolute app path (`/g/altherren/live/3?comment=9`) → the
 * router path it names in this group (`/live/3?comment=9`), or `null` when it belongs to
 * another group. A path with no group at all (an item cached before the batch, a
 * rolled-back backend) is already a router path and comes back as it is.
 *
 * Safe to call while rendering (`RecordBadges` builds a `to` from it); `toRouterPath` is
 * the one that acts.
 */
export function routerPathOf(abs: string): string | null {
  if (abs === APP_BASENAME) return "/";
  if (abs.startsWith(APP_BASENAME)) {
    const rest = abs.slice(APP_BASENAME.length);
    if (rest.startsWith("/")) return rest;
    if (rest.startsWith("?") || rest.startsWith("#")) return `/${rest}`;
  }
  if (GROUP_RE.test(abs)) return null;
  return abs;
}

/**
 * For a click: the router path to `navigate` to — or, when the path is another group's,
 * a full navigation there (`assign`) and `null`, so the caller does nothing more (the
 * page is about to be replaced; part 2's group switch comes for free).
 */
export function toRouterPath(abs: string, assign: (url: string) => void = (url) => window.location.assign(url)): string | null {
  const to = routerPathOf(abs);
  if (to === null) assign(abs);
  return to;
}

/** A router path → the absolute URL path of this group (for anything the router does not
 *  own: a copied link, a full navigation). */
export function toAbsolutePath(routerPath: string): string {
  return `${APP_BASENAME}${routerPath}`;
}
