import { useMemo } from "react";

import type { Club, Match, TournamentMode } from "../../api/types";
import { sideBy } from "../../helpers";
import { pickPreviewMatch, teamName } from "../../utils/matchDisplay";
import MatchOverviewPanel from "../../ui/primitives/MatchOverviewPanel";
import TournamentMetaPills from "./TournamentMetaPills";
import ScoreLine from "../../ui/primitives/ScoreLine";
import { computeFinishedStandings, type PlayerLite } from "./tournamentStandings";

/**
 * Read-only "at a glance" tab: current match, compact live standings and the
 * next few scheduled matches. No inputs — every tap just switches to the
 * relevant full tab (or opens the match detail page once the tournament is
 * done, since there's no "current" tab to switch to any more).
 */
export default function OverviewSection({
  mode,
  date,
  matches,
  players,
  clubs,
  onOpenCurrentMatch,
  onGoToStandings,
  onGoToMatches,
}: {
  mode?: TournamentMode | null;
  date?: string | null;
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
    <div className="flex flex-col gap-3">
      {/* The tournament's own meta (T10). On desktop it sits next to the page
          title, so this copy is the phone's — the page header is gone there. */}
      <TournamentMetaPills mode={mode} date={date} className="lg:hidden" />

      <div>
        <div className="section-head">
          <span className="section-label">Current match</span>
        </div>
        {previewMatch ? (
          <button
            type="button"
            onClick={() => onOpenCurrentMatch(previewMatch)}
            className="focus-ring block w-full rounded-xl text-left transition"
          >
            <MatchOverviewPanel
              match={previewMatch}
              clubs={clubs}
              mode={mode}
              showOdds={true}
              aGoals={Number(pa?.goals ?? 0)}
              bGoals={Number(pb?.goals ?? 0)}
            />
          </button>
        ) : (
          <div className="inset text-sm text-text-muted">No matches yet.</div>
        )}
      </div>

      <div>
        <div className="section-head">
          <span className="section-label">Standings</span>
        </div>
        <button
          type="button"
          onClick={onGoToStandings}
          className="inset block w-full p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
          aria-label="Open standings"
        >
          <div className="flex items-center gap-2 px-1.5 py-0.5 text-xs uppercase tracking-wide text-text-muted">
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
            className="inset block w-full p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
            aria-label="Open matches"
          >
            {nextMatches.map((m) => (
              <div key={m.id} className="flex items-center gap-2 px-1.5 py-1">
                <span className="w-6 shrink-0 text-xs text-text-muted">#{m.order_index + 1}</span>
                <ScoreLine
                  size="sm"
                  state="scheduled"
                  className="min-w-0 flex-1"
                  leftNames={teamName(sideBy(m, "A"))}
                  rightNames={teamName(sideBy(m, "B"))}
                />
              </div>
            ))}
          </button>
        </div>
      ) : null}
    </div>
  );
}
