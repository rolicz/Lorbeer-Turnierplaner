import type { Club, Match, MatchSide, TournamentMode } from "../../api/types";
import { sideBy } from "../../helpers";
import { cn } from "../cn";
import { clubLabelPartsById } from "../clubControls";
import { Pill, statusMatchPill } from "./Pill";
import { StarsFA } from "./StarsFA";

function namesStack(side?: MatchSide): string[] {
  const ps = side?.players ?? [];
  if (!ps.length) return ["—"];
  return ps.map((p) => p.display_name);
}

function fmtOdd(x: number) {
  return Number.isFinite(x) ? x.toFixed(2) : "—";
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
  scheduledScoreStyle?: "dash" | "emdash-zero";
  surface?: "panel-subtle" | "panel-inner" | "none";
  className?: string;
}) {
  const a = sideBy(match, "A");
  const b = sideBy(match, "B");
  const aNames = namesStack(a);
  const bNames = namesStack(b);

  const aClubParts = clubLabelPartsById(clubs, a?.club_id);
  const bClubParts = clubLabelPartsById(clubs, b?.club_id);

  const isScheduled = match.state === "scheduled";
  const useEmDash =
    scheduledScoreStyle === "emdash-zero" && isScheduled && aGoals === 0 && bGoals === 0;
  const scoreLeft = isScheduled && !useEmDash ? "-" : useEmDash ? "—" : String(aGoals);
  const scoreRight = isScheduled && !useEmDash ? "-" : useEmDash ? "—" : String(bGoals);
  const leader: "A" | "B" | null = isScheduled || aGoals === bGoals ? null : aGoals > bGoals ? "A" : "B";

  return (
    <div
      className={cn(
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

      {showOdds && (match.state === "scheduled" || match.state === "playing") && match.odds ? (
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

          <div className="card-chip justify-self-center flex items-center justify-center gap-2">
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
        <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{aClubParts.name}</div>
        <div />
        <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight text-right">{bClubParts.name}</div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 md:gap-4 text-xs md:text-sm text-text-muted">
        <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{aClubParts.league_name}</div>
        <div />
        <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight text-right">{bClubParts.league_name}</div>
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
