import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { Club, Match, MatchSide } from "../../api/types";
import { getTournament } from "../../api/tournaments.api";
import { listClubs } from "../../api/clubs.api";
import { apiFetch } from "../../api/client";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";

import { useTournamentWS, useAnyTournamentWS } from "../../hooks/useTournamentWS";

function sideBy(m: Match, side: "A" | "B"): MatchSide | undefined {
  return m.sides.find((s) => s.side === side);
}

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

function namesInline(side?: MatchSide) {
  const ps = side?.players ?? [];
  if (!ps.length) return "—";
  return ps.map((p) => p.display_name).join(" + ");
}

type LiveTournamentLite = {
  id: number;
  name: string;
  mode: "1v1" | "2v2";
  status: "live";
  date?: string | null;
};

function statusPill(status: "draft" | "live" | "done") {
  if (status === "live") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (status === "draft") return "border-indigo-500/40 bg-indigo-500/10 text-indigo-300";
  return "border-zinc-700 bg-zinc-900/40 text-zinc-300";
}

function statusMatchPill(state: "scheduled" | "playing" | "finished") {
  if (state === "playing") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (state === "scheduled") return "border-indigo-500/40 bg-indigo-500/10 text-indigo-300";
  return "border-zinc-700 bg-zinc-900/40 text-zinc-300";
}

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
      // backend returns either {id,...,status:"live"} or null
      return (await apiFetch("/tournaments/live")) as any;
    },
  });

  const tid = (liveQ.data as any)?.id ? Number((liveQ.data as any).id) : null;

  // 2) fetch full tournament details so we can show match + players
  const tQ = useQuery({
    queryKey: ["tournament", tid],
    queryFn: () => getTournament(tid!),
    enabled: !!tid,
  });

  useTournamentWS(tid);
  useAnyTournamentWS();

  // 3) fetch clubs (for labels). If you ever add "game" to tournaments, switch this.
  const clubsQ = useQuery({
    queryKey: ["clubs", "EA FC 26"],
    queryFn: () => listClubs("EA FC 26"),
    enabled: !!tid,
  });

  const status = (tQ.data as any)?.status ?? "draft";
  const match = useMemo(() => pickPreviewMatch((tQ.data as any)?.matches ?? []), [tQ.data]);

  const a = match ? sideBy(match, "A") : undefined;
  const b = match ? sideBy(match, "B") : undefined;

  const aGoals = Number(a?.goals ?? 0);
  const bGoals = Number(b?.goals ?? 0);

  const isScheduled = match?.state === "scheduled";
  const showDashScore = isScheduled && aGoals === 0 && bGoals === 0;

  const scoreLeft = showDashScore ? "—" : String(aGoals);
  const scoreRight = showDashScore ? "—" : String(bGoals);

  const aWin = !isScheduled && aGoals > bGoals;
  const bWin = !isScheduled && bGoals > aGoals;

  const clubs = clubsQ.data ?? [];
  const aClub = clubLabelById(clubs, a?.club_id);
  const bClub = clubLabelById(clubs, b?.club_id);

  // render nothing if no live tournament OR no matches yet
  if (!tid || !match) return null;

  return (

      <CollapsibleCard title={
        <span className="inline-flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span>Live now</span>
        </span>
        } defaultOpen={true}>
        <button
          type="button"
          onClick={() => nav(`/live/${tid}`)}
          className="w-full text-left rounded-2xl p-1 hover:bg-zinc-900/30 transition"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mt-0.5 truncate text-base font-semibold text-zinc-100">
                {(tQ.data as any)?.name ?? `Tournament #${tid}`}
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${statusPill(status)}`}>
                <i className="fa fa-trophy symbol-margin-to-text" />
                <span>{status}</span>
              </span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${statusMatchPill(match.state)}`}>
                <i className="fa fa-gamepad symbol-margin-to-text" />
                <span>{match.state}</span>
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/10 px-3 pb-3 pt-10">
            {/* Row 1: names + score (with leg/# above) */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
              {/* A name */}
              <div className="min-w-0">
                <div className="truncate font-medium text-zinc-100">{namesInline(a)}</div>
              </div>

            {/* SCORE + meta above (doesn't change height) */}
            <div className="justify-self-center">
              <div className="relative inline-flex flex-col items-center">
                <div className="absolute left-1/2 -top-4 -translate-x-1/2 whitespace-nowrap text-[11px] leading-none text-zinc-500">
                  leg {match.leg} · #{match.order_index + 1}
                </div>

                <div className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-1.5">
                  <span className={`text-xl font-semibold tabular-nums text-zinc-100`}>
                    {scoreLeft}
                  </span>
                  <span className="text-zinc-500">:</span>
                  <span className={`text-xl font-semibold tabular-nums text-zinc-100`}>
                    {scoreRight}
                  </span>
                </div>
              </div>
            </div>



              {/* B name */}
              <div className="min-w-0 text-right">
                <div className="truncate font-medium text-zinc-100">{namesInline(b)}</div>
              </div>
            </div>

            {/* Row 2: clubs below */}
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-xs text-zinc-500">
              <div className="min-w-0 truncate">{aClub}</div>
              <div /> {/* keep center column */}
              <div className="min-w-0 truncate text-right">{bClub}</div>
            </div>
          </div>


          <div className="mt-2 text-xs text-zinc-500">Tap to open live tournament.</div>
        </button>
    </CollapsibleCard>
  );
}
