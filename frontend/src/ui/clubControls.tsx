/* eslint-disable react-refresh/only-export-components */
import type { Club } from "../api/types";
import type { ReactNode } from "react";
import { Filter, Minus, Plus } from "lucide-react";

import FilterSelect from "./FilterSelect";
import FormLabel from "./primitives/FormLabel";
import { nationalTeamNation } from "./nationalTeams";

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
      id: null as number | null,
      name: "No club",
      league_name: null as string | null,
      league_nation: null as string | null,
      national_nation: null as string | null,
      crest_updated_at: null as string | null,
      rating: null as number | null,
      ratingText: null as string | null,
    };
  }
  const c = clubs.find((x) => x.id === id);
  if (!c) {
    return {
      id: null as number | null,
      name: `#${id}`,
      league_name: null as string | null,
      league_nation: null as string | null,
      national_nation: null as string | null,
      crest_updated_at: null as string | null,
      rating: null as number | null,
      ratingText: null as string | null,
    };
  }
  const r = Number(c.star_rating);
  return {
    id: c.id as number | null,
    name: c.name,
    league_name: c.league_name,
    league_nation: c.league_nation ?? null,
    // Set only for National (Men)/(Women) clubs → their flag replaces the badge.
    national_nation: nationalTeamNation(c.name, c.league_name),
    crest_updated_at: c.crest_updated_at ?? null,
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
      <FormLabel className="inline-flex items-center gap-1.5">
        <Filter className="h-3 w-3" aria-hidden="true" />
        Stars
      </FormLabel>

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
      <FormLabel className="inline-flex items-center gap-1.5">
        <Filter className="h-3 w-3" aria-hidden="true" />
        League
      </FormLabel>

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
        <Minus size={16} strokeWidth={2.25} aria-hidden="true" />
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
        <Plus size={16} strokeWidth={2.25} aria-hidden="true" />
      </button>
    </div>
  );
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
