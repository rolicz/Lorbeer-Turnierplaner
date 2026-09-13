/* eslint-disable react-refresh/only-export-components */
import type { Club } from "../api/types";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  hideLabel = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
  right?: ReactNode;
  /** Drop the visible caption (the control keeps its aria-label) — used in the club picker sheet. */
  hideLabel?: boolean;
}) {
  return (
    <div className="block">
      {hideLabel ? null : (
        <FormLabel className="inline-flex items-center gap-1.5">
          <Filter className="h-3 w-3" aria-hidden="true" />
          Stars
        </FormLabel>
      )}

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
  hideLabel = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
  options: LeagueOpt[];
  /** Drop the visible caption (the control keeps its aria-label) — used in the club picker sheet. */
  hideLabel?: boolean;
}) {
  return (
    <div className="block">
      {hideLabel ? null : (
        <FormLabel className="inline-flex items-center gap-1.5">
          <Filter className="h-3 w-3" aria-hidden="true" />
          League
        </FormLabel>
      )}

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

// --- Randomness (unbiased, Web Crypto) ---------------------------------------

/** Unbiased RNG using Web Crypto (rejection sampling prevents modulo bias). */
export function cryptoRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  const max = 0xffffffff;
  const limit = max - (max % maxExclusive);
  const u32 = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(u32);
    const x = u32[0];
    if (x == null) continue;
    if (x < limit) return x % maxExclusive;
  }
}

export function randomPick<T>(arr: T[]): T {
  if (!arr.length) throw new Error("randomPick requires a non-empty array");
  const value = arr[cryptoRandomInt(arr.length)];
  if (value == null) throw new Error("randomPick failed to select a value");
  return value;
}

function randomPickDifferent(arr: number[], prev: number | null): number {
  if (arr.length <= 1 || prev == null) return randomPick(arr);
  for (let i = 0; i < 6; i++) {
    const v = randomPick(arr);
    if (v !== prev) return v;
  }
  return randomPick(arr);
}

// --- Shared club-list filter state --------------------------------------------

export type ClubFilters = {
  starFilter: number | null;
  setStarFilter: (v: number | null) => void;
  leagueFilter: number | null;
  setLeagueFilter: (v: number | null) => void;
  leagueOptions: LeagueOpt[];
  /** Star steps that exist inside the current league selection (the dice only lands on these). */
  availableStarSteps: number[];
  /** The full club list, sorted (stars desc, then name). */
  sorted: Club[];
  /** `sorted` narrowed by the star + league filters. */
  filtered: Club[];
  /** True while any filter is set. */
  active: boolean;
  clear: () => void;
  /** Animated random star-tier roll (~700 ms), landing on an available step. */
  rollStars: () => void;
  rolling: boolean;
};

/**
 * Star + league filtering for a club list, shared by the club picker sheet (which
 * shows the two selects) and `SelectClubsPanel` (whose random matchup draws from
 * the same filtered pool, and whose dice rolls the star tier).
 */
export function useClubFilters(clubs: Club[]): ClubFilters {
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [leagueFilter, setLeagueFilter] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);

  const lastRollRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const sorted = useMemo(() => sortClubsForDropdown(clubs), [clubs]);

  const leagueOptions = useMemo<LeagueOpt[]>(() => {
    const byId = new Map<number, string>();
    for (const c of sorted) {
      const li = leagueInfo(c);
      if (li.id == null) continue;
      if (!byId.has(li.id)) byId.set(li.id, li.name ?? `League #${li.id}`);
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((x, y) => x.name.localeCompare(y.name));
  }, [sorted]);

  const availableStarSteps = useMemo(() => {
    const set = new Set<number>();
    for (const c of sorted) {
      if (leagueFilter != null && leagueInfo(c).id !== leagueFilter) continue;
      const s = toHalfStep(c.star_rating);
      if (s != null) set.add(s);
    }
    const arr = Array.from(set.values()).sort((a, b) => a - b);
    return arr.length ? arr : STAR_OPTIONS;
  }, [sorted, leagueFilter]);

  const filtered = useMemo(() => {
    let out = sorted;
    if (starFilter != null) out = out.filter((c) => toHalfStep(c.star_rating) === starFilter);
    if (leagueFilter != null) out = out.filter((c) => leagueInfo(c).id === leagueFilter);
    return out;
  }, [sorted, starFilter, leagueFilter]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  function rollStars() {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);

    setRolling(true);
    intervalRef.current = window.setInterval(() => {
      setStarFilter(randomPickDifferent(STAR_OPTIONS, lastRollRef.current));
    }, 75);

    timeoutRef.current = window.setTimeout(() => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      const v = randomPickDifferent(availableStarSteps, lastRollRef.current);
      lastRollRef.current = v;
      setStarFilter(v);
      setRolling(false);
    }, 700);
  }

  return {
    starFilter,
    setStarFilter,
    leagueFilter,
    setLeagueFilter,
    leagueOptions,
    availableStarSteps,
    sorted,
    filtered,
    active: starFilter != null || leagueFilter != null,
    clear: () => {
      setStarFilter(null);
      setLeagueFilter(null);
    },
    rollStars,
    rolling,
  };
}

// --- Recently picked clubs (club picker) --------------------------------------

const RECENT_CLUBS_KEY = "club_picker_recent_v1";
const RECENT_CLUBS_MAX = 6;

/** The club ids picked most recently, newest first (per browser). */
export function readRecentClubIds(): number[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(RECENT_CLUBS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0)
      .slice(0, RECENT_CLUBS_MAX);
  } catch {
    return [];
  }
}

export function rememberRecentClubId(id: number) {
  try {
    if (typeof window === "undefined") return;
    const next = [id, ...readRecentClubIds().filter((v) => v !== id)].slice(0, RECENT_CLUBS_MAX);
    window.localStorage.setItem(RECENT_CLUBS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures (private mode, quota)
  }
}
