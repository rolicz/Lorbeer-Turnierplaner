import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type { Match } from "../../api/types";
import { getTournament } from "../../api/tournaments.api";
import { listClubs } from "../../api/clubs.api";
import { apiFetch } from "../../api/client";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { useTournamentWS } from "../../hooks/useTournamentWS";
import { sideBy } from "../../helpers";
import MatchOverviewPanel from "../../ui/primitives/MatchOverviewPanel";
import InlineLoading from "../../ui/primitives/InlineLoading";

type LiveTournamentLite = {
  id: number;
  name: string;
  mode: "1v1" | "2v2";
  status: "live";
  date?: string | null;
};


function pickPreviewMatch(matches: Match[]): Match | null {
  const sorted = matches.slice().sort((a, b) => a.order_index - b.order_index);
  return (
    sorted.find((m) => m.state === "playing") ||
    sorted.find((m) => m.state === "scheduled") ||
    sorted.slice().reverse().find((m) => m.state === "finished") ||
    null
  );
}

export default function CurrentMatchPreviewCard() {
  const nav = useNavigate();

  // 1) which tournament is currently LIVE?
  const liveQ = useQuery({
    queryKey: ["tournaments", "live"],
    queryFn: async (): Promise<LiveTournamentLite | null> => {
      return apiFetch<LiveTournamentLite | null>("/tournaments/live");
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const tid = typeof liveQ.data?.id === "number" ? liveQ.data.id : null;

  // 2) fetch full tournament details so we can show match + players
  const tQ = useQuery({
    queryKey: ["tournament", tid ?? "none"],
    queryFn: () => getTournament(tid!),
    enabled: !!tid,
  });

  useTournamentWS(tid);

  // 3) fetch clubs (for labels)
  const clubsQ = useQuery({
    queryKey: ["clubs", "EA FC 26"],
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
    <CollapsibleCard
      title={
        <span className="inline-flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full live-ping opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full live-dot" />
          </span>
          <span>Live now</span>
        </span>
      }
      defaultOpen={true}
      variant="outer"
      bodyVariant="none"
    >
      <div className="card-inner">
        {!match ? (
          <InlineLoading label="Loading live match…" className="py-2" />
        ) : (
          <div>
            <div className="grid grid-cols-1 items-center">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-text-normal">
                  {tQ.data?.name ?? `Tournament #${tid}`}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => nav(`/live/${tid}`)}
              className="mt-2 block w-full rounded-xl text-left transition hover:bg-hover-default/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
            >
              <MatchOverviewPanel
                className=""
                surface="panel-subtle"
                match={match}
                clubs={clubs}
                mode={tQ.data?.mode}
                showModePill={true}
                showOdds={true}
                aGoals={Number(a?.goals ?? 0)}
                bGoals={Number(b?.goals ?? 0)}
                scheduledScoreStyle="emdash-zero"
              />
            </button>

            <div className="mt-2 text-xs text-text-muted">Tap to open live tournament.</div>
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
