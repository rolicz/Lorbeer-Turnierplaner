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
 *
 * The panel is **read-only everywhere**, editable surfaces included (T9): clubs
 * are picked in the club panel under it (`ui/SelectClubsPanel.tsx`), which holds
 * both slots, the filters and the randomisers in one block (`DESIGN.md` §9b).
 *
 * The panel **is** an `inset`, on every surface that shows a score (T8): dashboard
 * preview, live Overview, live Current, the match-detail edit preview, the friendly
 * form and the friendlies list's row editor. There is no `surface` prop any more —
 * a caller that wants the panel to look different is the bug. `data-match-panel`
 * marks it for tests, in the house style of `data-score-line`.
 */
import type { Club, Match, MatchSide, TournamentMode } from "../../api/types";
import { sideBy } from "../../helpers";
import { cn } from "../cn";
import MatchSides from "./MatchSides";
import { Pill, statusMatchPill } from "./Pill";
import ScoreLine from "./ScoreLine";
import { fmtOdd } from "../../utils/format";

function namesStack(side?: MatchSide): string[] {
  const ps = side?.players ?? [];
  if (!ps.length) return ["—"];
  return ps.map((p) => p.display_name);
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
  className,
}: {
  match: Match;
  clubs: Club[];
  mode?: TournamentMode | null;
  aGoals: number;
  bGoals: number;
  /** Adds the `1v1` / `2v2` token to the meta line. Off by default (DS8): inside a
   *  tournament the page header already says the mode, and a 2v2 score stacks two
   *  names per side anyway. Only a mixed-mode context (friendlies) turns it on. */
  showMode?: boolean;
  showOdds?: boolean;
  showOddsWhenFinished?: boolean;
  className?: string;
}) {
  const a = sideBy(match, "A");
  const b = sideBy(match, "B");

  const odds = match.odds ?? null;
  const showOddsLine =
    showOdds && !!odds && (showOddsWhenFinished || match.state === "scheduled" || match.state === "playing");

  return (
    <div data-match-panel="" className={cn("inset", className)}>
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

      <MatchSides
        className="mt-3"
        size="hero"
        clubs={clubs}
        aClubId={a?.club_id}
        bClubId={b?.club_id}
      />
    </div>
  );
}
