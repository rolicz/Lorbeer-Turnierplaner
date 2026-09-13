import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Trophy } from "lucide-react";

import type { Club, Match, MatchSide, TournamentMode } from "../../api/types";
import { sideBy } from "../../helpers";
import { pickPreviewMatch } from "../../utils/matchDisplay";
import MatchOverviewPanel from "../../ui/primitives/MatchOverviewPanel";
import TournamentMetaPills from "./TournamentMetaPills";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import Button from "../../ui/primitives/Button";
import PlayerLink from "../../ui/primitives/PlayerLink";
import ScoreLine from "../../ui/primitives/ScoreLine";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { useCupHolders } from "../../hooks/useCupHolders";
import {
  computeFinishedStandings,
  resolveTournamentOutcome,
  type DeciderLite,
  type PlayerLite,
} from "./tournamentStandings";

/** The decider in one word, for the winner line. */
function deciderLabel(type: string): string {
  if (type === "penalties") return "penalties";
  if (type === "match") return "an extra match";
  if (type === "scheresteinpapier") return "Schere-Stein-Papier";
  return "a decider";
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

/** One name per line, so a 2v2 side stacks the way every other match row does (`DESIGN.md` §8). */
function sideNames(side?: MatchSide | null): string[] {
  const names = (side?.players ?? []).map((p) => p.display_name).filter(Boolean);
  return names.length ? names : ["—"];
}

/**
 * Read-only "at a glance" tab. One skeleton, two states — only the lead block
 * differs (T12):
 *
 *   live/draft:  current match → standings → next matches → played matches
 *   done:        winner        → final standings          → played matches
 *
 * Both list blocks are complete — every player, every match played, in playing
 * order — and each ends with one quiet link naming the tab that can act on it
 * (T15). Nothing on this tab hides rows behind a "show all".
 *
 * A finished tournament has no "current" match; presenting its last game as if
 * it were happening now is exactly what this tab used to get wrong. Everything
 * below the lead is the same block in both states, and every tap either
 * switches to the tab that owns the full thing or opens the match page.
 */
export default function OverviewSection({
  tournamentId,
  mode,
  date,
  isDone,
  decider,
  matches,
  players,
  clubs,
  onOpenCurrentMatch,
  onGoToStandings,
  onGoToMatches,
}: {
  tournamentId: number;
  mode?: TournamentMode | null;
  date?: string | null;
  /** Every match played — the tournament is over and there is a result to lead with. */
  isDone: boolean;
  decider?: DeciderLite | null;
  matches: Match[];
  players: PlayerLite[];
  clubs: Club[];
  onOpenCurrentMatch: (match: Match) => void;
  onGoToStandings: () => void;
  onGoToMatches: () => void;
}) {
  const previewMatch = useMemo(() => (isDone ? null : pickPreviewMatch(matches)), [matches, isDone]);
  const pa = previewMatch ? sideBy(previewMatch, "A") : undefined;
  const pb = previewMatch ? sideBy(previewMatch, "B") : undefined;

  const standings = useMemo(
    () => computeFinishedStandings(matches, players, { includePlaying: true }),
    [matches, players],
  );

  const outcome = useMemo(
    () => (isDone ? resolveTournamentOutcome(standings, decider) : null),
    [isDone, standings, decider],
  );

  const { avatarUpdatedAtById } = usePlayerAvatarMap({ enabled: isDone });
  const { cupsHeldByPlayerId } = useCupHolders({ enabled: isDone });

  const nextMatches = useMemo(() => {
    const excludeId = previewMatch?.id ?? null;
    return matches
      .filter((m) => m.state === "scheduled" && m.id !== excludeId)
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .slice(0, 3);
  }, [matches, previewMatch]);

  // Playing order, every one of them (T15-D): this block *is* the Matches tab's
  // list, so it reads in the same direction, and the `#N` markers count up.
  const played = useMemo(
    () =>
      matches
        .filter((m) => m.state === "finished")
        .slice()
        .sort((a, b) => a.order_index - b.order_index),
    [matches],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* The tournament's own meta (T10). On desktop it sits next to the page
          title, so this copy is the phone's — the page header is gone there. */}
      <TournamentMetaPills mode={mode} date={date} className="lg:hidden" />

      {isDone && outcome ? (
        <div>
          <div className="section-head">
            <span className="section-label">Winner</span>
          </div>
          {outcome.kind === "winner" ? (
            <div className="inset flex items-center gap-3">
              <Trophy size={20} className="shrink-0 text-gradient-gold-from" aria-hidden="true" />
              <PlayerLink
                playerId={outcome.row.playerId}
                name={outcome.row.name}
                decorative
                className="shrink-0"
              >
                <AvatarCircle
                  playerId={outcome.row.playerId}
                  name={outcome.row.name}
                  updatedAt={avatarUpdatedAtById.get(outcome.row.playerId) ?? null}
                  sizeClass="h-10 w-10"
                  cups={cupsHeldByPlayerId.get(outcome.row.playerId)}
                />
              </PlayerLink>
              <div className="min-w-0 flex-1">
                <PlayerLink
                  playerId={outcome.row.playerId}
                  name={outcome.row.name}
                  className="block truncate text-lg font-semibold text-text-normal"
                >
                  {outcome.row.name}
                </PlayerLink>
                <div className="text-xs text-text-muted">
                  {outcome.viaDecider
                    ? `Tied at the top · won ${deciderLabel(decider?.type ?? "none")}`
                    : `${outcome.row.played} matches · GD ${signed(outcome.row.gd)}`}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-2xl font-bold tabular-nums text-text-normal">{outcome.row.pts}</div>
                <div className="text-micro leading-none text-text-muted">pts</div>
              </div>
            </div>
          ) : outcome.kind === "tie" ? (
            <div className="inset">
              <div className="text-sm text-text-normal">No winner — it ended level at the top.</div>
              <div className="mt-0.5 text-xs text-text-muted">
                {outcome.candidates.map((c) => c.name).join(" · ")} finished on the same points, goal difference
                and goals.
              </div>
            </div>
          ) : (
            <div className="inset text-sm text-text-muted">No players in this tournament.</div>
          )}
        </div>
      ) : (
        <div>
          <div className="section-head">
            <span className="section-label">Current match</span>
          </div>
          {previewMatch ? (
            <button
              type="button"
              onClick={() => onOpenCurrentMatch(previewMatch)}
              className="focus-ring block w-full rounded-xl text-left transition"
            >
              <MatchOverviewPanel
                match={previewMatch}
                clubs={clubs}
                mode={mode}
                showOdds={true}
                aGoals={Number(pa?.goals ?? 0)}
                bGoals={Number(pb?.goals ?? 0)}
              />
            </button>
          ) : (
            <div className="inset text-sm text-text-muted">No matches yet.</div>
          )}
        </div>
      )}

      <div>
        <div className="section-head">
          <span className="section-label">{isDone ? "Final standings" : "Standings"}</span>
        </div>
        <button
          type="button"
          onClick={onGoToStandings}
          className="inset block w-full p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
          aria-label={isDone ? "Open results" : "Open standings"}
        >
          <div className="flex items-center gap-2 px-1.5 py-0.5 text-xs uppercase tracking-wide text-text-muted">
            <span className="w-4 text-right">#</span>
            <span className="min-w-0 flex-1">Player</span>
            <span className="w-5 text-right">P</span>
            <span className="w-7 text-right">GD</span>
            <span className="w-6 text-right">Pts</span>
          </div>
          {standings.map((r, idx) => (
            <div
              key={r.playerId}
              className={
                "flex items-center gap-2 px-1.5 py-0.5 text-xs tabular-nums " +
                (idx === 0 ? "font-semibold text-text-normal" : "text-text-muted")
              }
            >
              <span className="w-4 text-right">{idx + 1}</span>
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="w-5 text-right">{r.played}</span>
              <span className="w-7 text-right">{signed(r.gd)}</span>
              <span className="w-6 text-right">{r.pts}</span>
            </div>
          ))}
        </button>
      </div>

      {!isDone && nextMatches.length ? (
        <div>
          <div className="section-head">
            <span className="section-label">Next matches</span>
          </div>
          <button
            type="button"
            onClick={onGoToMatches}
            className="inset block w-full p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
            aria-label="Open matches"
          >
            {nextMatches.map((m) => (
              <div key={m.id} className="flex items-center gap-2 px-1.5 py-1">
                <span className="w-6 shrink-0 text-xs text-text-muted">#{m.order_index + 1}</span>
                <ScoreLine
                  size="sm"
                  state="scheduled"
                  className="min-w-0 flex-1"
                  leftNames={sideNames(sideBy(m, "A"))}
                  rightNames={sideNames(sideBy(m, "B"))}
                />
              </div>
            ))}
          </button>
        </div>
      ) : null}

      {played.length ? (
        <div>
          <div className="section-head">
            <span className="section-label">Played matches</span>
            {/* Every match is already here, so the link promises no extra rows —
                it names the tab it opens, where the same list can be acted on
                (Compact/Details, reorder, swap sides). */}
            <div className="order-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={onGoToMatches}
                title="Open the Matches tab, where this list can be reordered and shown in detail"
                className="gap-1.5"
              >
                <span>Open Matches</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="inset p-1.5">
            <div className="list-divided">
              {played.map((m) => {
                const a = sideBy(m, "A");
                const b = sideBy(m, "B");
                return (
                  <Link
                    key={m.id}
                    to={`/live/${tournamentId}/match/${m.id}`}
                    state={{ fromTab: "overview" }}
                    aria-label="Open match"
                    className="row-tap focus-ring flex items-center gap-2 px-1.5 py-2 no-underline"
                  >
                    <span className="w-6 shrink-0 text-xs text-text-muted">#{m.order_index + 1}</span>
                    <ScoreLine
                      size="sm"
                      state="finished"
                      className="min-w-0 flex-1"
                      leftNames={sideNames(a)}
                      rightNames={sideNames(b)}
                      leftGoals={Number(a?.goals ?? 0)}
                      rightGoals={Number(b?.goals ?? 0)}
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
