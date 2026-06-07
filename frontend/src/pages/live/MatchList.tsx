import Button from "../../ui/primitives/Button";
import type { Club, Match } from "../../api/types";
import { sideBy } from "../../helpers";
import { matchPalette } from "../../ui/theme";
import { StarsFA } from "../../ui/primitives/StarsFA";
import { clubLabelPartsById } from "../../ui/clubControls";
import { useEffect, useState } from "react";
import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";
import { fmtOdd } from "../../utils/format";

function winnerSide(m: Match): "A" | "B" | null {
  if (m.state !== "finished") return null;
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const ag = a?.goals ?? 0;
  const bg = b?.goals ?? 0;
  if (ag === bg) return null;
  return ag > bg ? "A" : "B";
}

function splitPlayers(names: string): string[] {
  return names.split(" + ").map((s) => s.trim()).filter(Boolean);
}

function OddsInline({ odds }: { odds: { home: number; draw: number; away: number } }) {
  return (
    <div className="inline-flex items-center gap-2 text-[11px]">
      <span className="inline-flex items-baseline gap-1">
        <span className="font-semibold text-text-muted">1</span>
        <span className="font-mono tabular-nums text-text-normal">{fmtOdd(Number(odds.home))}</span>
      </span>
      <span className="text-text-muted/50">|</span>
      <span className="inline-flex items-baseline gap-1">
        <span className="font-semibold text-text-muted">X</span>
        <span className="font-mono tabular-nums text-text-normal">{fmtOdd(Number(odds.draw))}</span>
      </span>
      <span className="text-text-muted/50">|</span>
      <span className="inline-flex items-baseline gap-1">
        <span className="font-semibold text-text-muted">2</span>
        <span className="font-mono tabular-nums text-text-normal">{fmtOdd(Number(odds.away))}</span>
      </span>
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
    try {
      return window.matchMedia && window.matchMedia("(max-width: 639px)").matches ? "compact" : "comfort";
    } catch {
      return "comfort";
    }
  });

  useEffect(() => {
    localStorage.setItem("match_list_view", view);
  }, [view]);

  const compact = view === "compact";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="section-label inline-flex items-center gap-1.5">
          <i className="fa-solid fa-layer-group" aria-hidden="true" />
          <span>{matches.length} matches</span>
        </div>
        <SegmentedSwitch<MatchListView>
          value={view}
          onChange={setView}
          options={[
            { key: "compact", label: "Compact", icon: "fa-compress" },
            { key: "comfort", label: "Details", icon: "fa-list" },
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

          const aPlayers = splitPlayers(a?.players.map((p) => p.display_name).join(" + ") ?? "—");
          const bPlayers = splitPlayers(b?.players.map((p) => p.display_name).join(" + ") ?? "—");
          if (!aPlayers.length) aPlayers.push("—");
          if (!bPlayers.length) bPlayers.push("—");

          const pal = matchPalette(m.state);
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

          const w = winnerSide(m);
          const hasWinner = w !== null;
          const isDraw = w === null && m.state === "finished";

          const showScore = m.state !== "scheduled";
          const ag = a?.goals ?? 0;
          const bg = b?.goals ?? 0;
          const leader: "A" | "B" | null = !showScore || ag === bg ? null : ag > bg ? "A" : "B";

          const aClubParts = clubLabelPartsById(clubs, a?.club_id);
          const bClubParts = clubLabelPartsById(clubs, b?.club_id);

          const showMove = canReorder && m.state === "scheduled";
          const showOdds = (m.state === "scheduled" || m.state === "playing") && !!m.odds;
          const odds = m.odds ?? null;

          const aNameColor = hasWinner && !isDraw ? (w === "A" ? pal.win : pal.lose) : "text-text-normal";
          const bNameColor = hasWinner && !isDraw ? (w === "B" ? pal.win : pal.lose) : "text-text-normal";

          const renderNames = (players: string[], colorCls: string, side: "A" | "B") => (
            <div className={`min-w-0 ${side === "B" ? "text-right" : ""} ${colorCls}`}>
              {players.map((n, i) => (
                <div
                  key={i}
                  className={`whitespace-normal break-words leading-tight ${compact ? "text-[13px]" : "text-[15px]"} ${
                    leader === side ? "font-bold" : "font-medium"
                  }`}
                >
                  {n}
                </div>
              ))}
            </div>
          );

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
                            <i className="fa fa-arrow-up text-text-normal" aria-hidden="true" />
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
                            <i className="fa fa-arrow-down text-text-normal" aria-hidden="true" />
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
                          <i className="fa fa-arrow-right-arrow-left text-text-normal" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {/* Main row: players + centered score */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                  {renderNames(aPlayers, aNameColor, "A")}

                  <div className="card-chip flex items-center justify-center gap-2 justify-self-center border border-border-card-inner/45 bg-bg-card-chip/30 px-3 py-1.5">
                    <span className={(compact ? "text-base" : "text-lg") + " font-semibold tabular-nums"}>
                      {showScore ? String(ag) : "-"}
                    </span>
                    <span className="text-text-muted">:</span>
                    <span className={(compact ? "text-base" : "text-lg") + " font-semibold tabular-nums"}>
                      {showScore ? String(bg) : "-"}
                    </span>
                  </div>

                  {renderNames(bPlayers, bNameColor, "B")}
                </div>

                {/* Odds (details only, scheduled/playing) */}
                {!compact && showOdds && odds ? (
                  <div className="mt-1.5 flex justify-center">
                    <OddsInline odds={odds} />
                  </div>
                ) : null}

                {/* Details: clubs / leagues / stars */}
                {!compact ? (
                  <>
                    <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-xs text-text-muted">
                      <div className="min-w-0 whitespace-normal break-words leading-tight">{aClubParts.name}</div>
                      <div />
                      <div className="min-w-0 whitespace-normal break-words text-right leading-tight">{bClubParts.name}</div>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-xs text-text-muted">
                      <div className="min-w-0 whitespace-normal break-words leading-tight">{aClubParts.league_name}</div>
                      <div />
                      <div className="min-w-0 whitespace-normal break-words text-right leading-tight">{bClubParts.league_name}</div>
                    </div>
                    <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-[11px] text-text-muted">
                      <div className="min-w-0">
                        <StarsFA rating={aClubParts.rating ?? 0} textClassName="text-text-muted" />
                      </div>
                      <div />
                      <div className="flex min-w-0 justify-end">
                        <StarsFA rating={bClubParts.rating ?? 0} textClassName="text-text-muted" />
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
