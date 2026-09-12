/** Player tab — radar, key-number tiles and match history for one player. */
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { getStatsPlayerMatches, getStatsStreaks } from "../../api/stats.api";
import { listClubs } from "../../api/clubs.api";
import { qk } from "../../api/queryKeys";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { usePlayerColors } from "./usePlayerColors";
import { ChipGroup, Sparkline, Radar } from "./charts";
import { PlayerPicker } from "./PlayerPicker";
import { MatchHistoryList, tournamentMatchHref } from "./MatchHistoryList";
import PlayerStreakChips from "./PlayerStreakChips";
import { StarsSection } from "./StarsView";
import { fmtRating } from "../../utils/format";
import type { Row } from "./standings";
import type { StatsMode } from "./StatsControls";
import type { StatsScope } from "../../api/types";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface rounded-xl px-2 py-2 text-center">
      <div className="text-base font-bold tabular-nums text-text-normal">{value}</div>
      <div className="text-[11px] text-text-muted">{label}</div>
    </div>
  );
}

export default function PlayerProfile({ mode, scope, rows, selectedId, onSelect }: { mode: StatsMode; scope: StatsScope; rows: Row[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
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

      {!row ? <div className="card-outer text-sm text-text-muted">Pick a player above.</div> : (
        <>
          <div className="card-outer flex items-center gap-3">
            <button
              type="button"
              onClick={() => nav(`/profiles/${row.id}`)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-ring"
              title={`Open ${row.name}'s full profile`}
            >
              <AvatarCircle playerId={row.id} name={row.name} updatedAt={avatarUpdatedAtById.get(row.id) ?? null} sizeClass="h-14 w-14" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-lg font-bold text-text-normal">{row.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                </div>
                <div className="text-xs text-text-muted">
                  {fmtRating(row.rating)}★ · <span className="text-status-text-green">{row.wins}</span>-<span className="text-amber-300">{row.draws}</span>-<span className="text-[color:rgb(var(--delta-down)/1)]">{row.losses}</span> · {row.pts} pts · view profile
                </div>
              </div>
            </button>
            <div className="flex shrink-0 flex-col items-center" title="Recent form — points per match in the last games">
              <Sparkline values={row.form} />
              <span className="mt-0.5 text-[11px] uppercase tracking-wide text-text-muted">Form (last {row.form.length})</span>
            </div>
          </div>

          <div className="card-outer">
            <h2 className="mb-2 text-sm font-semibold text-text-normal">Key numbers</h2>
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Played" value={String(row.played)} />
              <StatTile label="Win rate" value={row.played ? `${Math.round((row.wins / row.played) * 100)}%` : "—"} />
              <StatTile label="Pts / match" value={row.played ? (row.pts / row.played).toFixed(2) : "—"} />
              <StatTile label="Goals / match" value={row.played ? (row.gf / row.played).toFixed(2) : "—"} />
              <StatTile label="Conceded / match" value={row.played ? (row.ga / row.played).toFixed(2) : "—"} />
              <StatTile label="Goal diff" value={row.gd >= 0 ? `+${row.gd}` : String(row.gd)} />
            </div>
          </div>

          <div className="card-outer">
            <h2 className="text-sm font-semibold text-text-normal">Profile net</h2>
            <div className="flex flex-col items-center">
              <Radar series={radarSeries} />
              <div className="text-[11px] text-text-muted">Strengths relative to the field.</div>
            </div>
            {/* Overlay other players, each in their consistent colour. */}
            <div className="mt-2">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">Compare with</div>
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
                      className={
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition focus-ring " +
                        (on ? "bg-bg-card-chip/70 text-text-normal ring-1 ring-inset ring-border-card-chip" : "bg-bg-card-chip/30 text-text-muted hover:text-text-normal")
                      }
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c, opacity: on ? 1 : 0.45 }} />
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card-outer">
            <h2 className="mb-2 text-sm font-semibold text-text-normal">Club stars</h2>
            <StarsSection mode={mode} scope={scope} playerId={row.id} />
          </div>

          <div className="card-outer">
            <h2 className="mb-2 text-sm font-semibold text-text-normal">Streaks · current / record</h2>
            <PlayerStreakChips categories={streaksQ.data?.categories ?? []} globalCategories={streaksGlobalQ.data?.categories ?? []} />
          </div>

          <div className="card-outer">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-text-normal">Match history</h2>
              <ChipGroup<"compact" | "details">
                value={details ? "details" : "compact"}
                onChange={(v) => setDetails(v === "details")}
                ariaLabel="Match details"
                options={[{ key: "compact", label: "Compact" }, { key: "details", label: "Details" }]}
              />
            </div>
            {matchesQ.isLoading && !matchesQ.data ? <InlineLoading label="Loading…" /> :
              tournaments.length ? <MatchHistoryList tournaments={tournaments} clubs={clubsQ.data ?? []} focusId={row.id} showMeta={details} nameColorByResult hideModePill matchHref={tournamentMatchHref} /> :
                <div className="text-sm text-text-muted">No matches yet.</div>}
          </div>
        </>
      )}
    </div>
  );
}
