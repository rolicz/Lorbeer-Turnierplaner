/**
 * Stats information architecture — four sections with sub-views, plus the mapping
 * from every URL shape earlier layouts produced onto the canonical pair
 * `?view=overview|trends|h2h|player` + `?sub=…`.
 *
 * Legacy inputs that are mapped here (and rewritten once by `StatsInsights`):
 *  - `?view=table|positions|streaks|records|cups|stars` (the old insights tabs),
 *  - `?section=players|ratings|trends|h2h|streaks|stars|matches` (the classic tabs),
 *  - `#trends` / `#stats-trends` and nav state `{ focus: "trends" }`,
 *  - nav state `{ statsTab: … }` (dashboard deep links).
 */

/**
 * One-shot deep-link param of the Cups sub-view: which cup to open at
 * (`?view=overview&sub=cups&cup=<key>`, the dashboard preview's links).
 * `CupsView` scrolls to that section and drops the param again; it is listed in
 * `ui/shell/lastLocation.ts`'s one-shot params, so it is never replayed.
 */
export const CUP_PARAM = "cup";

/** Anchor id of one cup's section inside the Cups sub-view. */
export function cupSectionId(cupKey: string): string {
  return `cup-${cupKey}`;
}

/** Link into the Cups sub-view, opening at that cup. */
export function cupSectionHref(cupKey: string): string {
  return `/stats?view=overview&sub=cups&${CUP_PARAM}=${encodeURIComponent(cupKey)}`;
}

export type StatsView = "overview" | "trends" | "h2h" | "player";
export type OverviewSub = "table" | "positions" | "streaks" | "records" | "cups";
export type H2HSub = "players" | "duos";
export type StatsSub = OverviewSub | H2HSub;

export const STATS_VIEWS: readonly StatsView[] = ["overview", "trends", "h2h", "player"];
export const OVERVIEW_SUBS: readonly OverviewSub[] = ["table", "positions", "streaks", "records", "cups"];
export const H2H_SUBS: readonly H2HSub[] = ["players", "duos"];

/** Sub-views of a section; empty for sections that have none (Trends, Player). */
export function subsFor(view: StatsView): readonly StatsSub[] {
  return view === "overview" ? OVERVIEW_SUBS : view === "h2h" ? H2H_SUBS : [];
}

export function defaultSubFor(view: StatsView): StatsSub {
  return view === "h2h" ? "players" : "table";
}

function isView(v: string): v is StatsView {
  return (STATS_VIEWS as readonly string[]).includes(v);
}

function isSubOf(view: StatsView, v: string | null): v is StatsSub {
  return v != null && (subsFor(view) as readonly string[]).includes(v);
}

type Target = { view: StatsView; sub?: StatsSub };

/** Old `?view=` values from the first insights layout (nine flat tabs). */
const LEGACY_VIEWS = new Map<string, Target>([
  ["table", { view: "overview", sub: "table" }],
  ["positions", { view: "overview", sub: "positions" }],
  ["streaks", { view: "overview", sub: "streaks" }],
  ["records", { view: "overview", sub: "records" }],
  ["cups", { view: "overview", sub: "cups" }],
  ["stars", { view: "player" }],
]);

/** Old `?section=` values from the classic layout. */
const LEGACY_SECTIONS = new Map<string, Target>([
  ["players", { view: "overview", sub: "table" }],
  ["ratings", { view: "overview", sub: "table" }],
  ["trends", { view: "trends" }],
  ["h2h", { view: "h2h" }],
  ["streaks", { view: "overview", sub: "streaks" }],
  ["stars", { view: "player" }],
  ["matches", { view: "player" }],
]);

export type ResolvedStatsView = {
  view: StatsView;
  /** Active sub-view of `view`; ignored where `subsFor(view)` is empty. */
  sub: StatsSub;
  /** True when the URL (or nav state) used an older shape and must be rewritten. */
  legacy: boolean;
};

/**
 * Resolve the section + sub-view to render from the URL and the nav state.
 * Pure — `StatsInsights` owns the rewrite when `legacy` is true.
 */
export function resolveStatsView(search: URLSearchParams, hash: string, state: unknown): ResolvedStatsView {
  const st = (state ?? null) as { focus?: unknown; statsTab?: unknown } | null;
  const rawView = search.get("view");
  const rawSection = search.get("section");
  const trendsHash = hash === "#trends" || hash === "#stats-trends";

  // Anything that is not the canonical `?view=`/`?sub=` pair has to be rewritten once.
  let legacy = rawSection != null || trendsHash || (rawView != null && LEGACY_VIEWS.has(rawView));
  let target: Target | null = null;

  if (rawView != null && isView(rawView)) {
    target = { view: rawView };
  } else if (rawView != null && LEGACY_VIEWS.has(rawView)) {
    target = LEGACY_VIEWS.get(rawView) ?? null;
  } else if (rawSection != null && LEGACY_SECTIONS.has(rawSection)) {
    target = LEGACY_SECTIONS.get(rawSection) ?? null;
  } else if (trendsHash || st?.focus === "trends") {
    target = { view: "trends" };
    legacy = true;
  } else if (typeof st?.statsTab === "string") {
    target = isView(st.statsTab) ? { view: st.statsTab } : LEGACY_VIEWS.get(st.statsTab) ?? null;
    if (target) legacy = true;
  }

  if (!target) {
    // Nothing given: the Player section when a player is deep-linked, else Overview.
    const player = Number(search.get("player"));
    target = { view: Number.isFinite(player) && player > 0 ? "player" : "overview" };
  }

  const view = target.view;
  const rawSub = search.get("sub");
  const sub = target.sub ?? (isSubOf(view, rawSub) ? rawSub : defaultSubFor(view));
  return { view, sub, legacy };
}

/**
 * The canonical search params for a section + sub-view (drops `section`).
 *
 * A section without sub-views (Trends, Player) keeps whatever `sub` the URL already
 * carries instead of dropping it: `resolveStatsView` ignores a sub that does not
 * belong to the active section, and keeping it is what lets a jump to the Player
 * section (a Table or Records row tap, a cross-link) come back to the sub-view it
 * started from instead of falling back to Table.
 */
export function canonicalStatsParams(search: URLSearchParams, view: StatsView, sub: StatsSub): URLSearchParams {
  const next = new URLSearchParams(search);
  next.delete("section");
  next.set("view", view);
  if (subsFor(view).length) next.set("sub", sub);
  return next;
}

/** Sub-view to use when switching to `view`: keep the current one if it fits, else the default. */
export function subForSection(view: StatsView, currentSub: string | null): StatsSub {
  return isSubOf(view, currentSub) ? currentSub : defaultSubFor(view);
}
