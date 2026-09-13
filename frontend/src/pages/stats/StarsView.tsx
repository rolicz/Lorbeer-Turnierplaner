/** Club stars — points per match bucketed by the star rating of the club played.
 *  Rendered inside the Player section (the player comes from the shared selection). */
import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import EmptyState from "../../ui/primitives/EmptyState";
import InlineLoading from "../../ui/primitives/InlineLoading";
import RecordLine, { recordWidths } from "../../ui/primitives/RecordLine";
import { Stars } from "../../ui/primitives/Stars";
import { getStatsPlayerMatches } from "../../api/stats.api";
import { listClubs } from "../../api/clubs.api";
import { qk } from "../../api/queryKeys";
import { matchStats, sideOf } from "./standings";
import type { StatsMode } from "./statsMode";
import type { Club, StatsMatch, StatsScope } from "../../api/types";

const STAR_LEVELS = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];
function starBuckets(matches: StatsMatch[], pid: number, clubs: Club[]) {
  const starByClub = new Map<number, number>();
  for (const c of clubs) if (Number.isFinite(c.star_rating)) starByClub.set(c.id, c.star_rating);
  const by = new Map<number, { played: number; w: number; d: number; l: number; pts: number }>();
  for (const s of STAR_LEVELS) by.set(s, { played: 0, w: 0, d: 0, l: 0, pts: 0 });
  for (const m of matches) {
    const st = matchStats(m, pid);
    if (!st) continue;
    const side = sideOf(m, pid);
    if (!side) continue;
    const club = m.sides.find((x) => x.side === side)?.club_id ?? null;
    if (!club) continue;
    const stars = starByClub.get(club);
    if (stars == null) continue;
    const cur = by.get(Math.round(stars * 2) / 2);
    if (!cur) continue;
    cur.played++; cur.pts += st.pts;
    if (st.res === "W") cur.w++; else if (st.res === "D") cur.d++; else cur.l++;
  }
  return STAR_LEVELS.map((s) => { const v = by.get(s)!; return { stars: s, ...v, ppm: v.played ? v.pts / v.played : 0 }; });
}

export function StarsSection({ mode, scope, playerId }: { mode: StatsMode; scope: StatsScope; playerId: number | null }) {
  const matchesQ = useQuery({
    queryKey: qk.stats.playerMatches(playerId ?? 0, scope),
    queryFn: () => getStatsPlayerMatches({ playerId: playerId as number, scope }),
    enabled: playerId != null,
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const clubsQ = useQuery({ queryKey: qk.clubs(), queryFn: () => listClubs(), staleTime: 60_000 });
  const flat = useMemo(() => {
    const ts = matchesQ.data?.tournaments ?? [];
    return (mode === "overall" ? ts : ts.filter((t) => t.mode === mode)).flatMap((t) => t.matches);
  }, [matchesQ.data, mode]);
  const buckets = useMemo(() => (playerId ? starBuckets(flat, playerId, clubsQ.data ?? []) : []), [flat, playerId, clubsQ.data]);
  const active = buckets.filter((b) => b.played > 0);
  // One set of column widths for the whole list, so every row lines up (T14).
  const starWidths = useMemo(() => recordWidths(active.map((b) => ({ played: b.played, wins: b.w, draws: b.d, losses: b.l }))), [active]);
  const known = active.reduce((s, b) => s + b.played, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">Points per match by the star rating of the club played. {known ? `${known} rated matches.` : ""}</p>
      {matchesQ.isLoading && !matchesQ.data ? (
        <InlineLoading label="Loading…" />
      ) : !active.length ? (
        <EmptyState title="No finished matches with rated clubs for this player." className="py-2" />
      ) : (
        <div className="list-divided">
          {active.map((b) => (
            <div key={b.stars} className="relative overflow-hidden">
              <div className="absolute inset-y-1 left-0 rounded-r" style={{ width: `${Math.max(2, Math.min(100, (b.ppm / 3) * 100))}%`, backgroundColor: "rgb(var(--color-accent) / 0.16)" }} aria-hidden="true" />
              <div className="relative z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-1 py-2.5">
                <Stars rating={b.stars} size={12} textClassName="text-text-normal" />
                <div className="text-center">
                  <RecordLine
                    played={b.played}
                    wins={b.w}
                    draws={b.d}
                    losses={b.l}
                    widths={starWidths}
                    className="font-mono text-xs text-text-muted"
                  />
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-mono text-sm font-bold tabular-nums text-text-normal">{b.ppm.toFixed(2)}</span>
                  <span className="ml-1 text-xs text-text-muted">ppm</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
