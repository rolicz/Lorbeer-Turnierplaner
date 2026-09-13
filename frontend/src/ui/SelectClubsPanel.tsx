/**
 * Club selection for both sides of a match (S10).
 *
 * Two always-visible club slots — no collapse, no dropdown step. Tapping a slot
 * opens the shared `ClubPicker` sheet (search focused, recents first, one tap
 * selects); when the other side is still empty the sheet switches to it instead
 * of closing, so both clubs are three taps. The star/league filters live in the
 * sheet and are shared with *Random matchup* and the dice, which stay out here
 * because they act on both sides at once.
 */
import { Shuffle, X } from "lucide-react";
import { useState } from "react";

import type { Club } from "../api/types";
import { useAuth } from "../auth/AuthContext";

import Button from "./primitives/Button";
import { chipClass } from "./primitives/Chip";
import { Stars } from "./primitives/Stars";
import ClubStarsEditor from "./ClubStarsEditor";
import ClubPicker, { ClubSlot } from "./ClubPicker";
import {
  clubLabelPartsById,
  cryptoRandomInt,
  randomClubAssignmentOk,
  starsLabel,
  useClubFilters,
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
  extraTop,
  extraBottom,
  className,
}: {
  clubs: Club[];
  disabled: boolean;
  /** The side's players, e.g. "Roli" or "Flo/Berni". */
  aLabel: string;
  bLabel: string;
  aClub: number | null;
  bClub: number | null;
  onChangeAClub: (v: number | null) => void;
  onChangeBClub: (v: number | null) => void;
  /** Preferred for the random matchup, so a call site can save both sides in one write. */
  onChangeClubs?: (a: number, b: number) => void;
  extraTop?: React.ReactNode;
  extraBottom?: React.ReactNode;
  className?: string;
}) {
  const { role, token } = useAuth();
  const canEditStars = (role === "editor" || role === "admin") && !!token;

  const filters = useClubFilters(clubs);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<"A" | "B">("A");

  const aParts = clubLabelPartsById(clubs, aClub);
  const bParts = clubLabelPartsById(clubs, bClub);

  function openPicker(key: "A" | "B") {
    if (disabled) return;
    setActiveKey(key);
    setPickerOpen(true);
  }

  function handlePick(key: "A" | "B", clubId: number | null) {
    if (key === "A") onChangeAClub(clubId);
    else onChangeBClub(clubId);

    // Setting one side while the other is still empty keeps the sheet open and
    // moves to that side — picking both clubs stays a single visit.
    const otherEmpty = key === "A" ? bClub == null : aClub == null;
    if (clubId != null && otherEmpty) {
      setActiveKey(key === "A" ? "B" : "A");
      return;
    }
    setPickerOpen(false);
  }

  function randomizeClubs() {
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

  const sideMeta = (clubId: number | null, parts: ReturnType<typeof clubLabelPartsById>) =>
    canEditStars ? (
      <ClubStarsEditor clubId={clubId} clubs={clubs} disabled={disabled} />
    ) : clubId != null ? (
      <Stars rating={parts.rating ?? 0} textClassName="text-text-muted" />
    ) : null;

  return (
    <div className={className ? `space-y-3 ${className}` : "space-y-3"}>
      {extraTop ? <div>{extraTop}</div> : null}

      <div className="grid grid-cols-2 items-stretch gap-2">
        <div className="flex flex-col gap-1.5">
          <ClubSlot
            label={aLabel}
            clubs={clubs}
            clubId={aClub}
            disabled={disabled}
            onOpen={() => openPicker("A")}
            className="flex-1"
          />
          <div className="flex min-h-[1.25rem] items-center justify-end px-1">{sideMeta(aClub, aParts)}</div>
        </div>
        <div className="flex flex-col gap-1.5">
          <ClubSlot
            label={bLabel}
            clubs={clubs}
            clubId={bClub}
            disabled={disabled}
            onOpen={() => openPicker("B")}
            className="flex-1"
          />
          <div className="flex min-h-[1.25rem] items-center justify-end px-1">{sideMeta(bClub, bParts)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onClick={filters.rollStars}
          disabled={disabled}
          title="Randomize the star filter"
          aria-label="Randomize the star filter"
          className="flex h-10 w-10 shrink-0 items-center justify-center p-0"
        >
          <DiceIcon spinning={filters.rolling} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={randomizeClubs}
          disabled={disabled}
          className="min-w-0 flex-1 whitespace-nowrap"
          title="Pick a random matchup (respects the club filters)"
        >
          <Shuffle size={14} className="mr-2 inline-block align-[-2px]" aria-hidden="true" />
          Random matchup
        </Button>
      </div>

      {filters.active ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-text-muted">Club list filtered:</span>
          {filters.starFilter != null ? (
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
          {filters.leagueFilter != null ? (
            <button
              type="button"
              onClick={() => filters.setLeagueFilter(null)}
              className={chipClass(true, "inline-flex max-w-[60%] items-center gap-1")}
              aria-label="Clear the league filter"
              title="Clear the league filter"
            >
              <span className="min-w-0 truncate">
                {filters.leagueOptions.find((o) => o.id === filters.leagueFilter)?.name ?? "League"}
              </span>
              <X size={12} className="shrink-0" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}

      {extraBottom ? <div>{extraBottom}</div> : null}

      <ClubPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        clubs={clubs}
        sides={[
          { key: "A", label: aLabel, clubId: aClub },
          { key: "B", label: bLabel, clubId: bClub },
        ]}
        activeKey={activeKey}
        onActiveKeyChange={setActiveKey}
        onPick={handlePick}
        filters={filters}
        disabled={disabled}
      />
    </div>
  );
}
