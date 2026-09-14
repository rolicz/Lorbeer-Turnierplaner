import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import { getTournament } from "../../api/tournaments.api";
import { listClubs } from "../../api/clubs.api";
import { qk } from "../../api/queryKeys";

import { useAuth } from "../../auth/AuthContext";
import { useLiveTournament } from "../../hooks/useLiveTournament";
import { useTournamentWS } from "../../hooks/useTournamentWS";
import { sideBy } from "../../helpers";
import { pickPreviewMatch } from "../../utils/matchDisplay";
import MatchOverviewPanel from "../../ui/primitives/MatchOverviewPanel";
import InlineLoading from "../../ui/primitives/InlineLoading";

export default function CurrentMatchPreviewCard() {
  const nav = useNavigate();
  // Shares `qk.tournament(tid)` with the live page, so it fetches with the same token —
  // otherwise the two would overwrite each other's capability flags (A10).
  const { token } = useAuth();

  // 1) which tournament is currently LIVE?
  const liveQ = useLiveTournament();

  const tid = typeof liveQ.data?.id === "number" ? liveQ.data.id : null;

  // 2) fetch full tournament details so we can show match + players
  const tQ = useQuery({
    queryKey: qk.tournament(tid ?? "none"),
    queryFn: () => getTournament(tid!, token),
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
      {/* The header names the tournament and is the second door into it, the way
          Trends/Standings head their blocks; the scoreboard below is the first. */}
      <div className="section-head">
        {/* The words carry it: the one pulsing "a tournament is running" dot on
            screen belongs to the nav (bottom bar / sidebar), not to a section
            label repeating it half a screen away (T10). */}
        <span className="section-label">Live now</span>
        <Link
          to={`/live/${tid}`}
          title="Open live tournament"
          className="order-1 inline-flex min-w-0 items-center gap-1 text-xs font-medium text-text-normal no-underline transition hover:text-accent"
        >
          <span className="min-w-0 truncate">{tQ.data?.name ?? `Tournament #${tid}`}</span>
          <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
        </Link>
      </div>
      {!match ? (
        <InlineLoading label="Loading live match…" className="py-2" />
      ) : (
        <button
          type="button"
          onClick={() => nav(`/live/${tid}`)}
          className="focus-ring block w-full rounded-xl text-left transition"
          title="Open live tournament"
        >
          <MatchOverviewPanel
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
