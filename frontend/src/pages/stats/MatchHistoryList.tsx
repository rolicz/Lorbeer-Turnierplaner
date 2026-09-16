/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Club, MatchState, StatsMatch, StatsPlayerMatchesTournament, TournamentCupStake } from "../../api/types";
import { sideBy, winnerSide } from "../../helpers";
import ClubMark from "../../ui/primitives/ClubMark";
import MatchSides from "../../ui/primitives/MatchSides";
import { Pill, pillDate } from "../../ui/primitives/Pill";
import ScoreLine, { type ScoreResult, type ScoreSide } from "../../ui/primitives/ScoreLine";
import TournamentLaurelMarkers from "./TournamentLaurelMarkers";
import { fmtCount, fmtDate } from "../../utils/format";
import { useCupFirstClaims } from "../../hooks/useCupHolders";


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
  href,
}: {
  m: StatsMatch;
  focusId?: number | null;
  clubs: Club[];
  showMeta: boolean;
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
          // The clubs, in the one view that has no room to name them (Q17). This is the
          // same answer the friendlies list gives (Q8) to the same question, and it is
          // decided by `showMeta` rather than by a prop so that no caller can forget it:
          // a Details row already spells the club out in `MatchSides` below, and
          // `DESIGN.md` §8 lets one club wear only one symbol per row.
          leftMark={showMeta ? null : <ClubMark clubs={clubs} clubId={a?.club_id} side="left" />}
          rightMark={showMeta ? null : <ClubMark clubs={clubs} clubId={b?.club_id} side="right" />}
        />
      </div>

      {showMeta ? (
        <MatchSides
          className="mt-1"
          clubs={clubs}
          aClubId={a?.club_id}
          bClubId={b?.club_id}
          // The stars this match was played at, not the club's rating today (R4).
          aStars={a?.club_stars}
          bStars={b?.club_stars}
        />
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
    </div>
  );
}

/**
 * What the laurel on the date pill is about, in words (T15-B): which cup was on
 * the line in this tournament and who went into it holding the thing.
 *
 * Per block, never per row — a cup cannot change hands mid tournament. The
 * marker alone only says "a cup was at stake"; the name is what Roli asked for,
 * and the two together read as "Rumpi had it, and this is where he had to keep
 * it". The one tournament per cup where nobody held it yet (the cup's first
 * claim, `useCupFirstClaims`) says exactly that instead of inventing a
 * defender: `cup_stakes` names the *winner* there.
 */
function CupStakeLine({ tournamentId, stakes }: { tournamentId: number; stakes?: TournamentCupStake[] | null }) {
  const rows = (stakes ?? []).filter((s) => s.owner_player_name);
  // The lineage query lives one component deeper on purpose: a list with no cup
  // at stake (every friendly, most tournaments) then asks the server nothing and
  // needs no `QueryClient` around it — this list is rendered on five surfaces.
  return rows.length ? <CupStakeLineRows tournamentId={tournamentId} rows={rows} /> : null;
}

function CupStakeLineRows({ tournamentId, rows }: { tournamentId: number; rows: TournamentCupStake[] }) {
  const { firstClaimTournamentByCupKey } = useCupFirstClaims();

  return (
    <div className="mt-1 text-xs text-text-muted">
      {rows
        .map((s) =>
          firstClaimTournamentByCupKey.get(s.key) === tournamentId
            ? `${s.name} at stake · nobody held it yet`
            : `${s.name} at stake · ${s.owner_player_name} defending`,
        )
        .join(" · ")}
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
  showModePill = false,
  matchHref,
}: {
  t: StatsPlayerMatchesTournament;
  focusId?: number | null;
  clubs: Club[];
  showMeta: boolean;
  actions?: ReactNode;
  extraPills?: ReactNode;
  /** Show the tournament's `1v1`/`2v2` pill. Off by default: the mode is only
   *  worth a pill where the surrounding list actually mixes modes (DS8). */
  showModePill?: boolean;
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
            {showModePill ? <Pill className="pill-default">{t.mode}</Pill> : null}
            {extraPills}
          </div>
          <CupStakeLine tournamentId={t.id} stakes={t.cup_stakes} />
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <div className="text-xs text-text-muted">{fmtCount(t.matches.length, "match", "matches")}</div>
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
  showModePill = false,
  matchHref,
}: {
  tournaments: StatsPlayerMatchesTournament[];
  focusId?: number | null;
  clubs: Club[];
  showMeta: boolean;
  renderTournamentActions?: (t: StatsPlayerMatchesTournament) => ReactNode;
  renderTournamentPills?: (t: StatsPlayerMatchesTournament) => ReactNode;
  /** See `MatchHistoryTournamentBlock` — only a mixed-mode list shows it. */
  showModePill?: boolean;
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
          showModePill={showModePill}
          matchHref={matchHref}
        />
      ))}
    </div>
  );
}
