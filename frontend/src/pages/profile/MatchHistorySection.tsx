import { Pill } from "../../ui/primitives/Pill";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import type { Club, StatsPlayerMatchesTournament } from "../../api/types";
import { fmtRank } from "../../utils/format";
import { MatchHistoryList, tournamentMatchHref } from "../stats/MatchHistoryList";

/** Profile "Matches" tab: the player's full match history with placement pills. */
export default function MatchHistorySection({
  allMatchTournaments,
  targetPlayerId,
  clubs,
  tournamentPlacementById,
  statsMatchesError,
  clubsError,
}: {
  allMatchTournaments: StatsPlayerMatchesTournament[];
  targetPlayerId: number;
  clubs: Club[];
  tournamentPlacementById: Map<number, { position: number; total: number | null }>;
  statsMatchesError: unknown;
  clubsError: unknown;
}) {
  return (
    <div className="space-y-2">
      <ErrorToastOnError error={statsMatchesError} title="Player matches loading failed" />
      <ErrorToastOnError error={clubsError} title="Clubs loading failed" />
      <MatchHistoryList
        tournaments={allMatchTournaments}
        focusId={targetPlayerId}
        clubs={clubs}
        showMeta={false}
        showModePill
        matchHref={tournamentMatchHref}
        renderTournamentPills={(t) => {
          const row = tournamentPlacementById.get(Number(t.id));
          if (!row) return null;
          return (
            <Pill className="pill-default" title="Tournament position">
              {fmtRank(row.position, row.total)}
            </Pill>
          );
        }}
      />
    </div>
  );
}
