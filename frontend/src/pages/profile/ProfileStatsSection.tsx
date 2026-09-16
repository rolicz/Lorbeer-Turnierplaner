import { useMemo } from "react";
import { Link } from "react-router-dom";

import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import StatTile from "../../ui/primitives/StatTile";
import type { StatsPlayerRow, StatsRatingsRow, StatsStreakCategory } from "../../api/types";
import { fmtInt, fmtPct, fmtRating } from "../../utils/format";
import { Radar } from "../stats/charts";
import PlayerStreakChips from "../stats/PlayerStreakChips";

/** Profile "Stats" tab: headline tiles, the radar "profile net", and streaks. */
export default function ProfileStatsSection({
  targetPlayerId,
  playerStatsRow,
  allPlayers,
  ratingsRows,
  streaksCategories,
  streaksGlobalCategories,
  statsPlayersError,
  statsStreaksError,
  statsStreaksGlobalError,
  statsRatingsError,
}: {
  targetPlayerId: number;
  playerStatsRow: StatsPlayerRow | null;
  allPlayers: StatsPlayerRow[];
  ratingsRows: StatsRatingsRow[];
  streaksCategories: StatsStreakCategory[];
  streaksGlobalCategories: StatsStreakCategory[];
  statsPlayersError: unknown;
  statsStreaksError: unknown;
  statsStreaksGlobalError: unknown;
  statsRatingsError: unknown;
}) {
  const eloRow = useMemo(() => {
    if (!targetPlayerId) return null;
    return ratingsRows.find((r) => r.player.id === targetPlayerId) ?? null;
  }, [ratingsRows, targetPlayerId]);
  const eloRank = useMemo(() => {
    if (!targetPlayerId) return null;
    const idx = ratingsRows.findIndex((r) => r.player.id === targetPlayerId);
    return idx >= 0 ? idx + 1 : null;
  }, [ratingsRows, targetPlayerId]);

  // Radar "profile net" — strengths relative to the field (same axes as stats Player).
  const radarAxes = useMemo(() => {
    const all = allPlayers;
    if (!playerStatsRow || !all.length) return [];
    const gpm = (r: { gf: number; played: number }) => (r.played ? r.gf / r.played : 0);
    const gapm = (r: { ga: number; played: number }) => (r.played ? r.ga / r.played : 0);
    const maxGfpm = Math.max(0.01, ...all.map(gpm));
    const maxGapm = Math.max(0.01, ...all.map(gapm));
    const maxPlayed = Math.max(1, ...all.map((r) => r.played));
    const row = playerStatsRow;
    return [
      { label: "Attack", value: gpm(row) / maxGfpm },
      { label: "Defense", value: 1 - gapm(row) / maxGapm },
      { label: "Win %", value: row.played ? row.wins / row.played : 0 },
      { label: "Form", value: (row.lastN_avg_pts ?? 0) / 3 },
      { label: "Activity", value: row.played / maxPlayed },
    ];
  }, [allPlayers, playerStatsRow]);

  return (
    <div className="space-y-4">
      <ErrorToastOnError error={statsPlayersError} title="Stats loading failed" />
      <ErrorToastOnError error={statsStreaksError} title="Streaks loading failed" />
      <ErrorToastOnError error={statsStreaksGlobalError} title="Streaks loading failed" />
      <ErrorToastOnError error={statsRatingsError} title="Ratings loading failed" />

      {/* Overall, tournaments only — the stats page's Player section shows exactly
          these numbers at its default Mode/Source, and breaks them down at any other. */}
      <div className="section-head">
        <span className="section-label">Key numbers</span>
        {targetPlayerId > 0 ? (
          <Link to={`/stats?view=player&player=${targetPlayerId}`} className="order-1 shrink-0 text-xs font-medium text-accent no-underline">
            Full stats →
          </Link>
        ) : null}
      </div>

      {(() => {
        const r = playerStatsRow;
        const played = r?.played ?? 0;
        // The Form window is however many of the last FORM_LAST_N matches exist —
        // say which, rather than naming a number of matches the player never played.
        const formWindow = (r?.lastN_pts ?? []).length;
        return (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatTile label="Played" value={String(played)} />
              <StatTile label="Win rate" value={played ? `${Math.round(((r?.wins ?? 0) / played) * 100)}%` : "—"} />
              <StatTile label="Pts / match" value={played ? fmtPct((r?.pts ?? 0) / played) : "—"} />
              <StatTile label="Goals / match" value={played ? fmtPct((r?.gf ?? 0) / played) : "—"} />
              <StatTile label="Conceded / match" value={played ? fmtPct((r?.ga ?? 0) / played) : "—"} />
              <StatTile label="Goal diff" value={(r?.gd ?? 0) >= 0 ? `+${fmtInt(r?.gd ?? 0)}` : fmtInt(r?.gd ?? 0)} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
              <span>
                Record <span className="tabular-nums text-win">{fmtInt(r?.wins ?? 0)}</span>-<span className="tabular-nums text-draw">{fmtInt(r?.draws ?? 0)}</span>-<span className="tabular-nums text-loss">{fmtInt(r?.losses ?? 0)}</span>
              </span>
              <span>Elo <b className="tabular-nums text-text-normal">{eloRow ? fmtRating(eloRow.rating) : "—"}</b>{eloRank != null ? ` · #${eloRank}` : ""}</span>
              <span>Form{formWindow ? ` (last ${formWindow})` : ""} <b className="tabular-nums text-text-normal">{formWindow ? fmtPct(r?.lastN_avg_pts ?? 0) : "—"}</b></span>
            </div>
          </>
        );
      })()}

      {radarAxes.length >= 3 ? (
        <div>
          {/* Header, then the one-line explainer, then the block — the shape every stats
              section has (DESIGN.md §6); the stats page's Player view renders this exact
              block and must not word it differently (A8). */}
          <div className="section-head"><span className="section-label">Profile net</span></div>
          <p className="-mt-1 text-xs text-text-muted">Strengths relative to the field.</p>
          <div className="mt-2 flex flex-col items-center">
            <Radar axes={radarAxes} />
          </div>
        </div>
      ) : null}

      <div>
        <div className="section-head"><span className="section-label">Streaks · current / record</span></div>
        <PlayerStreakChips categories={streaksCategories} globalCategories={streaksGlobalCategories} />
      </div>
    </div>
  );
}
