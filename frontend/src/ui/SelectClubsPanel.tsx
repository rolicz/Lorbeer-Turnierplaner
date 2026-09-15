/**
 * The club selection of a match — **one self-contained panel** (T9).
 *
 * Collapsed it is a single row that names the job and its current values; open it
 * is one bounded block that holds *everything* the job needs, in the order the job
 * is done (`DESIGN.md` §9b, "a group of secondary editing controls may hide behind
 * one disclosure"):
 *
 *   [🛡 Clubs · Bayern München · FC Barcelona                    ⌄]  ← the one trigger
 *   ├──────────────────────────────────────────────────────────────
 *   │ [ Roli            ] [ Berni            ]   ← the two club slots → ClubPicker
 *   │ [⚙ Filter clubs] [4.5★ ✕] [Bundesliga ✕]  ← narrows both slots *and* the pool
 *   │ [🎲] [ Random matchup ...................] ← draw from the pool
 *
 * The values live **inside** the panel, so the scoreboard above it is read-only
 * again (T2 had it the other way round: tools on the card, values in the
 * scoreboard — the one shape §9b calls worse than no panel). The club names
 * therefore appear twice while the panel is open, which is the accepted cost.
 *
 * The container is a `card` because everything inside it is a level-2 control
 * (the slots, the two `FilterSelect`s): card → inset is the canon, inset → inset
 * is not. Open/closed is remembered per surface (`storageKey`).
 */
import { ChevronDown, ShieldHalf, Shuffle, SlidersHorizontal, X } from "lucide-react";
import { useId, useState } from "react";

import type { Club } from "../api/types";

import Button from "./primitives/Button";
import { chipClass } from "./primitives/Chip";
import ClubBadge from "./ClubBadge";
import ClubStarHistory from "./ClubStarHistory";
import ClubStarsEditor from "./ClubStarsEditor";
import ClubPicker from "./ClubPicker";
import NationFlag from "./NationFlag";
import { Stars } from "./primitives/Stars";
import {
  clubLabelPartsById,
  LeagueFilter,
  StarFilter,
  starsLabel,
  useClubPanelOpen,
  type ClubSelection,
} from "./clubControls";
import { useAuth } from "../auth/AuthContext";
import { cn } from "./cn";

function DiceIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={"h-5 w-5 " + (spinning ? "dice-roll" : "")}
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

/**
 * One side's club, inside the panel: the side's players on top, then the club
 * with its crest, league and stars. Tapping it opens the `ClubPicker` sheet for
 * that side — this is where a club is picked now, not in the scoreboard (T9).
 */
function ClubSlot({
  label,
  clubs,
  clubId,
  onOpen,
  disabled = false,
}: {
  label: string;
  clubs: Club[];
  clubId: number | null;
  onOpen: () => void;
  disabled?: boolean;
}) {
  const parts = clubLabelPartsById(clubs, clubId);
  const known = clubs.some((c) => c.id === clubId);

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      aria-label={`${label} — ${known ? parts.name : "select club"}`}
      title={known ? `${label} — ${parts.name}` : `${label} — select club`}
      className="focus-ring inset flex h-full w-full flex-col px-3 py-2 text-left transition hover:bg-bg-card-chip/70 disabled:opacity-60"
    >
      <span className="block truncate text-xs text-text-muted">{label}</span>

      <span className="mt-0.5 flex items-start gap-1.5">
        {known ? (
          <ClubBadge
            name={parts.name}
            nation={parts.national_nation}
            clubId={parts.id}
            crestVersion={parts.crest_updated_at}
          />
        ) : (
          <ShieldHalf size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
        )}
        <span
          className={cn(
            // The club name is the identity of the slot — it wraps instead of
            // truncating, and both slots stretch to the taller one.
            "min-w-0 whitespace-normal break-words text-sm leading-tight",
            known ? "font-medium text-text-normal" : "text-text-muted",
          )}
        >
          {known ? parts.name : "Select club"}
        </span>
      </span>

      <span className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
        {known && parts.league_name ? (
          <>
            <NationFlag nation={parts.league_nation} />
            <span className="min-w-0 truncate">{parts.league_name}</span>
          </>
        ) : (
          <span className="truncate">{known ? "—" : "Tap to choose"}</span>
        )}
      </span>

      {known ? (
        <span className="mt-auto flex items-center pt-1">
          <Stars rating={parts.rating ?? 0} textClassName="text-text-muted" />
        </span>
      ) : null}
    </button>
  );
}

export default function SelectClubsPanel({
  selection,
  storageKey,
  defaultOpen = false,
  extraTop,
  extraBottom,
  className,
}: {
  selection: ClubSelection;
  /** Remembers open/closed for this surface (localStorage, like `match_list_view`). */
  storageKey?: string;
  /** Where setting clubs is the point of the form (the friendlies), start open. */
  defaultOpen?: boolean;
  extraTop?: React.ReactNode;
  extraBottom?: React.ReactNode;
  className?: string;
}) {
  const { role, token } = useAuth();
  const canEditStars = (role === "editor" || role === "admin") && !!token;

  const { clubs, disabled, filters } = selection;
  const [open, setOpen] = useClubPanelOpen(storageKey, defaultOpen);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const bodyId = useId();

  const leagueName = filters.leagueOptions.find((o) => o.id === filters.leagueFilter)?.name ?? "League";
  const activeClubId = selection.activeKey === "A" ? selection.aClub : selection.bClub;

  const aKnown = clubs.some((c) => c.id === selection.aClub);
  const bKnown = clubs.some((c) => c.id === selection.bClub);
  const aName = aKnown ? clubLabelPartsById(clubs, selection.aClub).name : "not set";
  const bName = bKnown ? clubLabelPartsById(clubs, selection.bClub).name : "not set";
  const summary = aKnown || bKnown ? `${aName} · ${bName}` : "Not set";

  return (
    <section className={cn("card overflow-hidden p-0", className)}>
      {/* The one way in: it names the job and shows the two values it holds. */}
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (!next) selection.closePicker();
        }}
        aria-expanded={open}
        aria-controls={bodyId}
        title={open ? "Hide the club selection" : "Select the clubs of this match"}
        className="focus-ring flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-bg-card-chip/25"
      >
        <ShieldHalf size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text-normal">Clubs</span>
          <span className="mt-0.5 block truncate text-xs text-text-muted">{summary}</span>
        </span>
        <ChevronDown
          size={18}
          className={cn("shrink-0 text-text-muted transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div id={bodyId} className="border-t border-border-card-outer/55 p-3">
          {/* The job in one readable column: a 1280px card must not stretch two club
              slots across the screen (DESIGN.md §1.7). */}
          <div className="space-y-3 sm:max-w-md">
            {extraTop ? <div>{extraTop}</div> : null}

            {/* 1. the values: one slot per side, side by side like the scoreboard. */}
            <div className="grid grid-cols-2 items-stretch gap-2">
              <ClubSlot
                label={selection.aLabel}
                clubs={clubs}
                clubId={selection.aClub}
                disabled={disabled}
                onOpen={() => selection.openPicker("A")}
              />
              <ClubSlot
                label={selection.bLabel}
                clubs={clubs}
                clubId={selection.bClub}
                disabled={disabled}
                onOpen={() => selection.openPicker("B")}
              />
            </div>

            {/* 2. the filters: they narrow both slots' lists *and* the random pool. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                disabled={disabled}
                aria-expanded={filtersOpen}
                aria-controls="club-filters"
                title="Narrow the club list and the random matchup"
                className={chipClass(filters.active, "inline-flex items-center gap-1.5")}
              >
                <SlidersHorizontal size={14} aria-hidden="true" />
                Filter clubs
                <ChevronDown
                  size={14}
                  className={cn("transition-transform", filtersOpen && "rotate-180")}
                  aria-hidden="true"
                />
              </button>

              {/* While the row is open the two selects say what is on; closed, these chips do. */}
              {!filtersOpen && filters.starFilter != null ? (
                <button
                  type="button"
                  onClick={() => filters.setStarFilter(null)}
                  className={chipClass(true, "inline-flex items-center gap-1")}
                  aria-label="Clear the star filter"
                  title="Clear the star filter"
                >
                  {starsLabel(filters.starFilter)}★
                  <X size={12} aria-hidden="true" />
                </button>
              ) : null}
              {!filtersOpen && filters.leagueFilter != null ? (
                <button
                  type="button"
                  onClick={() => filters.setLeagueFilter(null)}
                  className={chipClass(true, "inline-flex max-w-[60%] items-center gap-1")}
                  aria-label="Clear the league filter"
                  title="Clear the league filter"
                >
                  <span className="min-w-0 truncate">{leagueName}</span>
                  <X size={12} className="shrink-0" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            {filtersOpen ? (
              <div id="club-filters" className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <StarFilter
                    value={filters.starFilter}
                    onChange={filters.setStarFilter}
                    disabled={disabled}
                  />
                  <LeagueFilter
                    value={filters.leagueFilter}
                    onChange={filters.setLeagueFilter}
                    disabled={disabled}
                    options={filters.leagueOptions}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs text-text-muted">
                    {filters.active
                      ? `${filters.filtered.length} of ${filters.sorted.length} clubs`
                      : "All clubs"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={filters.clear}
                    disabled={disabled || !filters.active}
                  >
                    Clear filters
                  </Button>
                </div>
              </div>
            ) : null}

            {/* 3. the two random actions: equal height, the dice square because it is
                the secondary one, "Random matchup" filling the rest (DESIGN.md §9b). */}
            <div className="flex items-stretch gap-2">
              <Button
                type="button"
                variant="ghost"
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                onClick={filters.rollStars}
                disabled={disabled}
                title="Randomize the star filter"
                aria-label="Randomize the star filter"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
              >
                <DiceIcon spinning={filters.rolling} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={selection.randomize}
                disabled={disabled}
                className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap"
                title="Pick a random matchup (respects the club filters)"
              >
                <Shuffle size={16} aria-hidden="true" />
                Random matchup
              </Button>
            </div>

            {extraBottom ? <div>{extraBottom}</div> : null}
          </div>
        </div>
      ) : null}

      <ClubPicker
        open={selection.pickerOpen}
        onClose={selection.closePicker}
        clubs={clubs}
        sides={[
          { key: "A", label: selection.aLabel, clubId: selection.aClub },
          { key: "B", label: selection.bLabel, clubId: selection.bClub },
        ]}
        activeKey={selection.activeKey}
        onActiveKeyChange={selection.setActiveKey}
        onPick={selection.pick}
        filters={filters}
        disabled={disabled}
        starsEditor={
          canEditStars ? (
            <ClubStarsEditor clubId={activeClubId} clubs={clubs} disabled={disabled} />
          ) : null
        }
        starsHistory={canEditStars && activeClubId != null ? <ClubStarHistory clubId={activeClubId} /> : null}
      />
    </section>
  );
}
