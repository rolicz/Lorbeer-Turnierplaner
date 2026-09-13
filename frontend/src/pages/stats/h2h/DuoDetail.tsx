/** Detail for a selected 2v2 duo: overall record, matches action, and its duo-vs-duo matchups. */
import { useMemo } from "react";

import EmptyState from "../../../ui/primitives/EmptyState";
import StatsSection from "../StatsSection";
import type { StatsH2HDuo, StatsH2HTeamRivalry } from "../../../api/types";
import { fmtInt } from "../../../utils/format";
import { normalizeTeamRivalryForFocus } from "../h2hHelpers";
import { TeamRivalryRow } from "../HeadToHeadRows";

/** True when the rivalry involves exactly the given duo (both members on one side). */
function rivalryHasDuo(r: StatsH2HTeamRivalry, a: number, b: number): boolean {
  const on = (team: { id: number }[]) => team.some((p) => p.id === a) && team.some((p) => p.id === b);
  return on(r.team1) || on(r.team2);
}

export function DuoDetail({
  duo,
  rivalries,
  onOpenTeammates,
  onOpenMatchup,
}: {
  duo: StatsH2HDuo;
  rivalries: StatsH2HTeamRivalry[];
  onOpenTeammates: (d: StatsH2HDuo) => void;
  onOpenMatchup: (r: StatsH2HTeamRivalry) => void;
}) {
  const matchups = useMemo(
    () =>
      rivalries
        .filter((r) => rivalryHasDuo(r, duo.p1.id, duo.p2.id))
        .sort((a, b) => b.rivalry_score - a.rivalry_score),
    [rivalries, duo.p1.id, duo.p2.id],
  );
  const gd = duo.gd >= 0 ? `+${duo.gd}` : String(duo.gd);

  return (
    <div className="space-y-2">
      <div className="inset px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-text-normal">
              {duo.p1.display_name} <span className="text-text-muted">/</span> {duo.p2.display_name}
            </div>
            <div className="mt-0.5 text-xs text-text-muted">
              {fmtInt(duo.played)} games together · {fmtInt(duo.gf)}:{fmtInt(duo.ga)} · GD {gd}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenTeammates(duo)}
            className="shrink-0 rounded-full bg-bg-card-chip/50 px-3 py-1.5 text-xs font-medium text-text-normal transition hover:text-accent"
          >
            Matches
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-3 font-mono text-xs tabular-nums">
          <span>
            <span className="text-win">{fmtInt(duo.wins)}</span>-<span className="text-draw">{fmtInt(duo.draws)}</span>-<span className="text-loss">{fmtInt(duo.losses)}</span>
          </span>
          <span className="text-text-muted">·</span>
          <span className="font-semibold text-accent">{duo.pts_per_match.toFixed(2)} ppm</span>
        </div>
      </div>

      <StatsSection label="Matchups as a duo">
      {matchups.length ? (
        <div className="space-y-2">
          {matchups.map((r) => (
            <TeamRivalryRow
              key={`${r.team1.map((p) => p.id).join("-")}-${r.team2.map((p) => p.id).join("-")}`}
              r={r}
              focusPlayerId={duo.p1.id}
              // Pass the rivalry from the selected duo's perspective so the
              // matches modal title/focus match the row as displayed.
              onOpenMatches={() => onOpenMatchup(normalizeTeamRivalryForFocus(r, duo.p1.id))}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="No duo-vs-duo matchups recorded yet." className="py-2" />
      )}
      </StatsSection>
    </div>
  );
}
