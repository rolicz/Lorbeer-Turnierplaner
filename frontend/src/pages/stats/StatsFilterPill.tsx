/**
 * The two global stats filters (Mode and Source) as one floating pill.
 *
 * Since Q7 this file is only the stats page's *answer* to `ui/primitives/FilterPill`:
 * which groups exist, what they are called, which value counts as "unfiltered" and
 * how each shows itself in the capsule (mode as a short word, source as an icon).
 * Everything else — the capsule, the popover, the placement, the accent state, the
 * once-per-session pulse — belongs to the shared control, which the friendlies list
 * uses with groups of its own.
 *
 * Sections that use only one (or neither) filter hide the parts they don't need;
 * with neither, nothing is rendered at all.
 */
import { Handshake, Layers, Trophy, type LucideIcon } from "lucide-react";

import FilterPill, { filterGroup, type FilterPillGroup } from "../../ui/primitives/FilterPill";
import type { StatsMode } from "./statsMode";
import type { StatsScope } from "../../api/types";

/** "overall" reads as "All" in the UI; the URL value stays `overall`. */
const MODE_OPTIONS = [
  { key: "overall", label: "All" },
  { key: "1v1", label: "1v1" },
  { key: "2v2", label: "2v2" },
] as const satisfies readonly { key: StatsMode; label: string }[];

const SCOPE_OPTIONS = [
  { key: "tournaments", label: "Tournaments", icon: Trophy },
  { key: "both", label: "Both", icon: Layers },
  { key: "friendlies", label: "Friendlies", icon: Handshake },
] as const satisfies readonly { key: StatsScope; label: string; icon: LucideIcon }[];

/** Defaults — anything else means the numbers on screen are filtered. */
const DEFAULT_MODE: StatsMode = "overall";
const DEFAULT_SCOPE: StatsScope = "tournaments";

/** One attention pulse per browser session, not per visit to the page. */
const PULSE_KEY = "lk:stats-filter-pulsed";

export default function StatsFilterPill({
  mode, scope, onModeChange, onScopeChange, showMode, showScope,
}: {
  mode: StatsMode; scope: StatsScope;
  onModeChange: (m: StatsMode) => void; onScopeChange: (s: StatsScope) => void;
  showMode: boolean; showScope: boolean;
}) {
  const groups: FilterPillGroup[] = [];
  if (showMode) {
    groups.push(
      filterGroup<StatsMode>({
        label: "Mode",
        value: mode,
        options: MODE_OPTIONS,
        onChange: onModeChange,
        defaultValue: DEFAULT_MODE,
        token: "text",
      }),
    );
  }
  if (showScope) {
    groups.push(
      filterGroup<StatsScope>({
        label: "Source",
        value: scope,
        options: SCOPE_OPTIONS,
        onChange: onScopeChange,
        defaultValue: DEFAULT_SCOPE,
        token: "icon",
      }),
    );
  }

  return <FilterPill groups={groups} ariaLabel="Stats filters" pulseKey={PULSE_KEY} />;
}
