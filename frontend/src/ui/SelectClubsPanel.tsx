import { useEffect, useMemo, useRef, useState } from "react";

import type { Club } from "../api/types";

import Button from "./primitives/Button";
import CollapsibleCard from "./primitives/CollapsibleCard";
import ClubStarsEditor from "./ClubStarsEditor";
import { StarsFA } from "./primitives/StarsFA";
import {
  ClubSelect,
  LeagueFilter,
  STAR_OPTIONS,
  StarFilter,
  clubLabelPartsById,
  ensureSelectedClubVisible,
  leagueInfo,
  randomClubAssignmentOk,
  sortClubsForDropdown,
  toHalfStep,
  type LeagueOpt,
} from "./clubControls";

function DiceIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={"h-4 w-4 " + (spinning ? "dice-roll" : "")}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="4.5" width="15" height="15" rx="3" fill="none" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Unbiased RNG using Web Crypto (prevents modulo bias).
function cryptoRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 0) return 0;
  const max = 0xffffffff;
  const limit = max - (max % maxExclusive);
  const u32 = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(u32);
    const x = u32[0];
    if (x == null) continue;
    if (x < limit) return x % maxExclusive;
  }
}

function randomPick<T>(arr: T[]): T {
  if (!arr.length) {
    throw new Error("randomPick requires a non-empty array");
  }
  const value = arr[cryptoRandomInt(arr.length)];
  if (value == null) {
    throw new Error("randomPick failed to select a value");
  }
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

export default function SelectClubsPanel({
  clubs,
  disabled,
  aLabel,
  bLabel,
  aClub,
  bClub,
  onChangeAClub,
  onChangeBClub,
  onChangeClubs,
  defaultOpen = false,
  extraTop,
  extraBottom,
  wrap = true,
  showSelectedMeta = false,
  wrapClassName,
  narrowLayout = false,
}: {
  clubs: Club[];
  disabled: boolean;
  aLabel: string;
  bLabel: string;
  aClub: number | null;
  bClub: number | null;
  onChangeAClub: (v: number | null) => void;
  onChangeBClub: (v: number | null) => void;
  onChangeClubs?: (a: number, b: number) => void;
  defaultOpen?: boolean;
  extraTop?: React.ReactNode;
  extraBottom?: React.ReactNode;
  /** If false, renders only the panel body (no CollapsibleCard wrapper). */
  wrap?: boolean;
  /** Show league + stars for currently selected clubs (read-only). */
  showSelectedMeta?: boolean;
  /** Wrapper class for the CollapsibleCard when `wrap` is true. */
  wrapClassName?: string;
  /** Force stacked layout (useful inside narrow drawers/sheets where viewport breakpoints are misleading). */
  narrowLayout?: boolean;
}) {
  const clubsSorted = useMemo(() => sortClubsForDropdown(clubs), [clubs]);

  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [leagueFilter, setLeagueFilter] = useState<number | null>(null);

  const leagueOptions = useMemo<LeagueOpt[]>(() => {
    const byId = new Map<number, string>();
    for (const c of clubsSorted) {
      const li = leagueInfo(c);
      if (li.id == null) continue;
      if (!byId.has(li.id)) byId.set(li.id, li.name ?? `League #${li.id}`);
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((x, y) => x.name.localeCompare(y.name));
  }, [clubsSorted]);

  const availableStarSteps = useMemo(() => {
    const set = new Set<number>();
    for (const c of clubsSorted) {
      if (leagueFilter != null && leagueInfo(c).id !== leagueFilter) continue;
      const s = toHalfStep(c.star_rating);
      if (s != null) set.add(s);
    }
    const arr = Array.from(set.values()).sort((a, b) => a - b);
    return arr.length ? arr : STAR_OPTIONS;
  }, [clubsSorted, leagueFilter]);

  const clubsFiltered = useMemo(() => {
    let out = clubsSorted;
    if (starFilter != null) out = out.filter((c) => toHalfStep(c.star_rating) === starFilter);
    if (leagueFilter != null) out = out.filter((c) => leagueInfo(c).id === leagueFilter);
    return out;
  }, [clubsSorted, starFilter, leagueFilter]);

  const clubsForA = useMemo(
    () => ensureSelectedClubVisible(clubsFiltered, clubsSorted, aClub),
    [clubsFiltered, clubsSorted, aClub]
  );
  const clubsForB = useMemo(
    () => ensureSelectedClubVisible(clubsFiltered, clubsSorted, bClub),
    [clubsFiltered, clubsSorted, bClub]
  );

  const aParts = useMemo(() => clubLabelPartsById(clubs, aClub), [clubs, aClub]);
  const bParts = useMemo(() => clubLabelPartsById(clubs, bClub), [clubs, bClub]);

  const [starRoll, setStarRoll] = useState(false);
  const lastStarRollRef = useRef<number | null>(null);
  const starRollIntervalRef = useRef<number | null>(null);
  const starRollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (starRollIntervalRef.current) window.clearInterval(starRollIntervalRef.current);
      if (starRollTimeoutRef.current) window.clearTimeout(starRollTimeoutRef.current);
    };
  }, []);

  function rollStars() {
    if (disabled) return;
    if (starRollIntervalRef.current) window.clearInterval(starRollIntervalRef.current);
    if (starRollTimeoutRef.current) window.clearTimeout(starRollTimeoutRef.current);

    setStarRoll(true);
    starRollIntervalRef.current = window.setInterval(() => {
      setStarFilter(randomPickDifferent(STAR_OPTIONS, lastStarRollRef.current));
    }, 75);

    starRollTimeoutRef.current = window.setTimeout(() => {
      if (starRollIntervalRef.current) window.clearInterval(starRollIntervalRef.current);
      starRollIntervalRef.current = null;

      const v = randomPickDifferent(availableStarSteps, lastStarRollRef.current);
      lastStarRollRef.current = v;
      setStarFilter(v);
      setStarRoll(false);
    }, 700);
  }

  function randomizeClubs() {
    if (disabled) return;
    if (!clubsFiltered.length) return;

    const clubA = clubsFiltered[cryptoRandomInt(clubsFiltered.length)];
    const firstClubB = clubsFiltered[cryptoRandomInt(clubsFiltered.length)];
    if (!clubA || !firstClubB) return;
    let clubB = firstClubB;

    if (clubsFiltered.length > 1) {
      let guard = 0;
      while (!randomClubAssignmentOk(clubA, clubB) && guard < 50) {
        const candidate = clubsFiltered[cryptoRandomInt(clubsFiltered.length)];
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

  const body = (
    <div className="grid gap-4">
      {extraTop ? <div>{extraTop}</div> : null}

      <div className={"grid grid-cols-1 gap-3 " + (narrowLayout ? "" : "md:grid-cols-[auto_auto_1fr] md:items-end")}>
        <StarFilter
          value={starFilter}
          onChange={setStarFilter}
          disabled={disabled}
          compact={!narrowLayout}
          right={
            <button
              type="button"
              className="icon-button h-10 w-10 p-0 flex items-center justify-center"
              onMouseDown={(e) => e.preventDefault()}
              onTouchStart={(e) => e.preventDefault()}
              onClick={rollStars}
              disabled={disabled}
              title="Randomize star filter"
            >
              <DiceIcon spinning={starRoll} />
            </button>
          }
        />

        <LeagueFilter
          value={leagueFilter}
          onChange={setLeagueFilter}
          disabled={disabled}
          options={leagueOptions}
          compact={!narrowLayout}
        />

        <div className="flex md:justify-end">
          <Button
            variant="ghost"
            onClick={randomizeClubs}
            disabled={disabled}
            className="w-full whitespace-nowrap md:w-auto"
            title="Randomize clubs"
          >
            <i className="fa fa-rotate-left md:hidden" aria-hidden="true" />
            <span className="hidden md:inline">Random Club</span>
            <span className="md:hidden">Random</span>
          </Button>
        </div>
      </div>

      <div className={"grid grid-cols-1 gap-3 " + (narrowLayout ? "" : "md:grid-cols-2")}>
        <div className="space-y-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <div className="min-w-0">
              <ClubSelect
                label={aLabel}
                value={aClub}
                onChange={onChangeAClub}
                disabled={disabled}
                clubs={clubsForA}
                placeholder="Select club…"
              />
            </div>
            <ClubStarsEditor clubId={aClub} clubs={clubs} disabled={disabled} />
          </div>

          {showSelectedMeta && (
            <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-1">
              <div className="min-w-0 text-xs text-text-muted truncate">{aParts.league_name ?? "—"}</div>
              <div className="justify-self-end">
                <StarsFA rating={aParts.rating ?? 0} textClassName="text-text-muted" />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <div className="min-w-0">
              <ClubSelect
                label={bLabel}
                value={bClub}
                onChange={onChangeBClub}
                disabled={disabled}
                clubs={clubsForB}
                placeholder="Select club…"
              />
            </div>
            <ClubStarsEditor clubId={bClub} clubs={clubs} disabled={disabled} />
          </div>

          {showSelectedMeta && (
            <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-1">
              <div className="min-w-0 text-xs text-text-muted truncate">{bParts.league_name ?? "—"}</div>
              <div className="justify-self-end">
                <StarsFA rating={bParts.rating ?? 0} textClassName="text-text-muted" />
              </div>
            </div>
          )}
        </div>
      </div>

      {extraBottom ? <div>{extraBottom}</div> : null}
    </div>
  );

  if (!wrap) return body;

  return (
    <CollapsibleCard title="Select Clubs" defaultOpen={defaultOpen} className={wrapClassName ?? "panel-subtle"}>
      {body}
    </CollapsibleCard>
  );
}
