/**
 * One club picker for the whole app (S10): a `Modal` sheet opened by tapping a
 * club in the scoreboard — on the live match, in the match-detail edit tab and in
 * both friendly forms.
 *
 * The common path is one tap: the search field is focused on open, the clubs you
 * picked most recently sit on top, every row carries its crest and stars, and a
 * tap selects and closes. When the *other* side of the match has no club yet the
 * sheet stays open and switches to it, so setting both clubs is three taps.
 *
 * T2 moved the star/league **filters** out to the match card (they narrow the
 * list for both sides and drive Random matchup) — the sheet only *reports* them —
 * and moved the **stars editor** in here, into the row of the selected club,
 * where a rating is a property of the club being chosen.
 */
import { Check, Filter, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { Club } from "../api/types";

import ClubBadge from "./ClubBadge";
import NationFlag from "./NationFlag";
import { Chip } from "./primitives/Chip";
import EmptyState from "./primitives/EmptyState";
import Modal from "./primitives/Modal";
import { Stars } from "./primitives/Stars";
import {
  ensureSelectedClubVisible,
  leagueInfo,
  readRecentClubIds,
  rememberRecentClubId,
  starsLabel,
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

/** One club row in the sheet. */
function ClubRow({
  club,
  selected,
  active,
  showLeague,
  onPick,
  onHover,
  trailing,
}: {
  club: Club;
  selected: boolean;
  active: boolean;
  showLeague: boolean;
  onPick: () => void;
  onHover: () => void;
  /** Replaces the static stars — the selected row gets the editable control. */
  trailing?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 px-3 transition-colors",
        active ? "bg-bg-card-chip/60" : "hover:bg-bg-card-chip/40",
        selected && "bg-accent/10",
      )}
    >
      <button
        type="button"
        role="option"
        aria-selected={selected}
        data-active={active ? "true" : undefined}
        onMouseEnter={onHover}
        onClick={onPick}
        className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
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
      </button>
      {trailing ?? <Stars rating={Number(club.star_rating) || 0} textClassName="text-text-muted" />}
      {selected ? <Check size={16} className="shrink-0 text-accent" aria-hidden="true" /> : null}
    </div>
  );
}

/** A group heading inside the sheet's card. Sentence case: uppercase belongs to
 *  `section-label` and to column headers, never to a label inside a card (§6). */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-2 text-sm font-semibold text-text-normal">
      {children}
    </div>
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
  starsEditor,
  starsHistory,
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
  /** `ClubStarsEditor` for the selected club (editors/admins); readers pass nothing. */
  starsEditor?: ReactNode;
  /** The selected club's star history (R4) — a block under its row, not in it. */
  starsHistory?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState<number[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const active = sides.find((s) => s.key === activeKey) ?? sides[0] ?? null;
  const activeClubId = active?.clubId ?? null;

  // Fresh search + recents every time the sheet opens, and again when it moves to
  // the other side — the club you searched for is not the one you want next.
  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setQuery("");
    setActiveIdx(0);
    setRecentIds(readRecentClubIds());
    /* eslint-enable react-hooks/set-state-in-effect */
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open, activeKey]);

  const q = query.trim().toLowerCase();

  // `filters.filtered` is the star/league-narrowed list (set on the match card);
  // the selected club stays reachable even when the filters exclude it.
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

  // While browsing, the club this side already has sits on top with its stars
  // editor instead of being buried in its league group (it is listed once).
  const pinned = useMemo(() => {
    if (q || activeClubId == null) return null;
    return pool.find((c) => c.id === activeClubId) ?? null;
  }, [pool, q, activeClubId]);

  const browse = useMemo(
    () => (pinned ? matches.filter((c) => c.id !== pinned.id) : matches),
    [matches, pinned],
  );

  const recent = useMemo(() => {
    if (q) return [];
    const byId = new Map(browse.map((c) => [c.id, c]));
    return recentIds.map((id) => byId.get(id)).filter((c): c is Club => !!c);
  }, [browse, q, recentIds]);

  // Browsing (no query) groups by league — best league first, so the strongest
  // clubs still lead the list; searching drops the grouping and stays flat.
  const groups = useMemo(() => {
    if (q) return null;
    const byLeague = new Map<string, { name: string; clubs: Club[]; top: number }>();
    for (const c of browse) {
      const li = leagueInfo(c);
      const key = li.id == null ? "none" : String(li.id);
      const entry = byLeague.get(key) ?? { name: li.name ?? "Other", clubs: [], top: 0 };
      entry.clubs.push(c);
      entry.top = Math.max(entry.top, Number(c.star_rating) || 0);
      byLeague.set(key, entry);
    }
    return Array.from(byLeague.values()).sort((a, b) => b.top - a.top || a.name.localeCompare(b.name));
  }, [browse, q]);

  // Keyboard order over exactly what is rendered (the selected club, recents,
  // then the groups or the flat search result) — the combobox this replaced had
  // ArrowUp/ArrowDown/Enter and they must keep working on a desktop.
  const { flat, headLen, indexById } = useMemo(() => {
    const head = pinned ? [pinned] : [];
    const tail = groups ? groups.flatMap((g) => g.clubs) : browse;
    const byId = new Map<number, number>();
    tail.forEach((c, i) => byId.set(c.id, head.length + recent.length + i));
    return { flat: [...head, ...recent, ...tail], headLen: head.length, indexById: byId };
  }, [pinned, recent, groups, browse]);
  const activeClamped = Math.min(activeIdx, Math.max(0, flat.length - 1));

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[activeClamped]?.scrollIntoView({
      block: "nearest",
    });
  }, [activeClamped, open]);

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(Math.min(activeClamped + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(Math.max(activeClamped - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = flat[activeClamped];
      if (c) pick(c.id);
    }
  };

  const pick = (clubId: number | null) => {
    if (disabled) return;
    if (clubId != null) {
      rememberRecentClubId(clubId);
      setRecentIds(readRecentClubIds());
    }
    onPick(activeKey, clubId);
  };

  if (!active) return null;

  const leagueName = filters.leagueOptions.find((o) => o.id === filters.leagueFilter)?.name ?? "League";

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
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder="Search clubs…"
            aria-label="Search clubs"
            className="w-full bg-transparent text-sm text-text-normal outline-none"
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

        {/* The filters live on the match card now (they drive Random matchup too);
            the sheet only says why the list is short. */}
        {filters.active ? (
          <div
            data-club-filter-note
            className="flex shrink-0 items-center gap-1.5 px-1 text-xs text-text-muted"
          >
            <Filter size={12} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">
              Filtered by{filters.starFilter != null ? ` ${starsLabel(filters.starFilter)}★` : ""}
              {filters.starFilter != null && filters.leagueFilter != null ? " ·" : ""}
              {filters.leagueFilter != null ? ` ${leagueName}` : ""}
            </span>
          </div>
        ) : null}

        <div
          ref={listRef}
          role="listbox"
          aria-label="Clubs"
          className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {pinned ? (
            <>
              <GroupLabel>Selected</GroupLabel>
              <ClubRow
                club={pinned}
                selected
                active={activeClamped === 0}
                showLeague
                onHover={() => setActiveIdx(0)}
                onPick={() => pick(pinned.id)}
                trailing={starsEditor ?? undefined}
              />
              {starsHistory ? <div className="inset mx-1 mb-1 mt-1">{starsHistory}</div> : null}
            </>
          ) : null}

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
              <GroupLabel>Recent</GroupLabel>
              {recent.map((c, i) => (
                <ClubRow
                  key={`r-${c.id}`}
                  club={c}
                  selected={c.id === activeClubId}
                  active={headLen + i === activeClamped}
                  showLeague
                  onHover={() => setActiveIdx(headLen + i)}
                  onPick={() => pick(c.id)}
                />
              ))}
            </>
          ) : null}

          {matches.length === 0 ? (
            <EmptyState title="No clubs found" className="px-3 py-8" />
          ) : groups ? (
            groups.map((g) => (
              <div key={g.name}>
                <div className="sticky top-0 z-10 bg-bg-card-outer px-3 pb-1 pt-2 text-sm font-semibold text-text-normal">
                  {g.name}
                </div>
                {g.clubs.map((c) => {
                  const i = indexById.get(c.id) ?? -1;
                  return (
                    <ClubRow
                      key={c.id}
                      club={c}
                      selected={c.id === activeClubId}
                      active={i === activeClamped}
                      showLeague={false}
                      onHover={() => setActiveIdx(i)}
                      onPick={() => pick(c.id)}
                    />
                  );
                })}
              </div>
            ))
          ) : (
            browse.map((c) => {
              const i = indexById.get(c.id) ?? -1;
              const isSelected = c.id === activeClubId;
              return (
                <ClubRow
                  key={c.id}
                  club={c}
                  selected={isSelected}
                  active={i === activeClamped}
                  showLeague
                  onHover={() => setActiveIdx(i)}
                  onPick={() => pick(c.id)}
                  trailing={isSelected ? starsEditor ?? undefined : undefined}
                />
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
