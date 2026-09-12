/**
 * The two global stats filters (Mode and Source) as one block, so the sections
 * that don't use a filter can hide it — and so the whole strip can later move
 * (e.g. into a filter sheet) from a single place.
 */
import { ChipGroup } from "./charts";
import type { StatsMode } from "./StatsControls";
import type { StatsScope } from "../../api/types";

export default function StatsFilters({
  mode, scope, onModeChange, onScopeChange, showMode, showScope,
}: {
  mode: StatsMode; scope: StatsScope;
  onModeChange: (m: StatsMode) => void; onScopeChange: (s: StatsScope) => void;
  showMode: boolean; showScope: boolean;
}) {
  // Nothing to filter (e.g. Cups): render no empty label row at all.
  if (!showMode && !showScope) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-0.5">
      {showMode ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Mode</span>
          <ChipGroup<StatsMode> value={mode} onChange={onModeChange} ariaLabel="Mode"
            options={[{ key: "overall", label: "Overall" }, { key: "1v1", label: "1v1" }, { key: "2v2", label: "2v2" }]} />
        </div>
      ) : null}
      {showScope ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Source</span>
          <ChipGroup<StatsScope> value={scope} onChange={onScopeChange} ariaLabel="Source"
            options={[{ key: "tournaments", label: "Tournaments" }, { key: "both", label: "Both" }, { key: "friendlies", label: "Friendlies" }]} />
        </div>
      ) : null}
    </div>
  );
}
