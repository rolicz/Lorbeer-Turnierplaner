/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Club, MatchState, StatsMatch, StatsPlayerMatchesTournament } from "../../api/types";
import { sideBy, winnerSide } from "../../helpers";
import MatchSides from "../../ui/primitives/MatchSides";
import { Pill, pillDate } from "../../ui/primitives/Pill";
import ScoreLine, { type ScoreResult, type ScoreSide } from "../../ui/primitives/ScoreLine";
import TournamentLaurelMarkers from "./TournamentLaurelMarkers";
import { fmtDate } from "../../utils/format";


/**
 * Link target for a match row: the match detail page of a real tournament.
 * Friendlies have synthetic negative tournament ids and no detail page → `null`.
 */
export function tournamentMatchHref(t: StatsPlayerMatchesTournament, m: StatsMatch): string | null {
  return t.id > 0 && t.status !== "friendly" ? `/live/${t.id}/match/${m.id}` : null;
}

export function MatchRowWithClubs({
  m,
  focusId,
  clubs,
  showMeta,
  action,
  href,
}: {
  m: StatsMatch;
  focusId?: number | null;
  clubs: Club[];
  showMeta: boolean;
  action?: ReactNode;
  /** When set, the row's main block becomes a link to the match detail page. */
  href?: string | null;
}) {
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const ag = a?.goals ?? 0;
  const bg = b?.goals ?? 0;

  type NameLine = { id: number; display_name: string };
  const aPlayers: NameLine[] = (a?.players ?? [])
    .filter((p) => Boolean(p.display_name))
    .map((p) => ({ id: p.id, display_name: p.display_name }));
  const bPlayers: NameLine[] = (b?.players ?? [])
    .filter((p) => Boolean(p.display_name))
    .map((p) => ({ id: p.id, display_name: p.display_name }));
  const aDisplay: NameLine[] = aPlayers.length ? aPlayers : [{ id: -1, display_name: "—" }];
  const bDisplay: NameLine[] = bPlayers.length ? bPlayers : [{ id: -2, display_name: "—" }];

  const focusSide: "A" | "B" | null = (() => {
    if (!focusId) return null;
    const aHas = (a?.players ?? []).some((p) => p.id === focusId);
    const bHas = (b?.players ?? []).some((p) => p.id === focusId);
    if (aHas && !bHas) return "A";
    if (bHas && !aHas) return "B";
    return null;
  })();

  const w = winnerSide(m);
  // The result belongs to the focus player's side: `ScoreLine` colours that numeral
  // (and, in the dense compact rows, adds the W/D/L badge). Nothing else is tinted.
  const focus: ScoreSide | null = focusSide === "A" ? "left" : focusSide === "B" ? "right" : null;
  const res: ScoreResult | null = (() => {
    if (m.state !== "finished" || !focusSide) return null;
    if (!w) return "D";
    return w === focusSide ? "W" : "L";
  })();

  const body = (
    <>
      <div className={showMeta ? "py-2" : "py-1"}>
        <ScoreLine
          // StatsMatch.state is a plain string (stats wire type); assert the known literal at this
          // single boundary (see the StatsMatch note in types.ts).
          state={m.state as MatchState}
          size={showMeta ? "md" : "sm"}
          leftNames={aDisplay.map((p) => p.display_name)}
          rightNames={bDisplay.map((p) => p.display_name)}
          leftGoals={ag}
          rightGoals={bg}
          focus={focus}
          result={res}
          resultBadge={!showMeta}
        />
      </div>

      {showMeta ? (
        <MatchSides className="mt-1" clubs={clubs} aClubId={a?.club_id} bClubId={b?.club_id} />
      ) : null}
    </>
  );

  return (
    <div className="flex items-stretch gap-2">
      {href ? (
        <Link
          to={href}
          state={{ fromTab: "matches" }}
          aria-label="Open match"
          className="row-tap focus-ring block min-w-0 flex-1"
        >
          {body}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

export function MatchHistoryTournamentBlock({
  t,
  focusId,
  clubs,
  showMeta,
  actions,
  extraPills,
  hideModePill = false,
  renderMatchAction,
  matchHref,
}: {
  t: StatsPlayerMatchesTournament;
  focusId?: number | null;
  clubs: Club[];
  showMeta: boolean;
  actions?: ReactNode;
  extraPills?: ReactNode;
  hideModePill?: boolean;
  renderMatchAction?: (t: StatsPlayerMatchesTournament, m: StatsMatch) => ReactNode;
  matchHref?: (t: StatsPlayerMatchesTournament, m: StatsMatch) => string | null;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-3 border-b border-border-card-chip/35 pb-1.5">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-normal">{t.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Pill className={`${pillDate()} relative overflow-visible`}>
              <TournamentLaurelMarkers stakes={t.cup_stakes} />
              {fmtDate(t.date)}
            </Pill>
            {!hideModePill ? <Pill className="pill-default">{t.mode}</Pill> : null}
            {extraPills}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <div className="text-[11px] text-text-muted">{t.matches.length} matches</div>
          {actions ?? null}
        </div>
      </div>

      <div className="list-divided">
        {t.matches.map((m) => (
          <MatchRowWithClubs
            key={m.id}
            m={m}
            focusId={focusId}
            clubs={clubs}
            showMeta={showMeta}
            action={renderMatchAction ? renderMatchAction(t, m) : undefined}
            href={matchHref ? matchHref(t, m) : null}
          />
        ))}
      </div>
    </div>
  );
}

export function MatchHistoryList({
  tournaments,
  focusId,
  clubs,
  showMeta,
  renderTournamentActions,
  renderTournamentPills,
  renderMatchActions,
  hideModePill = false,
  matchHref,
}: {
  tournaments: StatsPlayerMatchesTournament[];
  focusId?: number | null;
  clubs: Club[];
  showMeta: boolean;
  renderTournamentActions?: (t: StatsPlayerMatchesTournament) => ReactNode;
  renderTournamentPills?: (t: StatsPlayerMatchesTournament) => ReactNode;
  renderMatchActions?: (t: StatsPlayerMatchesTournament, m: StatsMatch) => ReactNode;
  hideModePill?: boolean;
  matchHref?: (t: StatsPlayerMatchesTournament, m: StatsMatch) => string | null;
}) {
  return (
    <div className="space-y-5">
      {tournaments.map((t) => (
        <MatchHistoryTournamentBlock
          key={t.id}
          t={t}
          focusId={focusId}
          clubs={clubs}
          showMeta={showMeta}
          actions={renderTournamentActions ? renderTournamentActions(t) : undefined}
          extraPills={renderTournamentPills ? renderTournamentPills(t) : undefined}
          hideModePill={hideModePill}
          renderMatchAction={renderMatchActions}
          matchHref={matchHref}
        />
      ))}
    </div>
  );
}
