/* eslint-disable react-refresh/only-export-components */
import type { Club } from "../api/types";
import { useId } from "react";
import type { ReactNode } from "react";

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
  compact,
  right,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
  compact?: boolean;
  right?: ReactNode;
}) {
  const selectId = useId();

  return (
    <div className="block">
      <label htmlFor={selectId} className="mb-1 block">
        <span className="hidden md:inline text-xs text-muted">Filter by</span>
        <span className="md:hidden inline-flex items-center gap-2 text-xs text-muted">
          <i className="fa-solid fa-filter" aria-hidden="true" />
          <span className="sr-only">Filter by stars</span>
        </span>
        <span className="text-xs text-muted"> Stars</span>
      </label>

      <div className={right ? "flex items-center gap-2" : undefined}>
        <select
          id={selectId}
          className={`select-field w-full ${right ? "flex-1" : ""} ${compact ? "md:flex-none md:w-[140px]" : ""}`}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          disabled={disabled}
          title="Filter by stars"
        >
          <option value="">All</option>
          {STAR_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v.toFixed(1).replace(/\.0$/, "")}★
            </option>
          ))}
        </select>
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
  compact,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
  options: LeagueOpt[];
  compact?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-1">
        <span className="hidden md:inline text-xs text-muted">Filter by</span>
        <span className="md:hidden inline-flex items-center gap-2 text-xs text-muted">
          <i className="fa-solid fa-filter" aria-hidden="true" />
          <span className="sr-only">Filter by league</span>
        </span>
        <span className="text-xs text-muted"> League</span>
      </div>

      <select
        className={`select-field w-full ${compact ? "md:w-[180px]" : ""}`}
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        disabled={disabled}
        title="Filter by league"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
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

export function ClubSelect({
  label,
  value,
  onChange,
  disabled,
  clubs,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
  clubs: Club[];
  placeholder: string;
}) {
  return (
    <label className="block min-w-0">
      <div className="input-label">{label}</div>
      <select
        className="select-field min-w-0 max-w-full"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {clubs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {starsLabel(c.star_rating)}★
          </option>
        ))}
      </select>
    </label>
  );
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
