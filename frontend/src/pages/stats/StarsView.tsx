/** Club stars — points per match bucketed by the star rating of the club played.
 *  Rendered inside the Player section (the player comes from the shared selection).
 *
 *  The rating is the one the club carried **on the day of the match** (`club_stars`,
 *  R4); today's rating is only the fallback for a club with no history recorded.
 *
 *  **The ladder is always all ten rungs** (Q16). Dropping the ratings a player never
 *  played turned the list into a different scale for every player and hid the answer
 *  the view is asked for most — "has he ever taken a 1.5★ club out?". A rung with no
 *  matches behind it therefore keeps its place and says so **without printing a single
 *  numeral**: no `0P 0-0-0`, no `0.00`, no bar. `0` is a result (played, scored
 *  nothing); "never played" is not one, and the two must not look alike. */
import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import EmptyState from "../../ui/primitives/EmptyState";
import InlineLoading from "../../ui/primitives/InlineLoading";
import RecordLine, { RecordNum, recordWidths } from "../../ui/primitives/RecordLine";
import { Stars } from "../../ui/primitives/Stars";
import { getStatsPlayerMatches } from "../../api/stats.api";
import { listClubs } from "../../api/clubs.api";
import { qk } from "../../api/queryKeys";
import { fmtAvg } from "../../utils/format";
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
    const played = m.sides.find((x) => x.side === side);
    const club = played?.club_id ?? null;
    if (!club) continue;
    const stars = played?.club_stars ?? starByClub.get(club);
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
  // The rungs that actually carry matches: they size the columns and count the sentence.
  const rated = useMemo(() => buckets.filter((b) => b.played > 0), [buckets]);
  // One set of column widths for the whole list, so every row lines up (T14). Sized from
  // the rated rungs alone, because they are the only rows that print a record line — and
  // an unplayed one could not widen a track anyway (`0` is one digit, `0-0-0` the floor).
  const starWidths = useMemo(() => recordWidths(rated.map((b) => ({ played: b.played, wins: b.w, draws: b.d, losses: b.l }))), [rated]);
  const known = rated.reduce((s, b) => s + b.played, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        Points per match by the star rating the club carried on the day.{" "}
        {known ? `${known} rated match${known === 1 ? "" : "es"} across ${rated.length} of ${STAR_LEVELS.length} ratings.` : ""}
      </p>
      {matchesQ.isLoading && !matchesQ.data ? (
        <InlineLoading label="Loading…" />
      ) : !rated.length ? (
        // Nothing rated at all is one sentence, not ten empty rungs (Q16).
        <EmptyState title="No finished matches with rated clubs for this player." className="py-2" />
      ) : (
        <div className="list-divided">
          {buckets.map((b) => {
            const unplayed = b.played === 0;
            return (
              <div key={b.stars} className="relative overflow-hidden">
                {/* No matches, no bar: the `Math.max(2, …)` stub is there so a rating played
                    for zero points still draws something, and that stub is a *result*. */}
                {unplayed ? null : (
                  <div className="absolute inset-y-1 left-0 rounded-r" style={{ width: `${Math.max(2, Math.min(100, (b.ppm / 3) * 100))}%`, backgroundColor: "rgb(var(--color-accent) / 0.16)" }} aria-hidden="true" />
                )}
                <div className="relative z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-1 py-2.5">
                  {/* The rung itself is the row's subject, so it stays legible — one tone
                      quieter on a rung nobody played (hierarchy is a token, never alpha). */}
                  <Stars rating={b.stars} size={12} textClassName={unplayed ? undefined : "text-text-normal"} />
                  <div className="text-center">
                    {unplayed ? (
                      <span className="text-xs text-text-muted">no matches</span>
                    ) : (
                      <RecordLine
                        played={b.played}
                        wins={b.w}
                        draws={b.d}
                        losses={b.l}
                        widths={starWidths}
                        className="font-mono text-xs text-text-muted"
                      />
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {unplayed ? (
                      // An em dash in the value's own column — the same thing the stats
                      // table prints for a PPM with no matches behind it (`TABLE_COLS`).
                      // `RecordNum` holds the column: a bare dash is three mono characters
                      // narrower than `0.00` and would walk the centred record lines
                      // sideways, which is the drift T14 exists to stop.
                      <span className="font-mono text-sm font-bold tabular-nums text-text-muted" aria-hidden="true">
                        <RecordNum digits={4}>—</RecordNum>
                      </span>
                    ) : (
                      <span className="font-mono text-sm font-bold tabular-nums text-text-normal">{fmtAvg(b.ppm)}</span>
                    )}
                    {/* The unit belongs to a value; an unplayed rung has none, so the
                        caption only holds its width (`visibility: hidden` — the same trick
                        `.record-num`'s pad plays, and invisible to a screen reader). */}
                    <span className={"ml-1 text-xs" + (unplayed ? " invisible" : " text-text-muted")}>ppm</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
