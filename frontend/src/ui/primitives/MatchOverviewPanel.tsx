import type { Club, Match, MatchSide, TournamentMode } from "../../api/types";
import { sideBy } from "../../helpers";
import { cn } from "../cn";
import ClubBadge from "../ClubBadge";
import NationFlag from "../NationFlag";
import { clubLabelPartsById } from "../clubControls";
import { Pill, statusMatchPill } from "./Pill";
import { StarsFA } from "./StarsFA";
import { fmtOdd } from "../../utils/format";

// The club/league rows scale their type at `md:` (`text-xs md:text-sm`), so the
// symbols step up from the primitives' `sm` to their `md` footprint there too.
const BADGE_MD_UP = "md:h-[22px] md:w-[22px] md:text-[10px]";
const FLAG_MD_UP = "md:text-[13.5px]";

/** National teams render a flag as their club symbol, so they take the flag's step-up. */
function symbolMdUp(nation: string | null): string {
  return nation ? FLAG_MD_UP : BADGE_MD_UP;
}

function namesStack(side?: MatchSide): string[] {
  const ps = side?.players ?? [];
  if (!ps.length) return ["—"];
  return ps.map((p) => p.display_name);
}


function OddsInline({ odds }: { odds: { home: number; draw: number; away: number } }) {
  return (
    <div className="mt-2 flex items-center justify-center">
      <div className="inline-flex items-center gap-2 text-[11px] sm:text-xs">
        <span className="inline-flex items-baseline gap-1">
          <span className="text-text-muted font-semibold">1</span>
          <span className="font-mono tabular-nums text-text-normal">{fmtOdd(Number(odds.home))}</span>
        </span>
        <span className="text-text-muted/60">|</span>
        <span className="inline-flex items-baseline gap-1">
          <span className="text-text-muted font-semibold">X</span>
          <span className="font-mono tabular-nums text-text-normal">{fmtOdd(Number(odds.draw))}</span>
        </span>
        <span className="text-text-muted/60">|</span>
        <span className="inline-flex items-baseline gap-1">
          <span className="text-text-muted font-semibold">2</span>
          <span className="font-mono tabular-nums text-text-normal">{fmtOdd(Number(odds.away))}</span>
        </span>
      </div>
    </div>
  );
}

export default function MatchOverviewPanel({
  match,
  clubs,
  mode,
  aGoals,
  bGoals,
  showModePill = false,
  showOdds = true,
  showOddsWhenFinished = false,
  scoreBoxStyle = "auto",
  scheduledScoreStyle = "dash",
  surface = "panel-subtle",
  className,
}: {
  match: Match;
  clubs: Club[];
  mode?: TournamentMode | null;
  aGoals: number;
  bGoals: number;
  showModePill?: boolean;
  showOdds?: boolean;
  showOddsWhenFinished?: boolean;
  scoreBoxStyle?: "auto" | "inner" | "chip";
  scheduledScoreStyle?: "dash" | "emdash-zero";
  surface?: "panel-subtle" | "panel-inner" | "panel" | "none";
  className?: string;
}) {
  const a = sideBy(match, "A");
  const b = sideBy(match, "B");
  const aNames = namesStack(a);
  const bNames = namesStack(b);

  const aClubParts = clubLabelPartsById(clubs, a?.club_id);
  const bClubParts = clubLabelPartsById(clubs, b?.club_id);

  // "No club" (and unresolved ids) render no symbol — only real clubs get a badge.
  const aHasClub = clubs.some((c) => c.id === a?.club_id);
  const bHasClub = clubs.some((c) => c.id === b?.club_id);

  const isScheduled = match.state === "scheduled";
  const useEmDash =
    scheduledScoreStyle === "emdash-zero" && isScheduled && aGoals === 0 && bGoals === 0;
  const scoreLeft = isScheduled && !useEmDash ? "-" : useEmDash ? "—" : String(aGoals);
  const scoreRight = isScheduled && !useEmDash ? "-" : useEmDash ? "—" : String(bGoals);
  const scoreBoxClass =
    scoreBoxStyle === "inner"
      ? "rounded-lg border border-border-card-inner/70 bg-bg-card-inner px-3 py-1.5"
      : scoreBoxStyle === "chip"
        ? "card-chip"
        : isScheduled
          ? "card-chip"
          : "rounded-lg border border-border-card-inner/70 bg-bg-card-inner px-3 py-1.5";
  const leader: "A" | "B" | null = isScheduled || aGoals === bGoals ? null : aGoals > bGoals ? "A" : "B";

  return (
    <div
      className={cn(
        surface === "panel" ? "panel p-3" : "",
        surface === "panel-subtle" ? "panel-subtle p-3" : "",
        surface === "panel-inner" ? "panel-inner p-3" : "",
        className,
      )}
    >
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="text-[11px] sm:text-xs text-text-muted">Match #{match.order_index + 1}</div>
        <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap">
          <Pill>leg {match.leg}</Pill>
          {showModePill ? <Pill>{mode === "2v2" ? "2v2" : "1v1"}</Pill> : null}
          <Pill className={`${statusMatchPill(match.state)}`}>{match.state}</Pill>
        </div>
      </div>

      {showOdds && (showOddsWhenFinished || match.state === "scheduled" || match.state === "playing") && match.odds ? (
        <OddsInline odds={match.odds} />
      ) : null}

      <div className="mt-3 border-y border-border-card-inner/60 py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4">
          <div className="min-w-0">
            {aNames.map((n, i) => (
              <div
                key={`${n}-${i}`}
                className={
                  "text-[15px] md:text-lg text-text-normal whitespace-normal md:truncate break-words leading-tight " +
                  (leader === "A" ? "font-black" : "font-medium")
                }
              >
                {n}
              </div>
            ))}
          </div>

          <div className={`${scoreBoxClass} justify-self-center flex items-center justify-center gap-2`}>
            <span className="text-xl font-semibold tabular-nums">{scoreLeft}</span>
            <span className="text-text-muted">:</span>
            <span className="text-xl font-semibold tabular-nums">{scoreRight}</span>
          </div>

          <div className="min-w-0 text-right">
            {bNames.map((n, i) => (
              <div
                key={`${n}-${i}`}
                className={
                  "text-[15px] md:text-lg text-text-normal whitespace-normal md:truncate break-words leading-tight " +
                  (leader === "B" ? "font-black" : "font-medium")
                }
              >
                {n}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 md:mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 md:gap-4 text-xs md:text-sm text-text-muted">
        <div className="min-w-0 flex items-baseline gap-1.5">
          {aHasClub ? (
            <ClubBadge
              name={aClubParts.name}
              nation={aClubParts.national_nation}
              clubId={aClubParts.id}
              crestVersion={aClubParts.crest_updated_at}
              className={symbolMdUp(aClubParts.national_nation)}
            />
          ) : null}
          <span className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{aClubParts.name}</span>
        </div>
        <div />
        <div className="min-w-0 flex items-baseline justify-end gap-1.5 text-right">
          <span className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{bClubParts.name}</span>
          {bHasClub ? (
            <ClubBadge
              name={bClubParts.name}
              nation={bClubParts.national_nation}
              clubId={bClubParts.id}
              crestVersion={bClubParts.crest_updated_at}
              className={symbolMdUp(bClubParts.national_nation)}
            />
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 md:gap-4 text-xs md:text-sm text-text-muted">
        <div className="min-w-0 flex items-baseline gap-1.5">
          <NationFlag nation={aClubParts.league_nation} className={FLAG_MD_UP} />
          <span className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{aClubParts.league_name}</span>
        </div>
        <div />
        <div className="min-w-0 flex items-baseline justify-end gap-1.5 text-right">
          <span className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{bClubParts.league_name}</span>
          <NationFlag nation={bClubParts.league_nation} className={FLAG_MD_UP} />
        </div>
      </div>

      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4 text-[11px] md:text-sm text-text-muted">
        <div className="min-w-0">
          <StarsFA rating={aClubParts.rating ?? 0} textClassName="text-text-muted" />
        </div>
        <div />
        <div className="min-w-0 flex justify-end">
          <StarsFA rating={bClubParts.rating ?? 0} textClassName="text-text-muted" />
        </div>
      </div>

    </div>
  );
}
