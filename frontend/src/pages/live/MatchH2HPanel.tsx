import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Swords, Users } from "lucide-react";

import { getStatsH2HMatches } from "../../api/stats.api";
import { qk } from "../../api/queryKeys";
import type { ReactNode } from "react";
import type { Club, Match } from "../../api/types";
import { sideBy } from "../../helpers";
import CardSection from "../../ui/primitives/CardSection";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { buttonClass } from "../../ui/primitives/Button";
import RecordLine, { recordWidths, type RecordWidths } from "../../ui/primitives/RecordLine";
import { statsMatchupHref } from "../stats/statsNav";
import { MatchRowWithClubs } from "../stats/MatchHistoryList";
import {
  flattenRecentMatches,
  playerIds,
  playerNames,
  summarizeMatches,
  type Summary,
} from "../stats/h2h/matchupSummary";
import { fmtAvg, fmtDate } from "../../utils/format";

function SummaryCard({
  title,
  label,
  summary,
  widths,
  link,
}: {
  title: string;
  /** Who these numbers belong to — omitted where the button below already says it. */
  label?: string | null;
  summary: Summary;
  /** Column widths shared by every summary card on this panel (T14). */
  widths: RecordWidths;
  /**
   * The card's primary action: a real button into the stats matchup, which lists
   * every match behind these numbers (T7 — it used to be a small "All meetings"
   * text link that read like a footnote).
   */
  link?: { to: string; label: string; title: string; icon: ReactNode; primary?: boolean } | null;
}) {
  return (
    <div className="inset px-3 py-2.5">
      <h3 className="text-sm font-semibold text-text-normal">{title}</h3>
      {label ? <div className="mt-0.5 text-xs text-text-muted">{label}</div> : null}
      <RecordLine
        played={summary.played}
        wins={summary.wins}
        draws={summary.draws}
        losses={summary.losses}
        gf={summary.gf}
        ga={summary.ga}
        widths={widths}
        extra={`${fmtAvg(summary.ptsPerMatch)} ppm`}
        className="mt-2 font-mono text-xs text-text-muted"
      />
      {link ? (
        <Link
          to={link.to}
          title={link.title}
          className={buttonClass({
            variant: link.primary ? "solid" : "ghost",
            className: "mt-2.5 flex w-full items-center justify-center gap-2 no-underline",
          })}
        >
          {link.icon}
          <span className="truncate">{link.label}</span>
        </Link>
      ) : null}
    </div>
  );
}

/**
 * The match page's H2H numbers and every shortcut out of them use the same source:
 * **tournaments** (T7, Roli: "always use 'tournaments' and not both as default").
 * A tournament match is read in its tournament context, and the matchup the buttons
 * open then shows exactly the matches summarised here.
 */
const SCOPE = "tournaments" as const;

export default function MatchH2HPanel({
  match,
  clubs,
}: {
  match: Match;
  clubs: Club[];
}) {
  const aSide = sideBy(match, "A");
  const bSide = sideBy(match, "B");
  const aIds = useMemo(() => playerIds(aSide), [aSide]);
  const bIds = useMemo(() => playerIds(bSide), [bSide]);

  const mode = aIds.length === 2 && bIds.length === 2 ? "2v2" : aIds.length === 1 && bIds.length === 1 ? "1v1" : "overall";
  const showDuoStats = mode === "2v2";

  const matchupQuery = useQuery({
    queryKey: qk.matchH2h("opposed", mode, aIds, bIds),
    queryFn: () =>
      getStatsH2HMatches({
        mode,
        relation: "opposed",
        left_player_ids: aIds,
        right_player_ids: bIds,
        exact_teams: mode === "2v2",
        scope: SCOPE,
      }),
    enabled: aIds.length > 0 && bIds.length > 0,
    staleTime: 30_000,
  });

  const duoAQuery = useQuery({
    queryKey: qk.matchH2hDuo(aIds),
    queryFn: () =>
      getStatsH2HMatches({
        mode: "2v2",
        relation: "teammates",
        left_player_ids: aIds,
        scope: SCOPE,
      }),
    enabled: showDuoStats && aIds.length === 2,
    staleTime: 30_000,
  });

  const duoBQuery = useQuery({
    queryKey: qk.matchH2hDuo(bIds),
    queryFn: () =>
      getStatsH2HMatches({
        mode: "2v2",
        relation: "teammates",
        left_player_ids: bIds,
        scope: SCOPE,
      }),
    enabled: showDuoStats && bIds.length === 2,
    staleTime: 30_000,
  });

  const matchupSummary = useMemo(
    () => summarizeMatches(matchupQuery.data?.tournaments ?? [], aIds, bIds),
    [aIds, bIds, matchupQuery.data?.tournaments],
  );
  const duoASummary = useMemo(
    () => summarizeMatches(duoAQuery.data?.tournaments ?? [], aIds),
    [aIds, duoAQuery.data?.tournaments],
  );
  const duoBSummary = useMemo(
    () => summarizeMatches(duoBQuery.data?.tournaments ?? [], bIds),
    [bIds, duoBQuery.data?.tournaments],
  );
  // The three summary cards share one set of column widths (T14): two of them sit side
  // by side in a grid, so their lines have to line up with each other.
  const summaryWidths = useMemo(
    () => recordWidths([matchupSummary, duoASummary, duoBSummary]),
    [matchupSummary, duoASummary, duoBSummary],
  );
  const recentMatches = useMemo(
    () => flattenRecentMatches(matchupQuery.data?.tournaments ?? []).slice(0, 5),
    [matchupQuery.data?.tournaments],
  );

  if (!aIds.length || !bIds.length) {
    return <CardSection className="text-sm text-text-muted">H2H is unavailable until both sides have players.</CardSection>;
  }

  const loading = matchupQuery.isLoading || duoAQuery.isLoading || duoBQuery.isLoading;
  const error =
    (matchupQuery.error instanceof Error ? matchupQuery.error.message : null) ??
    (duoAQuery.error instanceof Error ? duoAQuery.error.message : null) ??
    (duoBQuery.error instanceof Error ? duoBQuery.error.message : null);

  return (
    <div className="space-y-3">
      <CardSection className="space-y-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-text-normal">
            {playerNames(aSide)} <span className="text-text-muted">vs</span> {playerNames(bSide)}
          </div>
          <div className="text-xs text-text-muted">
            H2H across tournaments{mode === "2v2" ? ", with exact team matchups" : ""}.
          </div>
        </div>

        {loading ? <InlineLoading label="Loading H2H…" /> : null}
        {error ? <div className="inset px-3 py-2 text-sm text-error">{error}</div> : null}

        {!loading && !error ? (
          <>
            {/* Every summary is a door into the stats matchup, which lists every match
                behind these numbers and keeps its own Mode / Source filters. */}
            <SummaryCard
              title={mode === "2v2" ? "Exact matchup" : "Head-to-head"}
              summary={matchupSummary}
              widths={summaryWidths}
              link={{
                // Both sides go into the link, so a 2v2 opens the *exact* team
                // matchup instead of the two first players (T7).
                to: statsMatchupHref({ mode, left: aIds, right: bIds, scope: SCOPE }),
                label: `All matches: ${playerNames(aSide)} vs ${playerNames(bSide)}`,
                title:
                  mode === "2v2"
                    ? `Head-to-head stats: every match ${playerNames(aSide)} played against ${playerNames(bSide)} in exactly this pairing`
                    : `Head-to-head stats: every match between ${playerNames(aSide)} and ${playerNames(bSide)}`,
                icon: <Swords size={16} aria-hidden="true" />,
                primary: true,
              }}
            />

            {showDuoStats ? (
              <div className="grid gap-2 md:grid-cols-2">
                <SummaryCard
                  title="Team A together"
                  label={playerNames(aSide)}
                  summary={duoASummary}
                  widths={summaryWidths}
                  link={{
                    to: statsMatchupHref({ mode: "2v2", left: [aIds[0]], right: [aIds[1]], scope: SCOPE, relation: "together" }),
                    label: `All matches as a team`,
                    title: `Head-to-head stats: every 2v2 match ${playerNames(aSide)} played as a team`,
                    icon: <Users size={16} aria-hidden="true" />,
                  }}
                />
                <SummaryCard
                  title="Team B together"
                  label={playerNames(bSide)}
                  summary={duoBSummary}
                  widths={summaryWidths}
                  link={{
                    to: statsMatchupHref({ mode: "2v2", left: [bIds[0]], right: [bIds[1]], scope: SCOPE, relation: "together" }),
                    label: `All matches as a team`,
                    title: `Head-to-head stats: every 2v2 match ${playerNames(bSide)} played as a team`,
                    icon: <Users size={16} aria-hidden="true" />,
                  }}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </CardSection>

      <CardSection className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-text-normal">Recent matches</div>
          <div className="text-xs text-text-muted">{matchupSummary.played} total</div>
        </div>

        {!loading && !error && matchupSummary.played === 0 ? (
          <div className="inset px-3 py-2 text-sm text-text-muted">No finished matches for this matchup yet.</div>
        ) : null}

        <div className="space-y-2">
          {recentMatches.map((item) => {
            return (
              <div key={item.key} className="space-y-1">
                {/* Two legs of the same fixture are the same two sides and often the
                    same scoreline, so without the leg the list read as duplicated rows
                    (A7). It is named the way the rest of the app names it — the meta
                    line of `MatchOverviewPanel`: `Match 4 · Leg 2`. */}
                <div className="flex items-center justify-between gap-2 px-1 text-xs text-text-muted">
                  <span className="truncate">{item.tournamentLabel}</span>
                  <span className="shrink-0 whitespace-nowrap">
                    Match {item.match.order_index + 1} · Leg {item.match.leg} · {fmtDate(item.tournamentDate) || "—"}
                  </span>
                </div>
                <MatchRowWithClubs
                  m={item.match}
                  focusId={aIds[0] ?? null}
                  clubs={clubs}
                  showMeta={false}
                />
              </div>
            );
          })}
        </div>
      </CardSection>
    </div>
  );
}
