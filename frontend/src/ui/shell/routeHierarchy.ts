import { statsMatchupParent } from "../../pages/stats/statsNav";

/**
 * Where every location sits in the app, asked once (Q6).
 *
 * The app has one hierarchy and it is declared here — not in a list of "detail"
 * route patterns the mobile bar keeps, plus a `back` prop every desktop page
 * decides for itself. Those two used to be the two sources of truth, and they
 * agreed only by coincidence: the stats matchup is a real history step with no
 * chevron, and `/profile` showed a hamburger while `/profiles/2`, the very same
 * page, showed a back arrow.
 *
 * Two facts, and every back affordance reads both:
 *
 * - **`inside`** — did the reader go *into* this page? That, and nothing else,
 *   decides whether a back affordance is drawn. A destination (anything the nav
 *   bar or the drawer points at, and anything with no hierarchy above it) is not
 *   "inside" anything: its siblings are one tap away in a bar that is always on
 *   screen, and a chevron there would read "the screen before" while meaning
 *   "the dashboard".
 * - **`parent`** — the page one level up. `null` only at home. It never depends
 *   on how the reader arrived: walked in, deep link and push notification all
 *   get the same answer (Roli, 2026-09-16).
 */

/** The top of the hierarchy: the app's home. */
export const HOME = "/dashboard";

export type Place = {
  /** The page one level up, or `null` at home. */
  parent: string | null;
  /** Did the reader go into this page? Only these show a back affordance. */
  inside: boolean;
  /**
   * For a drill-in whose parent lives at the *same* path (a query param, not a
   * route): the param that **is** the drill-in. An entry behind us that still
   * carries it is another drill-in, not the parent.
   */
  drillParam?: string;
  /**
   * …and the params that pick the *body* under that path. `/stats` is four pages
   * under one URL, told apart by `?view=`; the entry behind us has to be the one
   * the parent names (A9).
   */
  sameParams?: readonly string[];
};

/** Path without a trailing slash (`/live/19/` and `/live/19` are one page). */
function normalise(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/**
 * A match page returns to the tab it was opened from — `state.fromTab` is the
 * *parent's* tab, not a memory of where the reader came from, so it survives
 * "back never depends on how you arrived".
 */
function liveParent(base: string, state: unknown): string {
  const fromTab = (state as { fromTab?: unknown } | null)?.fromTab;
  return typeof fromTab === "string" && fromTab ? `${base}?tab=${encodeURIComponent(fromTab)}` : base;
}

export function placeOf(pathname: string, search = "", state?: unknown): Place {
  const path = normalise(pathname);

  const match = path.match(/^\/live\/([^/]+)\/match\/[^/]+$/);
  if (match) return { parent: liveParent(`/live/${match[1]}`, state), inside: true };
  if (/^\/live\/[^/]+$/.test(path)) return { parent: "/tournaments", inside: true };
  // `/profile` is the reader's own profile page — the same component, the same
  // place in the hierarchy as anyone else's.
  if (path === "/profile" || /^\/profiles\/[^/]+$/.test(path)) return { parent: "/players", inside: true };
  if (path === "/stats") {
    // The one drill-in that is a query param rather than a route (T11).
    const parent = statsMatchupParent(search);
    if (parent) return { parent, inside: true, drillParam: "vs", sameParams: ["view"] };
  }

  // Everything else is a destination: the nav bar's seven, `/login`, and any URL
  // that matched nothing (the 404). Home is the only one with nothing above it.
  if (path === HOME) return { parent: null, inside: false };
  return { parent: HOME, inside: false };
}

/** The page one level up from here, or `null` at home. */
export function parentOf(pathname: string, search = "", state?: unknown): string | null {
  return placeOf(pathname, search, state).parent;
}
