/**
 * Player tab — radar, key-number tiles and match history for one player.
 *
 * Every block is a `StatsSection` (DESIGN.md §6 "Stats sub-view skeleton"), like every
 * other stats sub-view: the blocks used to be `card`s with their own `<h2>`, which made
 * this the one section of the stats page written in a different header language — and
 * a different one again from the profile's Stats tab, which shows the same three blocks
 * (A8). The identity block above them stays a `card`, exactly as the matchup's header is.
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import EmptyState from "../../ui/primitives/EmptyState";
import InlineLoading from "../../ui/primitives/InlineLoading";
import StatTile from "../../ui/primitives/StatTile";
import { getStatsPlayerMatches, getStatsStreaks } from "../../api/stats.api";
import { listClubs } from "../../api/clubs.api";
import { qk } from "../../api/queryKeys";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { useCupHolders } from "../../hooks/useCupHolders";
import { usePlayerColors } from "./usePlayerColors";
import { Sparkline, Radar } from "./charts";
import { ChipGroup, chipClass } from "../../ui/primitives/Chip";
import { PlayerPicker } from "./PlayerPicker";
import StatsSection from "./StatsSection";
import { MatchHistoryList, tournamentMatchHref } from "./MatchHistoryList";
import PlayerStreakChips from "./PlayerStreakChips";
import { StarsSection } from "./StarsView";
import { fmtRating } from "../../utils/format";
import type { Row } from "./standings";
import type { StatsMode } from "./statsMode";
import type { StatsScope } from "../../api/types";

export default function PlayerProfile({ mode, scope, rows, selectedId, onSelect }: { mode: StatsMode; scope: StatsScope; rows: Row[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const { cupsHeldByPlayerId } = useCupHolders();
  const { colorOf } = usePlayerColors();
  const row = rows.find((r) => r.id === selectedId) ?? null;

  // Field maxes → normalise each axis to 0..1, so any player's radar is comparable.
  const fieldMax = useMemo(() => ({
    gfpm: Math.max(0.01, ...rows.map((r) => (r.played ? r.gf / r.played : 0))),
    gapm: Math.max(0.01, ...rows.map((r) => (r.played ? r.ga / r.played : 0))),
    played: Math.max(1, ...rows.map((r) => r.played)),
  }), [rows]);
  const axesFor = useCallback((r: Row) => [
    { label: "Attack", value: (r.played ? r.gf / r.played : 0) / fieldMax.gfpm },
    { label: "Defense", value: 1 - (r.played ? r.ga / r.played : 0) / fieldMax.gapm },
    { label: "Win %", value: r.played ? r.wins / r.played : 0 },
    { label: "Form", value: r.formAvg / 3 },
    { label: "Activity", value: r.played / fieldMax.played },
  ], [fieldMax]);

  // Overlay other players' radars (each in its consistent colour).
  const [overlayIds, setOverlayIds] = useState<Set<number>>(new Set());
  const radarSeries = useMemo(() => {
    if (!row) return [];
    const ids = [row.id, ...rows.filter((r) => r.id !== row.id && overlayIds.has(r.id)).map((r) => r.id)];
    return ids
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is Row => !!r)
      .map((r) => ({ name: r.name, color: colorOf(r.id).solid, axes: axesFor(r) }));
  }, [row, rows, overlayIds, axesFor, colorOf]);

  const matchesQ = useQuery({
    queryKey: qk.stats.playerMatches(selectedId ?? 0, scope),
    queryFn: () => getStatsPlayerMatches({ playerId: selectedId as number, scope }),
    enabled: selectedId != null,
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const clubsQ = useQuery({ queryKey: qk.clubs(), queryFn: () => listClubs(), staleTime: 60_000 });
  const tournaments = useMemo(() => (matchesQ.data?.tournaments ?? []).filter((t) => mode === "overall" || t.mode === mode), [matchesQ.data, mode]);
  // Streak chips: this player's runs plus the field-wide records (for the "record
  // right now" highlight) — same pair of requests the profile Stats tab makes.
  const streaksQ = useQuery({
    queryKey: qk.stats.streaks(mode, `player-${selectedId ?? 0}`, scope),
    queryFn: () => getStatsStreaks({ mode, playerId: selectedId as number, scope, limit: 3 }),
    enabled: selectedId != null,
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const streaksGlobalQ = useQuery({
    queryKey: qk.stats.streaks(mode, 1, scope),
    queryFn: () => getStatsStreaks({ mode, scope, limit: 1 }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  // Match history density (Compact hides the per-match meta line), like the matchup view.
  const [details, setDetails] = useState(false);
  const nav = useNavigate();

  return (
    <div className="space-y-4">
      <PlayerPicker players={rows.map((r) => ({ id: r.id, name: r.name }))} selectedId={selectedId} onSelect={onSelect} />

      {!row ? <EmptyState title="Pick a player above." className="card py-6" /> : (
        <>
          <div className="card flex items-center gap-3">
            <button
              type="button"
              onClick={() => nav(`/profiles/${row.id}`)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-ring"
              title={`Open ${row.name}'s full profile`}
            >
              <AvatarCircle playerId={row.id} name={row.name} updatedAt={avatarUpdatedAtById.get(row.id) ?? null} sizeClass="h-14 w-14" cups={cupsHeldByPlayerId.get(row.id)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-lg font-bold text-text-normal">{row.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                </div>
                <div className="text-xs text-text-muted">
                  {fmtRating(row.rating)}★ · <span className="text-win">{row.wins}</span>-<span className="text-draw">{row.draws}</span>-<span className="text-loss">{row.losses}</span> · {row.pts} pts · view profile
                </div>
              </div>
            </button>
            <div className="flex shrink-0 flex-col items-center" title="Recent form — points per match in the last games">
              <Sparkline values={row.form} />
              <span className="mt-0.5 text-xs text-text-muted">Form (last {row.form.length})</span>
            </div>
          </div>

          <StatsSection label="Key numbers">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatTile label="Played" value={String(row.played)} />
              <StatTile label="Win rate" value={row.played ? `${Math.round((row.wins / row.played) * 100)}%` : "—"} />
              <StatTile label="Pts / match" value={row.played ? (row.pts / row.played).toFixed(2) : "—"} />
              <StatTile label="Goals / match" value={row.played ? (row.gf / row.played).toFixed(2) : "—"} />
              <StatTile label="Conceded / match" value={row.played ? (row.ga / row.played).toFixed(2) : "—"} />
              <StatTile label="Goal diff" value={row.gd >= 0 ? `+${row.gd}` : String(row.gd)} />
            </div>
          </StatsSection>

          <StatsSection label="Profile net" explainer="Strengths relative to the field.">
            <div className="flex flex-col items-center">
              <Radar series={radarSeries} />
            </div>
            {/* Overlay other players, each in their consistent colour. */}
            <div className="mt-2">
              <div className="mb-1.5 text-xs font-medium text-text-muted">Compare with</div>
              <div className="flex flex-wrap gap-1.5">
                {rows.filter((r) => r.id !== row.id).map((r) => {
                  const on = overlayIds.has(r.id);
                  const c = colorOf(r.id).solid;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setOverlayIds((prev) => { const s = new Set(prev); if (s.has(r.id)) s.delete(r.id); else s.add(r.id); return s; })}
                      className={chipClass(on, "inline-flex items-center gap-1.5")}
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} />
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </StatsSection>

          <StatsSection label="Streaks · current / record">
            <PlayerStreakChips categories={streaksQ.data?.categories ?? []} globalCategories={streaksGlobalQ.data?.categories ?? []} />
          </StatsSection>

          <StatsSection label="Club stars">
            <StarsSection mode={mode} scope={scope} playerId={row.id} />
          </StatsSection>

          <StatsSection
            label="Match history"
            action={
              <ChipGroup<"compact" | "details">
                value={details ? "details" : "compact"}
                onChange={(v) => setDetails(v === "details")}
                ariaLabel="Match details"
                options={[{ key: "compact", label: "Compact" }, { key: "details", label: "Details" }]}
              />
            }
          >
            {matchesQ.isLoading && !matchesQ.data ? <InlineLoading label="Loading…" /> :
              tournaments.length ? <MatchHistoryList tournaments={tournaments} clubs={clubsQ.data ?? []} focusId={row.id} showMeta={details} showModePill={mode === "overall"} matchHref={tournamentMatchHref} /> :
                <EmptyState title="No matches yet." className="py-2" />}
          </StatsSection>
        </>
      )}
    </div>
  );
}
