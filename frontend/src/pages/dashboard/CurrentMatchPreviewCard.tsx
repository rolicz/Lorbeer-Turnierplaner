import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type { Club, Match, MatchSide } from "../../api/types";
import { getTournament } from "../../api/tournaments.api";
import { listClubs } from "../../api/clubs.api";
import { apiFetch } from "../../api/client";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { useTournamentWS } from "../../hooks/useTournamentWS";

import { sideBy } from "../../helpers";

import { StarsFA } from "../../ui/primitives/StarsFA";
import { Pill, statusMatchPill } from "../../ui/primitives/Pill";

function starsLabel(v: any): string {
  if (typeof v === "number") return v.toFixed(1).replace(/\.0$/, "");
  const n = Number(v);
  if (Number.isFinite(n)) return n.toFixed(1).replace(/\.0$/, "");
  return String(v ?? "");
}

function clubLabelById(clubs: Club[], id: number | null | undefined) {
  if (!id) return "—";
  const c = clubs.find((x) => x.id === id);
  if (!c) return `#${id}`;
  return `${c.name} (${starsLabel(c.star_rating)}★)`;
}

function clubLabelPartsById(clubs: Club[], id: number | null | undefined) {
  if (!id) return { name: "No club", rating: null as number | null, ratingText: null as string | null };
  const c = clubs.find((x) => x.id === id);
  if (!c) return { name: `#${id}`, rating: null as number | null, ratingText: null as string | null };
  const r = Number(c.star_rating);
  return {
    name: c.name,
    league_name: c.league_name,
    rating: Number.isFinite(r) ? r : null,
    ratingText: Number.isFinite(r) ? `${starsLabel(r)}★` : null,
  };
}

function namesStack(side?: MatchSide): string[] {
  const ps = side?.players ?? [];
  if (!ps.length) return ["—"];
  return ps.map((p) => p.display_name);
}

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
      return (await apiFetch("/tournaments/live")) as any;
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const tid = (liveQ.data as any)?.id ? Number((liveQ.data as any).id) : null;

  // 2) fetch full tournament details so we can show match + players
  const tQ = useQuery({
    queryKey: ["tournament", tid],
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

  const status = (tQ.data as any)?.status ?? "draft";
  const match = useMemo(() => pickPreviewMatch((tQ.data as any)?.matches ?? []), [tQ.data]);

  const a = match ? sideBy(match, "A") : undefined;
  const b = match ? sideBy(match, "B") : undefined;

  const aNames = useMemo(() => namesStack(a), [a]);
  const bNames = useMemo(() => namesStack(b), [b]);

  const aGoals = Number(a?.goals ?? 0);
  const bGoals = Number(b?.goals ?? 0);

  const isScheduled = match?.state === "scheduled";
  const showDashScore = isScheduled && aGoals === 0 && bGoals === 0;

  const scoreLeft = showDashScore ? "—" : String(aGoals);
  const scoreRight = showDashScore ? "—" : String(bGoals);

  const clubs = clubsQ.data ?? [];
  const aClub = clubLabelById(clubs, a?.club_id);
  const bClub = clubLabelById(clubs, b?.club_id);

  const aClubParts = useMemo(() => clubLabelPartsById(clubs, a?.club_id), [clubs, aClub]);
  const bClubParts = useMemo(() => clubLabelPartsById(clubs, b?.club_id), [clubs, bClub]);

  if (!tid || !match) return null;

  return (
    <CollapsibleCard
      title={
        <span className="inline-flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span>Live now</span>
        </span>
      }
      defaultOpen={true}
    >
      <button
        type="button"
        onClick={() => nav(`/live/${tid}`)}
        className="w-full rounded-2xl p-1 text-left transition hover:bg-zinc-900/30"
      >
        {/* Top row: name */}
        <div className="grid grid-cols-1 items-center">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-zinc-100">
              {(tQ.data as any)?.name ?? `Tournament #${tid}`}
            </div>
          </div>
        </div>

        <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/10 p-3">
          {/* Row 1: leg/# left + match/mode pills right */}
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-[11px] sm:text-xs text-zinc-300">
              Match #{match.order_index + 1}
            </div>
            <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap">
              <Pill>
                leg {match.leg}
              </Pill>
              <Pill>
                {tQ.data?.mode === "2v2" ? "2v2" : "1v1"}
              </Pill>
              <Pill
                className={`${statusMatchPill(
                  match.state
                )}`}
              >
                {match.state}
              </Pill>
              
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            {/* A names */}
            <div className="min-w-0">
              {aNames.map((n, i) => (
                <div key={`${n}-${i}`} className="truncate font-medium text-zinc-100">
                  {n}
                </div>
              ))}
            </div>

            {/* SCORE (keep style) */}
            <div className="justify-self-center">
              <div className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-1.5">
                <span className="text-xl font-semibold tabular-nums text-zinc-100">{scoreLeft}</span>
                <span className="text-zinc-500">:</span>
                <span className="text-xl font-semibold tabular-nums text-zinc-100">{scoreRight}</span>
              </div>
            </div>

            {/* B names */}
            <div className="min-w-0 text-right">
              {bNames.map((n, i) => (
                <div key={`${n}-${i}`} className="truncate font-medium text-zinc-100">
                  {n}
                </div>
              ))}
            </div>
          </div>

          {/* Row 2: clubs */}
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-xs text-zinc-500">
            <div className="min-w-0 whitespace-normal break-words leading-tight">{aClubParts.name}</div>
            <div />
            <div className="min-w-0 whitespace-normal break-words leading-tight text-right">{bClubParts.name}</div>
          </div>

          {/* Row 3: leagues */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-xs text-zinc-700">
            <div className="min-w-0 whitespace-normal break-words leading-tight">{aClubParts.league_name}</div>
            <div />
            <div className="min-w-0 whitespace-normal break-words leading-tight text-right">{bClubParts.league_name}</div>
          </div>

          {/* Row 4: stars below */}
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-[11px] text-zinc-500">
            <div className="min-w-0">
              <StarsFA rating={aClubParts.rating ?? 0} textZinc="text-zinc-500" />
            </div>
            <div />
            <div className="min-w-0 flex justify-end">
              <StarsFA rating={bClubParts.rating ?? 0} textZinc="text-zinc-500" />
            </div>
          </div>
        </div>

        <div className="mt-2 text-xs text-zinc-500">Tap to open live tournament.</div>
      </button>
    </CollapsibleCard>
  );
}
