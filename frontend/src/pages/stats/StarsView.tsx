/** Stars tab — points-per-match bucketed by the played club's star rating. */
import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import InlineLoading from "../../ui/primitives/InlineLoading";
import { StarsFA } from "../../ui/primitives/StarsFA";
import { getStatsPlayerMatches } from "../../api/stats.api";
import { listClubs } from "../../api/clubs.api";
import { qk } from "../../api/queryKeys";
import { PlayerPicker } from "./PlayerPicker";
import type { Row } from "./standings";
import { matchStats, sideOf } from "./standings";
import type { StatsMode } from "./StatsControls";
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

export default function StarsView({ mode, scope, rows, selectedId, onSelect }: { mode: StatsMode; scope: StatsScope; rows: Row[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const matchesQ = useQuery({
    queryKey: qk.stats.playerMatches(selectedId ?? 0, scope),
    queryFn: () => getStatsPlayerMatches({ playerId: selectedId as number, scope }),
    enabled: selectedId != null,
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const clubsQ = useQuery({ queryKey: qk.clubs(), queryFn: () => listClubs(), staleTime: 60_000 });
  const flat = useMemo(() => {
    const ts = matchesQ.data?.tournaments ?? [];
    return (mode === "overall" ? ts : ts.filter((t) => t.mode === mode)).flatMap((t) => t.matches);
  }, [matchesQ.data, mode]);
  const buckets = useMemo(() => (selectedId ? starBuckets(flat, selectedId, clubsQ.data ?? []) : []), [flat, selectedId, clubsQ.data]);
  const active = buckets.filter((b) => b.played > 0);
  const known = active.reduce((s, b) => s + b.played, 0);

  return (
    <div className="space-y-4">
      <PlayerPicker players={rows.map((r) => ({ id: r.id, name: r.name }))} selectedId={selectedId} onSelect={onSelect} />
      <p className="text-[11px] text-text-muted">Points per match by the star rating of the club played. {known ? `${known} rated matches.` : ""}</p>
      {matchesQ.isLoading && !matchesQ.data ? (
        <InlineLoading label="Loading…" />
      ) : !active.length ? (
        <div className="text-sm text-text-muted">No finished matches with rated clubs for this player.</div>
      ) : (
        <div className="list-divided">
          {active.map((b) => (
            <div key={b.stars} className="relative overflow-hidden">
              <div className="absolute inset-y-1 left-0 rounded-r" style={{ width: `${Math.max(2, Math.min(100, (b.ppm / 3) * 100))}%`, backgroundColor: "rgb(var(--color-accent) / 0.16)" }} aria-hidden="true" />
              <div className="relative z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-1 py-2.5">
                <StarsFA rating={b.stars} className="text-[11px]" textClassName="text-text-normal" />
                <div className="text-center font-mono text-[11px] tabular-nums text-text-muted">
                  {b.played}P · <span className="text-status-text-green">{b.w}</span>-<span className="text-amber-300">{b.d}</span>-<span className="text-[color:rgb(var(--delta-down)/1)]">{b.l}</span>
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-mono text-sm font-bold tabular-nums text-text-normal">{b.ppm.toFixed(2)}</span>
                  <span className="ml-1 text-[11px] text-text-muted">ppm</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
