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

// --- Club selection for both sides of a match ---------------------------------

export type ClubSelection = {
  clubs: Club[];
  disabled: boolean;
  aLabel: string;
  bLabel: string;
  aClub: number | null;
  bClub: number | null;
  filters: ClubFilters;
  pickerOpen: boolean;
  /** The side the picker sheet is currently showing. */
  activeKey: "A" | "B";
  setActiveKey: (key: "A" | "B") => void;
  /** Opens the sheet on one side — this is what a club slot in the panel calls. */
  openPicker: (side: "A" | "B") => void;
  closePicker: () => void;
  /** Applies a pick, then advances to the empty side or closes. */
  pick: (side: "A" | "B", clubId: number | null) => void;
  /** Random matchup over the filtered pool (crypto RNG, no duplicate, no national vs club). */
  randomize: () => void;
};

/**
 * The whole club-selection state of one match: the two clubs, the shared
 * star/league filters, which side the picker sheet is on, and the random
 * matchup. `SelectClubsPanel` renders all of it inside one panel (T9); a call
 * site owns the hook so it can write each change the way it saves (autosave on
 * the live match, form state everywhere else).
 */
export function useClubSelection({
  clubs,
  disabled = false,
  aLabel,
  bLabel,
  aClub,
  bClub,
  onChangeAClub,
  onChangeBClub,
  onChangeClubs,
}: {
  clubs: Club[];
  disabled?: boolean;
  /** The side's players, e.g. "Roli" or "Flo + Berni". */
  aLabel: string;
  bLabel: string;
  aClub: number | null;
  bClub: number | null;
  onChangeAClub: (v: number | null) => void;
  onChangeBClub: (v: number | null) => void;
  /** Preferred for the random matchup, so a call site can save both sides in one write. */
  onChangeClubs?: (a: number, b: number) => void;
}): ClubSelection {
  const filters = useClubFilters(clubs);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<"A" | "B">("A");

  function openPicker(side: "A" | "B") {
    if (disabled) return;
    setActiveKey(side);
    setPickerOpen(true);
  }

  function pick(side: "A" | "B", clubId: number | null) {
    if (side === "A") onChangeAClub(clubId);
    else onChangeBClub(clubId);

    // Setting one side while the other is still empty keeps the sheet open and
    // moves to that side — picking both clubs stays a single visit.
    const otherEmpty = side === "A" ? bClub == null : aClub == null;
    if (clubId != null && otherEmpty) {
      setActiveKey(side === "A" ? "B" : "A");
      return;
    }
    setPickerOpen(false);
  }

  function randomize() {
    if (disabled) return;
    const pool = filters.filtered;
    if (!pool.length) return;

    const clubA = pool[cryptoRandomInt(pool.length)];
    const firstClubB = pool[cryptoRandomInt(pool.length)];
    if (!clubA || !firstClubB) return;
    let clubB = firstClubB;

    if (pool.length > 1) {
      let guard = 0;
      while (!randomClubAssignmentOk(clubA, clubB) && guard < 50) {
        const candidate = pool[cryptoRandomInt(pool.length)];
        if (!candidate) break;
        clubB = candidate;
        guard++;
      }
    }

    if (onChangeClubs) {
      onChangeClubs(clubA.id, clubB.id);
      return;
    }
    onChangeAClub(clubA.id);
    onChangeBClub(clubB.id);
  }

  return {
    clubs,
    disabled,
    aLabel,
    bLabel,
    aClub,
    bClub,
    filters,
    pickerOpen,
    activeKey,
    setActiveKey,
    openPicker,
    closePicker: () => setPickerOpen(false),
    pick,
    randomize,
  };
}

// --- Remembered panel state (T9) ----------------------------------------------

const CLUB_PANEL_OPEN_PREFIX = "club_panel_open:";

/**
 * Open/closed of `SelectClubsPanel`, remembered per surface (the live Current
 * tab, the match-detail Edit tab and the two friendly forms each have their own
 * key). Same idiom as `match_list_view`: a plain localStorage string, the
 * surface's own default when nothing is stored yet.
 */
export function useClubPanelOpen(
  storageKey: string | undefined,
  defaultOpen: boolean,
): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState<boolean>(() => {
    if (!storageKey) return defaultOpen;
    try {
      const raw = window.localStorage.getItem(CLUB_PANEL_OPEN_PREFIX + storageKey);
      if (raw === "1") return true;
      if (raw === "0") return false;
    } catch {
      // ignore storage failures (private mode, quota)
    }
    return defaultOpen;
  });

  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (!storageKey) return;
    try {
      window.localStorage.setItem(CLUB_PANEL_OPEN_PREFIX + storageKey, next ? "1" : "0");
    } catch {
      // ignore storage failures (private mode, quota)
    }
  };

  return [open, setOpen];
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
