/**
 * The Ideas board's vocabulary and its list arithmetic (R5).
 *
 * Everything here is pure, so the page is left with rendering and the filtering
 * rules are unit-testable (`src/test/ideaMeta.test.ts`).
 */
import { Bug, CalendarCheck, Check, Hammer, PencilRuler, Sparkles, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { matchStatusPill, pillBaseClass } from "../../ui/theme";
import type { Idea, IdeaArea, IdeaKind, IdeaStatus } from "../../api/types";

export const IDEA_KINDS: readonly IdeaKind[] = ["feature", "change", "bug"] as const;

export const IDEA_KIND_LABEL: Record<IdeaKind, string> = {
  feature: "Feature",
  change: "Change",
  bug: "Bug",
};

export const IDEA_KIND_ICON: Record<IdeaKind, LucideIcon> = {
  feature: Sparkles,
  change: PencilRuler,
  bug: Bug,
};

export const IDEA_STATUSES: readonly IdeaStatus[] = [
  "new",
  "planned",
  "doing",
  "done",
  "declined",
] as const;

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  new: "New",
  planned: "Planned",
  doing: "In progress",
  done: "Done",
  declined: "Declined",
};

export const IDEA_STATUS_ICON: Record<IdeaStatus, LucideIcon> = {
  new: Sparkles,
  planned: CalendarCheck,
  doing: Hammer,
  done: Check,
  declined: X,
};

/**
 * Status colour comes from the app's three status tokens and nowhere else
 * (`DESIGN.md` §2): blue = not started yet, green = happening now, neutral =
 * finished with. Five statuses, three colours — the label and the icon inside the
 * pill carry the rest, and `declined` stays neutral because a decision is not an
 * error (`error`/`warn` mean something is wrong).
 */
export function ideaStatusPillClass(status: IdeaStatus): string {
  if (status === "doing") return matchStatusPill("playing");
  if (status === "new" || status === "planned") return matchStatusPill("scheduled");
  return pillBaseClass();
}

/** The three status groups the page's tab strip offers. */
export type IdeaTab = "open" | "closed" | "all";
export const IDEA_TAB_KEYS = ["open", "closed", "all"] as const satisfies readonly IdeaTab[];

const OPEN_STATUSES: readonly IdeaStatus[] = ["new", "planned", "doing"];

export function ideaMatchesTab(idea: Idea, tab: IdeaTab): boolean {
  if (tab === "all") return true;
  const open = OPEN_STATUSES.includes(idea.status);
  return tab === "open" ? open : !open;
}

export type IdeaSort = "top" | "new";
export const IDEA_SORT_KEYS = ["top", "new"] as const satisfies readonly IdeaSort[];

/** `top` = most wanted first, ties broken by recency; `new` = newest first. */
export function sortIdeas(ideas: Idea[], sort: IdeaSort): Idea[] {
  const byNewest = (a: Idea, b: Idea) =>
    b.created_at.localeCompare(a.created_at) || b.id - a.id;
  if (sort === "new") return [...ideas].sort(byNewest);
  return [...ideas].sort((a, b) => b.votes - a.votes || byNewest(a, b));
}

export function filterIdeas(ideas: Idea[], opts: { tab: IdeaTab; area: string | null }): Idea[] {
  return ideas.filter(
    (i) => ideaMatchesTab(i, opts.tab) && (opts.area == null || i.areas.includes(opts.area)),
  );
}

/**
 * The area keys worth offering as a filter: every key that some idea actually
 * carries, in catalog order, with keys this build no longer knows kept at the end.
 * A retired — or entirely unknown — area therefore stays reachable for as long as
 * one idea names it, and disappears by itself once none does.
 */
export function usedAreaKeys(ideas: Idea[], catalog: IdeaArea[]): string[] {
  const order = new Map(catalog.map((a, i) => [a.key, i]));
  const used = new Set<string>();
  for (const idea of ideas) for (const area of idea.areas) used.add(area);
  const known = [...used].filter((k) => order.has(k)).sort((a, b) => order.get(a)! - order.get(b)!);
  const unknown = [...used].filter((k) => !order.has(k)).sort();
  return [...known, ...unknown];
}

/**
 * An area's label. A key the server's catalog no longer lists is rendered as the
 * key itself rather than dropped — losing "which page was this about" is worse
 * than an unpolished label (`backend/app/feature_areas.py` explains the rule).
 */
export function areaLabel(key: string, catalog: IdeaArea[]): string {
  return catalog.find((a) => a.key === key)?.label ?? key;
}

/** Areas that may be chosen for a new idea (retired ones label old ideas only). */
export function selectableAreas(catalog: IdeaArea[]): IdeaArea[] {
  return catalog.filter((a) => a.selectable);
}

/**
 * "Not about one page" and "Several pages" answer the question instead of naming a
 * page, so they cannot be combined with a page or with each other — the server
 * enforces it, and the composer has to behave the same way or the Post button
 * would die on a 400 the reader cannot see.
 */
export const SCOPE_AREAS: readonly string[] = ["general", "several"];

export function toggleArea(current: string[], key: string): string[] {
  if (current.includes(key)) return current.filter((k) => k !== key);
  if (SCOPE_AREAS.includes(key)) return [key];
  return [...current.filter((k) => !SCOPE_AREAS.includes(k)), key];
}
