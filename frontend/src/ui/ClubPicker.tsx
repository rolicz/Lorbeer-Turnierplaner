/**
 * One club picker for the whole app (S10): a `Modal` sheet that opens from a club
 * slot on a match card, in the match-detail edit tab and in both friendly forms.
 *
 * The common path is one tap: the search field is focused on open, the clubs you
 * picked most recently sit on top, every row carries its crest and stars, and a
 * tap selects and closes. When the *other* side of the match has no club yet the
 * sheet stays open and switches to it, so setting both clubs is three taps.
 *
 * Replaces `ClubCombobox` + the two-step `SelectClubsPanel` dropdowns.
 */
import { Check, Search, ShieldHalf, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Club } from "../api/types";

import ClubBadge from "./ClubBadge";
import NationFlag from "./NationFlag";
import { Chip } from "./primitives/Chip";
import Modal from "./primitives/Modal";
import { Stars } from "./primitives/Stars";
import {
  LeagueFilter,
  StarFilter,
  clubLabelPartsById,
  ensureSelectedClubVisible,
  leagueInfo,
  readRecentClubIds,
  rememberRecentClubId,
  type ClubFilters,
} from "./clubControls";
import { cn } from "./cn";
import { nationalTeamNation } from "./nationalTeams";

export type ClubPickerSide = {
  key: "A" | "B";
  /** The side's players, e.g. "Roli" or "Flo/Berni" — what the user recognises. */
  label: string;
  clubId: number | null;
};

/**
 * The tappable club slot on a match card: side label, crest + club name, flag +
 * league. Stars sit next to it in `SelectClubsPanel` (or are the editor's
 * `ClubStarsEditor` control), so the slot itself stays one flat button.
 */
export function ClubSlot({
  label,
  clubs,
  clubId,
  onOpen,
  disabled = false,
  className,
}: {
  label: string;
  clubs: Club[];
  clubId: number | null;
  onOpen: () => void;
  disabled?: boolean;
  className?: string;
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
      className={cn(
        "focus-ring inset w-full px-3 py-2 text-left transition hover:bg-bg-card-chip/70 disabled:opacity-60",
        className,
      )}
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
          <ShieldHalf size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
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
      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
        {known && parts.league_name ? (
          <>
            <NationFlag nation={parts.league_nation} />
            <span className="min-w-0 truncate">{parts.league_name}</span>
          </>
        ) : (
          <span className="truncate">{known ? "—" : "Tap to choose"}</span>
        )}
      </span>
    </button>
  );
}

/** One club row in the sheet. */
function ClubRow({
  club,
  selected,
  showLeague,
  onPick,
}: {
  club: Club;
  selected: boolean;
  showLeague: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-card-chip/40",
        selected && "bg-accent/10",
      )}
    >
      <ClubBadge
        name={club.name}
        nation={nationalTeamNation(club.name, club.league_name)}
        clubId={club.id}
        crestVersion={club.crest_updated_at}
      />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm", selected ? "text-accent" : "text-text-normal")}>
          {club.name}
        </span>
        {showLeague && club.league_name ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
            <NationFlag nation={club.league_nation} />
            <span className="min-w-0 truncate">{club.league_name}</span>
          </span>
        ) : null}
      </span>
      <Stars rating={Number(club.star_rating) || 0} textClassName="text-text-muted" />
      {selected ? <Check size={16} className="shrink-0 text-accent" aria-hidden="true" /> : null}
    </button>
  );
}

export default function ClubPicker({
  open,
  onClose,
  clubs,
  sides,
  activeKey,
  onActiveKeyChange,
  onPick,
  filters,
  disabled = false,
}: {
  open: boolean;
  onClose: () => void;
  /** The full club list (unfiltered) — the sheet applies `filters` itself. */
  clubs: Club[];
  sides: ClubPickerSide[];
  activeKey: "A" | "B";
  onActiveKeyChange: (key: "A" | "B") => void;
  /** Called with the picked club (or `null` for "No club"); the caller closes or advances. */
  onPick: (key: "A" | "B", clubId: number | null) => void;
  filters: ClubFilters;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = sides.find((s) => s.key === activeKey) ?? sides[0] ?? null;
  const activeClubId = active?.clubId ?? null;

  // Fresh search + recents every time the sheet opens, and again when it moves to
  // the other side — the club you searched for is not the one you want next.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setQuery("");
    setRecentIds(readRecentClubIds());
    /* eslint-enable react-hooks/set-state-in-effect */
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open, activeKey]);

  const q = query.trim().toLowerCase();

  // `filters.filtered` is the star/league-narrowed list; the selected club stays
  // visible even when the filters exclude it (same rule as the old combobox).
  const pool = useMemo(
    () => ensureSelectedClubVisible(filters.filtered, clubs, activeClubId),
    [filters.filtered, clubs, activeClubId],
  );

  const matches = useMemo(() => {
    if (!q) return pool;
    return pool.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.league_name ?? "").toLowerCase().includes(q),
    );
  }, [pool, q]);

  const recent = useMemo(() => {
    if (q) return [];
    const byId = new Map(pool.map((c) => [c.id, c]));
    return recentIds.map((id) => byId.get(id)).filter((c): c is Club => !!c);
  }, [pool, q, recentIds]);

  // Browsing (no query) groups by league — best league first, so the strongest
  // clubs still lead the list; searching drops the grouping and stays flat.
  const groups = useMemo(() => {
    if (q) return null;
    const byLeague = new Map<string, { name: string; clubs: Club[]; top: number }>();
    for (const c of matches) {
      const li = leagueInfo(c);
      const key = li.id == null ? "none" : String(li.id);
      const entry = byLeague.get(key) ?? { name: li.name ?? "Other", clubs: [], top: 0 };
      entry.clubs.push(c);
      entry.top = Math.max(entry.top, Number(c.star_rating) || 0);
      byLeague.set(key, entry);
    }
    return Array.from(byLeague.values()).sort((a, b) => b.top - a.top || a.name.localeCompare(b.name));
  }, [matches, q]);

  const pick = (clubId: number | null) => {
    if (disabled) return;
    if (clubId != null) {
      rememberRecentClubId(clubId);
      setRecentIds(readRecentClubIds());
    }
    onPick(activeKey, clubId);
  };

  if (!active) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Select club"
      subtitle={`${active.label} · ${matches.length} club${matches.length === 1 ? "" : "s"}`}
      fullScreenOnMobile
      maxWidth="max-w-md"
      scrollBody
      className="max-h-[84vh] overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {sides.length > 1 ? (
          <div role="group" aria-label="Match side" className="flex gap-1.5">
            {sides.map((s) => (
              <Chip
                key={s.key}
                selected={s.key === activeKey}
                onClick={() => onActiveKeyChange(s.key)}
                className="min-w-0 flex-1 truncate"
                title={`Pick the club for ${s.label}`}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        ) : null}

        <div className="inset flex shrink-0 items-center gap-2 px-3 py-2">
          <Search size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clubs…"
            aria-label="Search clubs"
            className="w-full bg-transparent text-sm text-text-normal outline-none placeholder:text-text-muted"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="shrink-0 text-text-muted transition hover:text-text-normal"
            >
              <X size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2">
          <StarFilter
            value={filters.starFilter}
            onChange={filters.setStarFilter}
            disabled={disabled}
            hideLabel
          />
          <LeagueFilter
            value={filters.leagueFilter}
            onChange={filters.setLeagueFilter}
            disabled={disabled}
            options={filters.leagueOptions}
            hideLabel
          />
        </div>

        <div role="listbox" aria-label="Clubs" className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {activeClubId != null ? (
            <button
              type="button"
              onClick={() => pick(null)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-bg-card-chip/40"
            >
              <X size={16} className="shrink-0" aria-hidden="true" />
              No club
            </button>
          ) : null}

          {recent.length ? (
            <>
              <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Recent
              </div>
              {recent.map((c) => (
                <ClubRow
                  key={`r-${c.id}`}
                  club={c}
                  selected={c.id === activeClubId}
                  showLeague
                  onPick={() => pick(c.id)}
                />
              ))}
            </>
          ) : null}

          {matches.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-text-muted">No clubs found</div>
          ) : groups ? (
            groups.map((g) => (
              <div key={g.name}>
                <div className="sticky top-0 z-10 bg-bg-card-outer px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {g.name}
                </div>
                {g.clubs.map((c) => (
                  <ClubRow
                    key={c.id}
                    club={c}
                    selected={c.id === activeClubId}
                    showLeague={false}
                    onPick={() => pick(c.id)}
                  />
                ))}
              </div>
            ))
          ) : (
            matches.map((c) => (
              <ClubRow key={c.id} club={c} selected={c.id === activeClubId} showLeague onPick={() => pick(c.id)} />
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
