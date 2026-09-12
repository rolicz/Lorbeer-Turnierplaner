/**
 * The hero score panel (`DESIGN.md` §8).
 *
 *   Match 1 · Leg 1 · 1v1                      [playing]   ← meta line, one coloured pill
 *            Flo        2 │ 1        Atzi                  ← ScoreLine hero
 *                1 4.88 · X 4.14 · 2 1.60                  ← quiet odds line
 *      FC Bayern München 🛡   🛡 FC Barcelona               ← side columns hug the centre,
 *             Bundesliga 🇩🇪   🇪🇸 La Liga                      symbols sit next to their text
 *                  ★★★★★       ★★★★★
 *
 * No colon, no box around the score, no `border-y` rules, and stars only for a
 * side that actually has a club.
 */
import type { ReactNode } from "react";

import type { Club, Match, MatchSide, TournamentMode } from "../../api/types";
import { sideBy } from "../../helpers";
import { cn } from "../cn";
import ClubBadge from "../ClubBadge";
import NationFlag from "../NationFlag";
import { clubLabelPartsById } from "../clubControls";
import { Pill, statusMatchPill } from "./Pill";
import ScoreLine from "./ScoreLine";
import { StarsFA } from "./StarsFA";
import { fmtOdd } from "../../utils/format";

function namesStack(side?: MatchSide): string[] {
  const ps = side?.players ?? [];
  if (!ps.length) return ["—"];
  return ps.map((p) => p.display_name);
}

/** One meta row under the score: both sides hug the centre gap, like the names above. */
function SideRow({ left, right, className }: { left: ReactNode; right: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3", className)}>
      <div className="flex min-w-0 items-center justify-end gap-1.5 text-right">{left}</div>
      <div />
      <div className="flex min-w-0 items-center gap-1.5 text-left">{right}</div>
    </div>
  );
}

function Wrapped({ children }: { children: ReactNode }) {
  return <span className="min-w-0 whitespace-normal break-words leading-tight md:truncate">{children}</span>;
}

export default function MatchOverviewPanel({
  match,
  clubs,
  mode,
  aGoals,
  bGoals,
  showMode = false,
  showOdds = true,
  showOddsWhenFinished = false,
  surface = "inset",
  className,
}: {
  match: Match;
  clubs: Club[];
  mode?: TournamentMode | null;
  aGoals: number;
  bGoals: number;
  /** Adds the `1v1` / `2v2` token to the meta line. */
  showMode?: boolean;
  showOdds?: boolean;
  showOddsWhenFinished?: boolean;
  surface?: "card" | "inset" | "none";
  className?: string;
}) {
  const a = sideBy(match, "A");
  const b = sideBy(match, "B");

  const aClubParts = clubLabelPartsById(clubs, a?.club_id);
  const bClubParts = clubLabelPartsById(clubs, b?.club_id);

  // "No club" (and unresolved ids) render no symbol, no league and no stars —
  // only real clubs get the full column.
  const aHasClub = clubs.some((c) => c.id === a?.club_id);
  const bHasClub = clubs.some((c) => c.id === b?.club_id);

  const odds = match.odds ?? null;
  const showOddsLine =
    showOdds && !!odds && (showOddsWhenFinished || match.state === "scheduled" || match.state === "playing");

  return (
    <div className={cn(surface === "card" ? "card" : surface === "inset" ? "inset" : "", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-xs text-text-muted">
          Match {match.order_index + 1} · Leg {match.leg}
          {showMode ? ` · ${mode === "2v2" ? "2v2" : "1v1"}` : ""}
        </div>
        <Pill className={statusMatchPill(match.state)}>{match.state}</Pill>
      </div>

      <ScoreLine
        size="hero"
        className="mt-2"
        leftNames={namesStack(a)}
        rightNames={namesStack(b)}
        leftGoals={aGoals}
        rightGoals={bGoals}
        state={match.state}
      />

      {showOddsLine && odds ? (
        <div className="mt-1 text-center font-mono text-xs tabular-nums text-text-muted">
          1 {fmtOdd(Number(odds.home))} · X {fmtOdd(Number(odds.draw))} · 2 {fmtOdd(Number(odds.away))}
        </div>
      ) : null}

      <SideRow
        className="mt-3 text-sm text-text-normal"
        left={
          aHasClub ? (
            <>
              <Wrapped>{aClubParts.name}</Wrapped>
              <ClubBadge
                name={aClubParts.name}
                nation={aClubParts.national_nation}
                clubId={aClubParts.id}
                crestVersion={aClubParts.crest_updated_at}
                size="md"
              />
            </>
          ) : (
            <span className="text-text-muted">{aClubParts.name}</span>
          )
        }
        right={
          bHasClub ? (
            <>
              <ClubBadge
                name={bClubParts.name}
                nation={bClubParts.national_nation}
                clubId={bClubParts.id}
                crestVersion={bClubParts.crest_updated_at}
                size="md"
              />
              <Wrapped>{bClubParts.name}</Wrapped>
            </>
          ) : (
            <span className="text-text-muted">{bClubParts.name}</span>
          )
        }
      />

      <SideRow
        className="mt-0.5 text-xs text-text-muted"
        left={
          aHasClub ? (
            <>
              <Wrapped>{aClubParts.league_name}</Wrapped>
              <NationFlag nation={aClubParts.league_nation} />
            </>
          ) : null
        }
        right={
          bHasClub ? (
            <>
              <NationFlag nation={bClubParts.league_nation} />
              <Wrapped>{bClubParts.league_name}</Wrapped>
            </>
          ) : null
        }
      />

      <SideRow
        className="mt-1 text-xs text-text-muted"
        left={aHasClub ? <StarsFA rating={aClubParts.rating ?? 0} textClassName="text-text-muted" /> : null}
        right={bHasClub ? <StarsFA rating={bClubParts.rating ?? 0} textClassName="text-text-muted" /> : null}
      />
    </div>
  );
}
