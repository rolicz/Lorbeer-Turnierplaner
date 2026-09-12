/**
 * The two global stats filters (Mode and Source) as one floating pill.
 *
 * Built from native <select> elements on purpose: iOS shows its wheel picker and
 * desktop its own dropdown, so the control feels native everywhere (same idea as
 * the shots entry in pages/live/TournamentCommentParts.tsx). The pill floats in
 * the bottom-right corner — above the mobile bottom tab bar, using the same
 * offset as the error toast — so the filters stay reachable while scrolled down.
 *
 * Sections that use only one (or neither) filter hide the segments they don't
 * need; with neither, nothing is rendered at all.
 */
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import type { StatsMode } from "./StatsControls";
import type { StatsScope } from "../../api/types";

const MODE_OPTIONS: { value: StatsMode; label: string }[] = [
  { value: "overall", label: "Overall" },
  { value: "1v1", label: "1v1" },
  { value: "2v2", label: "2v2" },
];

const SCOPE_OPTIONS: { value: StatsScope; label: string }[] = [
  { value: "tournaments", label: "Tournaments" },
  { value: "both", label: "Both" },
  { value: "friendlies", label: "Friendlies" },
];

function PillSelect<T extends string>({
  label, value, options, onChange,
}: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <span className="relative inline-flex items-center">
      <select
        className="select-pill"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={12} aria-hidden="true" className="pointer-events-none absolute right-1.5 text-text-muted" />
    </span>
  );
}

export default function StatsFilterPill({
  mode, scope, onModeChange, onScopeChange, showMode, showScope,
}: {
  mode: StatsMode; scope: StatsScope;
  onModeChange: (m: StatsMode) => void; onScopeChange: (s: StatsScope) => void;
  showMode: boolean; showScope: boolean;
}) {
  // Nothing to filter (e.g. Cups): no floating clutter over the content.
  if (!showMode && !showScope) return null;

  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 lg:bottom-6 lg:right-6">
      <div
        role="group"
        aria-label="Stats filters"
        className="flex items-center gap-0.5 rounded-full border border-border-card-chip/60 bg-bg-card-outer/85 py-1 pl-2.5 pr-1 shadow-pop backdrop-blur-md"
      >
        <SlidersHorizontal size={14} aria-hidden="true" className="shrink-0 text-text-muted" />
        {showMode ? <PillSelect<StatsMode> label="Mode" value={mode} options={MODE_OPTIONS} onChange={onModeChange} /> : null}
        {showMode && showScope ? <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border-card-chip/60" /> : null}
        {showScope ? <PillSelect<StatsScope> label="Source" value={scope} options={SCOPE_OPTIONS} onChange={onScopeChange} /> : null}
      </div>
    </div>
  );
}
