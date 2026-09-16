/**
 * Stats information architecture — four sections with sub-views, plus the mapping
 * from every URL shape earlier layouts produced onto the canonical pair
 * `?view=overview|trends|h2h|player` + `?sub=…`.
 *
 * The matchup drill-in addresses its two sides with `?player=` and `?vs=`, each of
 * which carries **one or two** comma-separated player ids (T7): one id per side is
 * "this player against that one, whatever the partners", two ids on both sides is
 * the exact team matchup (`exact_teams` on the backend). Single-id URLs — every
 * link written before T7 and everything in browser history — keep their meaning.
 *
 * Legacy inputs that are mapped here (and rewritten once by `StatsInsights`):
 *  - `?view=table|positions|streaks|records|cups|stars` (the old insights tabs),
 *  - `?section=players|ratings|trends|h2h|streaks|stars|matches` (the classic tabs),
 *  - `#trends` / `#stats-trends` and nav state `{ focus: "trends" }`,
 *  - nav state `{ statsTab: … }` (dashboard deep links).
 */

import type { StatsMode } from "./statsMode";
import type { StatsScope } from "../../api/types";

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

/** How many player ids one matchup side can carry (`?player=1,5`): a 2v2 team. */
export const MATCHUP_SIDE_MAX = 2;

/**
 * Player ids of one matchup side. Accepts `"1"` and `"1,5"`; ignores junk, zero,
 * negative and duplicate ids and keeps at most `MATCHUP_SIDE_MAX` of them, in the
 * order the URL gives them (the side's display order).
 */
export function parseMatchupSide(raw: string | null): number[] {
  if (!raw) return [];
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const id = Number(part.trim());
    if (!Number.isInteger(id) || id <= 0 || out.includes(id)) continue;
    out.push(id);
    if (out.length >= MATCHUP_SIDE_MAX) break;
  }
  return out;
}

/** The param value for a matchup side ("" when there is none, so it gets deleted). */
export function formatMatchupSide(ids: number[]): string {
  return ids
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, MATCHUP_SIDE_MAX)
    .join(",");
}

/**
 * A matchup side only means something inside the matchup, so a team collapses to
 * its first player wherever the drill-in is left (`setView`, a cleared `vs`).
 */
export function collapseMatchupSide(params: URLSearchParams, key: string): void {
  const ids = parseMatchupSide(params.get(key));
  if (ids.length > 1) params.set(key, String(ids[0]));
}

/**
 * Link into the matchup from outside `/stats` (match detail, profile cards).
 *
 * Every such shortcut states its filters, and **Source is Tournaments** unless the
 * caller says otherwise (T7, Roli: "always use 'tournaments' and not both"). Pass
 * two ids per side for the exact team matchup.
 */
export function statsMatchupHref({
  left,
  right,
  mode = "overall",
  scope = "tournaments",
  relation,
}: {
  left: number[];
  right?: number[];
  mode?: StatsMode;
  scope?: StatsScope;
  /** "together" opens the matchup on its teammates relation (`?rel=together`). */
  relation?: "against" | "together";
}): string {
  const player = formatMatchupSide(left);
  const vs = formatMatchupSide(right ?? []);
  // Ids are digits and commas, so the query needs no escaping and stays readable.
  const parts = [`view=h2h`, `mode=${mode}`, `source=${scope}`];
  if (player) parts.push(`player=${player}`);
  if (vs) parts.push(`vs=${vs}`);
  if (relation === "together") parts.push("rel=together");
  return `/stats?${parts.join("&")}`;
}

/**
 * The page the matchup drills into: this same stats URL with the drill-in taken
 * off — `vs` and `rel` gone, a 2v2 team collapsed to its first player, every
 * filter kept. Exactly what clearing the matchup in place produces, which is why
 * the shell's hierarchy (`ui/shell/routeHierarchy.ts`) asks for it here: the
 * stats URL scheme lives in this file, and back must not learn a second copy of
 * it (Q6).
 *
 * `null` when this URL is not a matchup at all — `?vs=` only means something in
 * the H2H section, and `/stats?view=player&vs=2` shows no drill-in to leave.
 */
export function statsMatchupParent(search: string): string | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }
  if (!parseMatchupSide(params.get("vs")).length) return null;
  if (params.get("view") !== "h2h") return null;
  params.delete("vs");
  params.delete("rel");
  collapseMatchupSide(params, "player");
  const rest = params.toString();
  return rest ? `/stats?${rest}` : "/stats";
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
