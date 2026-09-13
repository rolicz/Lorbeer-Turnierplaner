import { ArrowDown, ArrowRightLeft, ArrowUp, Layers, List, Shrink } from "lucide-react";

import Button from "../../ui/primitives/Button";
import type { Club, Match } from "../../api/types";
import { teamName } from "../../utils/matchDisplay";
import { sideBy } from "../../helpers";
import MatchSides from "../../ui/primitives/MatchSides";
import ScoreLine from "../../ui/primitives/ScoreLine";
import { clubLabelPartsById } from "../../ui/clubControls";
import ClubBadge from "../../ui/ClubBadge";
import { useEffect, useState } from "react";
import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";
import { fmtOdd } from "../../utils/format";

function splitPlayers(names: string): string[] {
  return names.split(" + ").map((s) => s.trim()).filter(Boolean);
}

/** The quiet mono odds line of `DESIGN.md` §8, same shape as the hero panel's. */
function OddsInline({ odds }: { odds: { home: number; draw: number; away: number } }) {
  return (
    <div className="font-mono text-xs tabular-nums text-text-muted">
      1 {fmtOdd(Number(odds.home))} · X {fmtOdd(Number(odds.draw))} · 2 {fmtOdd(Number(odds.away))}
    </div>
  );
}

type MatchListView = "compact" | "comfort";

export default function MatchList({
  matches,
  clubs,
  canEdit,
  canReorder,
  busyReorder,
  onEditMatch,
  onSwapSides,
  onMoveUp,
  onMoveDown,
}: {
  matches: Match[];
  clubs: Club[];
  canEdit: boolean;
  canReorder: boolean;
  busyReorder: boolean;
  onEditMatch: (m: Match) => void;
  onSwapSides: (matchId: number) => Promise<unknown>;
  onMoveUp: (matchId: number) => void;
  onMoveDown: (matchId: number) => void;
}) {
  const [view, setView] = useState<MatchListView>(() => {
    const stored = localStorage.getItem("match_list_view");
    if (stored === "compact" || stored === "comfort") return stored;
    // Details by default (user request 2026-08); the choice sticks via localStorage.
    return "comfort";
  });

  useEffect(() => {
    localStorage.setItem("match_list_view", view);
  }, [view]);

  const compact = view === "compact";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="section-label inline-flex items-center gap-1.5">
          <Layers size={14} aria-hidden="true" />
          <span>{matches.length} matches</span>
        </div>
        <SegmentedSwitch<MatchListView>
          value={view}
          onChange={setView}
          options={[
            { key: "compact", label: "Compact", icon: <Shrink size={14} aria-hidden="true" /> },
            { key: "comfort", label: "Details", icon: <List size={14} aria-hidden="true" /> },
          ]}
          widthClass="w-12 sm:w-16"
          ariaLabel="Matches view"
          title="Matches view"
        />
      </div>

      <div className="list-divided">
        {matches.map((m) => {
          const a = sideBy(m, "A");
          const b = sideBy(m, "B");

          const aPlayers = splitPlayers(teamName(a));
          const bPlayers = splitPlayers(teamName(b));
          if (!aPlayers.length) aPlayers.push("—");
          if (!bPlayers.length) bPlayers.push("—");

          const statusTextCls =
            m.state === "playing"
              ? "text-status-text-green"
              : m.state === "scheduled"
                ? "text-status-text-blue"
                : "text-status-text-default";
          const dotCls =
            m.state === "playing"
              ? "bg-status-text-green"
              : m.state === "scheduled"
                ? "bg-status-text-blue"
                : "bg-text-muted/60";

          const ag = a?.goals ?? 0;
          const bg = b?.goals ?? 0;

          const aClubParts = clubLabelPartsById(clubs, a?.club_id);
          const bClubParts = clubLabelPartsById(clubs, b?.club_id);

          // "No club" (and unresolved ids) render no symbol — only real clubs do.
          const aHasClub = clubs.some((c) => c.id === a?.club_id);
          const bHasClub = clubs.some((c) => c.id === b?.club_id);

          const showMove = canReorder && m.state === "scheduled";
          const showOdds = (m.state === "scheduled" || m.state === "playing") && !!m.odds;
          const odds = m.odds ?? null;

          // Compact rows carry no club detail lines, so the club symbol travels with the
          // names — on the inner edge, where it sits right next to the score.
          const withBadge = (players: string[], side: "A" | "B") => {
            const parts = side === "A" ? aClubParts : bClubParts;
            const hasClub = side === "A" ? aHasClub : bHasClub;
            if (!compact || !hasClub) return players;
            const badge = (
              <ClubBadge
                key="badge"
                name={parts.name}
                nation={parts.national_nation}
                clubId={parts.id}
                crestVersion={parts.crest_updated_at}
              />
            );
            const names = (
              <div key="names" className="min-w-0">
                {players.map((n, i) => (
                  <div key={i}>{n}</div>
                ))}
              </div>
            );
            return [
              <div key="side" className={`flex items-center gap-1.5 ${side === "A" ? "justify-end" : ""}`}>
                {side === "A" ? [names, badge] : [badge, names]}
              </div>,
            ];
          };

          return (
            <div key={m.id} id={`match-row-${m.id}`} className="scroll-mt-28 sm:scroll-mt-24">
              <div
                className="row-tap -mx-2 cursor-pointer px-2 py-2"
                onClick={() => onEditMatch(m)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEditMatch(m);
                  }
                }}
                role="button"
                tabIndex={0}
                title={canEdit ? "Open H2H or edit match" : "Open H2H"}
              >
                {/* Meta line: status + order + leg, with reorder/swap actions */}
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotCls}`} aria-hidden="true" />
                    <span className="text-text-muted">#{m.order_index + 1}</span>
                    <span className={statusTextCls}>{m.state}</span>
                    <span className="text-text-muted/50">·</span>
                    <span className="text-text-muted">leg {m.leg}</span>
                  </div>

                  {showMove || canEdit ? (
                    <div className="flex shrink-0 items-center gap-1">
                      {showMove ? (
                        <>
                          <Button
                            variant="ghost"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onMoveUp(m.id);
                            }}
                            disabled={busyReorder}
                            className="h-8 w-8 p-0 inline-flex items-center justify-center"
                            title="Move up"
                          >
                            <ArrowUp size={14} className="text-text-normal" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onMoveDown(m.id);
                            }}
                            disabled={busyReorder}
                            className="h-8 w-8 p-0 inline-flex items-center justify-center"
                            title="Move down"
                          >
                            <ArrowDown size={14} className="text-text-normal" aria-hidden="true" />
                          </Button>
                        </>
                      ) : null}
                      {canEdit ? (
                        <Button
                          variant="ghost"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void onSwapSides(m.id);
                          }}
                          disabled={busyReorder}
                          className="h-8 w-8 p-0 inline-flex items-center justify-center"
                          title="Swap sides"
                        >
                          <ArrowRightLeft size={14} className="text-text-normal" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {/* Main row: the one score rendering (DESIGN.md §8). */}
                <ScoreLine
                  size={compact ? "sm" : "md"}
                  state={m.state}
                  leftNames={withBadge(aPlayers, "A")}
                  rightNames={withBadge(bPlayers, "B")}
                  leftGoals={ag}
                  rightGoals={bg}
                />

                {/* Odds (details only, scheduled/playing) */}
                {!compact && showOdds && odds ? (
                  <div className="mt-1.5 flex justify-center">
                    <OddsInline odds={odds} />
                  </div>
                ) : null}

                {/* Details: clubs / leagues / stars */}
                {!compact ? (
                  <MatchSides className="mt-1.5" clubs={clubs} aClubId={a?.club_id} bClubId={b?.club_id} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
