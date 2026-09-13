/**
 * The club controls of a match (T2) — everything that is *not* a club name.
 *
 * The clubs themselves are named once, in the scoreboard above, and tapping one
 * there opens the `ClubPicker` sheet (`DESIGN.md` §9b: the value is the trigger).
 * What is left here acts on *both* sides and therefore belongs to the match card,
 * not to a per-side sheet:
 *
 *   [⚙ Filter clubs ⌄]                      ← star/league filters, inline row
 *   [🎲]  [ Random matchup ................] ← the two random actions, one height
 *
 * State lives in `useClubSelection` (`clubControls.tsx`) because the trigger sits
 * in another component; a call site calls the hook once and passes the result to
 * the scoreboard (`onPickClub`) and to this panel.
 */
import { ChevronDown, Shuffle, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";

import { useAuth } from "../auth/AuthContext";

import Button from "./primitives/Button";
import { chipClass } from "./primitives/Chip";
import ClubStarsEditor from "./ClubStarsEditor";
import ClubPicker from "./ClubPicker";
import { LeagueFilter, StarFilter, starsLabel, type ClubSelection } from "./clubControls";
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

export default function SelectClubsPanel({
  selection,
  extraTop,
  extraBottom,
  className,
}: {
  selection: ClubSelection;
  extraTop?: React.ReactNode;
  extraBottom?: React.ReactNode;
  className?: string;
}) {
  const { role, token } = useAuth();
  const canEditStars = (role === "editor" || role === "admin") && !!token;

  const { clubs, disabled, filters } = selection;
  const [filtersOpen, setFiltersOpen] = useState(false);

  const leagueName = filters.leagueOptions.find((o) => o.id === filters.leagueFilter)?.name ?? "League";
  const activeClubId = selection.activeKey === "A" ? selection.aClub : selection.bClub;

  return (
    <div className={cn("space-y-3", className)}>
      {extraTop ? <div>{extraTop}</div> : null}

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

      {/* Not an `inset`: the two selects already are one (DESIGN.md §1 — a surface
          never nests inside a surface of the same level). */}
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
              {filters.active ? `${filters.filtered.length} of ${filters.sorted.length} clubs` : "All clubs"}
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

      {/* The two random actions: equal height, the dice square because it is the
          secondary one, "Random matchup" filling the rest (DESIGN.md §9b). Capped
          on desktop so the wide screen does not turn it into a banner. */}
      <div className="flex items-stretch gap-2 sm:max-w-md">
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
      />
    </div>
  );
}
