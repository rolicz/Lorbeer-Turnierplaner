import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import { getTournament } from "../../api/tournaments.api";
import { listClubs } from "../../api/clubs.api";
import { qk } from "../../api/queryKeys";

import { useLiveTournament } from "../../hooks/useLiveTournament";
import { useTournamentWS } from "../../hooks/useTournamentWS";
import { sideBy } from "../../helpers";
import { pickPreviewMatch } from "../../utils/matchDisplay";
import MatchOverviewPanel from "../../ui/primitives/MatchOverviewPanel";
import InlineLoading from "../../ui/primitives/InlineLoading";

export default function CurrentMatchPreviewCard() {
  const nav = useNavigate();

  // 1) which tournament is currently LIVE?
  const liveQ = useLiveTournament();

  const tid = typeof liveQ.data?.id === "number" ? liveQ.data.id : null;

  // 2) fetch full tournament details so we can show match + players
  const tQ = useQuery({
    queryKey: qk.tournament(tid ?? "none"),
    queryFn: () => getTournament(tid!),
    enabled: !!tid,
  });

  useTournamentWS(tid);

  // 3) fetch clubs (for labels)
  const clubsQ = useQuery({
    queryKey: qk.clubs("EA FC 26"),
    queryFn: () => listClubs("EA FC 26"),
    enabled: !!tid,
  });

  const match = useMemo(() => pickPreviewMatch(tQ.data?.matches ?? []), [tQ.data?.matches]);
  const clubs = useMemo(() => clubsQ.data ?? [], [clubsQ.data]);
  const a = match ? sideBy(match, "A") : undefined;
  const b = match ? sideBy(match, "B") : undefined;

  // If there's no live tournament, don't show this card at all (dashboard stays clean).
  // Important: keep this AFTER hooks to avoid rules-of-hooks crashes when tid flips null<->number.
  if (!tid) return null;

  return (
    <div>
      <div className="section-head">
        <span className="section-label inline-flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full live-ping opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full live-dot" />
          </span>
          Live now
        </span>
      </div>
      {!match ? (
        <InlineLoading label="Loading live match…" className="py-2" />
      ) : (
        <button
          type="button"
          onClick={() => nav(`/live/${tid}`)}
          className="card block w-full text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
          title="Open live tournament"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 truncate text-sm font-semibold text-text-normal">
              {tQ.data?.name ?? `Tournament #${tid}`}
            </h2>
            <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
          </div>
          <MatchOverviewPanel
            surface="none"
            className="mt-2"
            match={match}
            clubs={clubs}
            mode={tQ.data?.mode}
            showOdds={true}
            aGoals={Number(a?.goals ?? 0)}
            bGoals={Number(b?.goals ?? 0)}
          />
        </button>
      )}
    </div>
  );
}
