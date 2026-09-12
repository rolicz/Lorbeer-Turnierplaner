import { useMemo } from "react";

import type { Club, Match, TournamentMode } from "../../api/types";
import { sideBy } from "../../helpers";
import { pickPreviewMatch, teamName } from "../../utils/matchDisplay";
import MatchOverviewPanel from "../../ui/primitives/MatchOverviewPanel";
import { computeFinishedStandings, type PlayerLite } from "./tournamentStandings";

/**
 * Read-only "at a glance" tab: current match, compact live standings and the
 * next few scheduled matches. No inputs — every tap just switches to the
 * relevant full tab (or opens the match detail page once the tournament is
 * done, since there's no "current" tab to switch to any more).
 */
export default function OverviewSection({
  mode,
  matches,
  players,
  clubs,
  onOpenCurrentMatch,
  onGoToStandings,
  onGoToMatches,
}: {
  mode?: TournamentMode | null;
  matches: Match[];
  players: PlayerLite[];
  clubs: Club[];
  onOpenCurrentMatch: (match: Match) => void;
  onGoToStandings: () => void;
  onGoToMatches: () => void;
}) {
  const previewMatch = useMemo(() => pickPreviewMatch(matches), [matches]);
  const pa = previewMatch ? sideBy(previewMatch, "A") : undefined;
  const pb = previewMatch ? sideBy(previewMatch, "B") : undefined;

  const standings = useMemo(
    () => computeFinishedStandings(matches, players, { includePlaying: true }),
    [matches, players],
  );

  const nextMatches = useMemo(() => {
    const excludeId = previewMatch?.id ?? null;
    return matches
      .filter((m) => m.state === "scheduled" && m.id !== excludeId)
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .slice(0, 3);
  }, [matches, previewMatch]);

  return (
    <div className="stack-tight">
      <div>
        <div className="section-head">
          <span className="section-label">Current match</span>
        </div>
        {previewMatch ? (
          <button
            type="button"
            onClick={() => onOpenCurrentMatch(previewMatch)}
            className="block w-full rounded-2xl text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
          >
            <MatchOverviewPanel
              match={previewMatch}
              clubs={clubs}
              mode={mode}
              showMode={true}
              showOdds={true}
              aGoals={Number(pa?.goals ?? 0)}
              bGoals={Number(pb?.goals ?? 0)}
            />
          </button>
        ) : (
          <div className="panel-subtle p-3 text-sm text-text-muted">No matches yet.</div>
        )}
      </div>

      <div>
        <div className="section-head">
          <span className="section-label">Standings</span>
        </div>
        <button
          type="button"
          onClick={onGoToStandings}
          className="block w-full rounded-xl panel-subtle p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
          aria-label="Open standings"
        >
          <div className="flex items-center gap-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
            <span className="w-4 text-right">#</span>
            <span className="min-w-0 flex-1">Player</span>
            <span className="w-5 text-right">P</span>
            <span className="w-7 text-right">GD</span>
            <span className="w-6 text-right">Pts</span>
          </div>
          {standings.map((r, idx) => (
            <div
              key={r.playerId}
              className={
                "flex items-center gap-2 px-1.5 py-0.5 text-xs tabular-nums " +
                (idx === 0 ? "font-semibold text-text-normal" : "text-text-muted")
              }
            >
              <span className="w-4 text-right">{idx + 1}</span>
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="w-5 text-right">{r.played}</span>
              <span className="w-7 text-right">{r.gd >= 0 ? `+${r.gd}` : r.gd}</span>
              <span className="w-6 text-right">{r.pts}</span>
            </div>
          ))}
        </button>
      </div>

      {nextMatches.length ? (
        <div>
          <div className="section-head">
            <span className="section-label">Next matches</span>
          </div>
          <button
            type="button"
            onClick={onGoToMatches}
            className="block w-full rounded-xl panel-subtle p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
            aria-label="Open matches"
          >
            {nextMatches.map((m) => (
              <div key={m.id} className="flex items-center gap-2 px-1.5 py-1 text-xs">
                <span className="w-6 shrink-0 text-text-muted">#{m.order_index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-text-normal">
                  {teamName(sideBy(m, "A"))} <span className="text-text-muted">vs</span>{" "}
                  {teamName(sideBy(m, "B"))}
                </span>
              </div>
            ))}
          </button>
        </div>
      ) : null}
    </div>
  );
}
