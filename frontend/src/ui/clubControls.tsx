/* eslint-disable react-refresh/only-export-components */
import type { Club } from "../api/types";
import type { ReactNode } from "react";
import { Filter } from "lucide-react";

import FilterSelect from "./FilterSelect";

export type LeagueOpt = { id: number; name: string };

export const STAR_OPTIONS: number[] = Array.from({ length: 10 }, (_, i) => (i + 1) * 0.5); // 0.5..5.0

export function starsLabel(v: unknown): string {
  if (typeof v === "number") return v.toFixed(1).replace(/\.0$/, "");
  if (typeof v === "string") return v;
  const n = Number(v);
  if (Number.isFinite(n)) return n.toFixed(1).replace(/\.0$/, "");
  return "";
}

export function toHalfStep(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 2) / 2;
}

export function sortClubsForDropdown(clubs: Club[]) {
  return clubs
    .slice()
    .sort((a, b) => Number(b.star_rating ?? 0) - Number(a.star_rating ?? 0) || a.name.localeCompare(b.name));
}

export function leagueInfo(c: Club): { id: number | null; name: string | null } {
  const id = Number.isFinite(c.league_id) ? c.league_id : null;
  const name = c.league_name || (id != null ? `League #${id}` : null);
  return { id, name };
}

export function clubLabelPartsById(clubs: Club[], id: number | null | undefined) {
  if (!id) {
    return {
      name: "No club",
      league_name: null as string | null,
      rating: null as number | null,
      ratingText: null as string | null,
    };
  }
  const c = clubs.find((x) => x.id === id);
  if (!c) {
    return {
      name: `#${id}`,
      league_name: null as string | null,
      rating: null as number | null,
      ratingText: null as string | null,
    };
  }
  const r = Number(c.star_rating);
  return {
    name: c.name,
    league_name: c.league_name,
    rating: Number.isFinite(r) ? r : null,
    ratingText: Number.isFinite(r) ? `${starsLabel(r)}★` : null,
  };
}

export function ensureSelectedClubVisible(filtered: Club[], all: Club[], selectedId: number | null): Club[] {
  if (!selectedId) return filtered;

  const inFiltered = filtered.some((c) => c.id === selectedId);
  if (inFiltered) return filtered;

  const selected = all.find((c) => c.id === selectedId);
  if (selected) return [selected, ...filtered];

  // If selected id is unknown to the current dataset, keep list unchanged.
  return filtered;
}

export function randomClubAssignmentOk(clubA: Club, clubB: Club): boolean {
  if (clubB.id === clubA.id) return false;
  const aLeague = clubA.league_name ?? "";
  const bLeague = clubB.league_name ?? "";
  if (aLeague.startsWith("National (") && !bLeague.startsWith("National (")) return false;
  if (bLeague.startsWith("National (") && !aLeague.startsWith("National (")) return false;
  return true;
}

export function StarFilter({
  value,
  onChange,
  disabled,
  right,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
  right?: ReactNode;
}) {
  return (
    <div className="block">
      <div className="input-label inline-flex items-center gap-1.5">
        <Filter className="h-3 w-3" aria-hidden="true" />
        Stars
      </div>

      <div className={right ? "flex items-center gap-2" : undefined}>
        <div className={right ? "min-w-0 flex-1" : ""}>
          <FilterSelect
            value={value == null ? "" : String(value)}
            onChange={(v) => onChange(v ? Number(v) : null)}
            disabled={disabled}
            ariaLabel="Filter by stars"
            options={[
              { value: "", label: "All stars" },
              ...STAR_OPTIONS.map((v) => ({ value: String(v), label: `${starsLabel(v)}★` })),
            ]}
          />
        </div>
        {right}
      </div>
    </div>
  );
}

export function LeagueFilter({
  value,
  onChange,
  disabled,
  options,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
  options: LeagueOpt[];
}) {
  return (
    <div className="block">
      <div className="input-label inline-flex items-center gap-1.5">
        <Filter className="h-3 w-3" aria-hidden="true" />
        League
      </div>

      <FilterSelect
        value={value == null ? "" : String(value)}
        onChange={(v) => onChange(v ? Number(v) : null)}
        disabled={disabled}
        ariaLabel="Filter by league"
        options={[
          { value: "", label: "All leagues" },
          ...options.map((o) => ({ value: String(o.id), label: o.name })),
        ]}
      />
    </div>
  );
}

export function GoalStepper({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  ariaLabel: string;
}) {
  const dec = () => onChange(clampInt(value - 1, 0, 99));
  const inc = () => onChange(clampInt(value + 1, 0, 99));

  return (
    <div className="stepper" aria-label={ariaLabel}>
      <button
        type="button"
        className="stepper-btn"
        onClick={dec}
        disabled={disabled}
        title="Decrement score"
      >
        <i className="fa fa-minus leading-none" aria-hidden="true" />
      </button>
      <div className="stepper-divider" aria-hidden="true" />
      <div className="stepper-value">{value}</div>
      <div className="stepper-divider" aria-hidden="true" />
      <button
        type="button"
        className="stepper-btn"
        onClick={inc}
        disabled={disabled}
        title="Increment score"
      >
        <i className="fa fa-plus leading-none" aria-hidden="true" />
      </button>
    </div>
  );
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
