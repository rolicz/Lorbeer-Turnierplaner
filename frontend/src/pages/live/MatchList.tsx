import Button from "../../ui/primitives/Button";
import type { Club, Match } from "../../api/types";
import { sideBy } from "../../helpers";
import { Pill, statusMatchPill, colorMatch } from "../../ui/primitives/Pill";
import { matchPalette } from "../../ui/theme";
import SectionHeader from "../../ui/primitives/SectionHeader";
import { StarsFA } from "../../ui/primitives/StarsFA";
import { clubLabelPartsById } from "../../ui/clubControls";

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

function fmtOdd(x: number) {
  return Number.isFinite(x) ? x.toFixed(2) : "—";
}

function OddsInline({ odds }: { odds: { home: number; draw: number; away: number } }) {
  return (
    <div className="mt-1 flex items-center justify-center">
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
  onSwapSides: (matchId: number) => Promise<any>;
  onMoveUp: (matchId: number) => void;
  onMoveDown: (matchId: number) => void;
}) {
  return (
    <div className="space-y-2">
      {matches.map((m) => {
        const a = sideBy(m, "A");
        const b = sideBy(m, "B");

        const aNames = a?.players.map((p) => p.display_name).join(" + ") ?? "—";
        const bNames = b?.players.map((p) => p.display_name).join(" + ") ?? "—";
        const aPlayers = splitPlayers(aNames);
        const bPlayers = splitPlayers(bNames);

        const pal = matchPalette(m.state);
        const w = winnerSide(m);
        const aWin = w === "A";
        const bWin = w === "B";
        const hasWinner = w !== null;
        const isDraw = aWin === bWin;

        const showScore = m.state !== "scheduled";
        const ag = a?.goals ?? 0;
        const bg = b?.goals ?? 0;

        const scoreLeft = showScore ? String(ag) : "-";
        const scoreRight = showScore ? String(bg) : "-";

        // For bolding: use the current leader for playing/finished (and keep draws neutral).
        const leader: "A" | "B" | null = !showScore || ag === bg ? null : ag > bg ? "A" : "B";

        const aClubParts = clubLabelPartsById(clubs, a?.club_id);
        const bClubParts = clubLabelPartsById(clubs, b?.club_id);

        const showMove = canReorder && m.state === "scheduled";
        const showSwap = canEdit;
        const showOdds = (m.state === "scheduled" || m.state === "playing") && !!m.odds;
        const odds = m.odds ?? null;

        return (
          <div
            key={m.id}
            className={`relative overflow-hidden rounded-xl border px-3 py-2.5 transition-colors ${pal.wrap} ${colorMatch(m.state)}`}
          >
            <div className={`absolute left-0 top-0 h-full w-2 ${pal.bar}`} />

            <div
              className={`block w-full text-left ${canEdit ? "cursor-pointer" : "cursor-default opacity-80"}`}
              onClick={() => (canEdit ? onEditMatch(m) : undefined)}
              onKeyDown={(e) => {
                if (!canEdit) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEditMatch(m);
                }
              }}
              role="button"
              tabIndex={canEdit ? 0 : -1}
              title={canEdit ? "Edit match" : "Login as editor/admin to edit"}
            >
              {/* Top row: state + leg + move arrows (scheduled only) */}
              <SectionHeader
                className="mb-1.5"
                left={
                  <div className="flex items-center gap-2">
                    <Pill className={`min-w-24 ${statusMatchPill(m.state)}`}>{m.state}</Pill>
                    <Pill>leg {m.leg}</Pill>
                  </div>
                }
                right={
                  showMove || showSwap ? (
                    <div className="flex items-center gap-1">
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
                            title="Move up"
                          >
                            <i className="fa fa-arrow-up md:hidden text-text-normal" aria-hidden="true" />
                            <span className="hidden md:inline text-text-normal">Move up</span>
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onMoveDown(m.id);
                            }}
                            disabled={busyReorder}
                            title="Move down"
                          >
                            <i className="fa fa-arrow-down md:hidden text-text-normal" aria-hidden="true" />
                            <span className="hidden md:inline text-text-normal">Move down</span>
                          </Button>
                        </>
                      ) : null}

                      {showSwap ? (
                        <Button
                          variant="ghost"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSwapSides(m.id);
                          }}
                          disabled={busyReorder}
                          title="Swap sides"
                        >
                          <i className="fa fa-arrow-right-arrow-left md:hidden text-text-normal" aria-hidden="true" />
                          <span className="hidden md:inline text-text-normal">Swap Home/Away</span>
                        </Button>
                      ) : null}
                    </div>
                  ) : null
                }
              />

              {/* Odds (scheduled/live only) */}
              {showOdds && odds ? <OddsInline odds={odds} /> : null}

              {/* Row 1: players + centered score */}
              <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                {/* Team A players */}
                <div className="min-w-0">
                  <div
                    className={`space-y-0.5 ${
                      hasWinner && !isDraw ? (!aWin ? pal.lose : pal.win) : "text-text-normal"
                    }`}
                  >
                    {aPlayers.map((n, i) => (
                      <div
                        key={i}
                        className={`truncate text-[15px] leading-snug ${
                          leader === "A" ? "font-black" : "font-medium"
                        }`}
                      >
                        {n}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Score centered */}
                <div className="justify-self-center">
                  <div className="card-chip flex items-center justify-center gap-2">
                    <span className="text-xl font-semibold tabular-nums">
                      {scoreLeft}
                    </span>
                    <span className="text-text-muted">:</span>
                    <span className="text-xl font-semibold tabular-nums">
                      {scoreRight}
                    </span>
                  </div>
                </div>

                {/* Team B players */}
                <div className="min-w-0 text-right">
                  <div
                    className={`space-y-0.5 ${
                      hasWinner && !isDraw ? (!bWin ? pal.lose : pal.win) : "text-text-normal"
                    }`}
                  >
                    {bPlayers.map((n, i) => (
                      <div
                        key={i}
                        className={`truncate text-[15px] leading-snug ${
                          leader === "B" ? "font-black" : "font-medium"
                        }`}
                      >
                        {n}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row 2: clubs (like Current Game) */}
              <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-xs text-text-muted">
                <div className="min-w-0 whitespace-normal break-words leading-tight">{aClubParts.name}</div>
                <div />
                <div className="min-w-0 text-right whitespace-normal break-words leading-tight">{bClubParts.name}</div>
              </div>

              {/* Row 3: leagues */}
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-xs text-text-muted">
                <div className="min-w-0 whitespace-normal break-words leading-tight">{aClubParts.league_name}</div>
                <div />
                <div className="min-w-0 text-right whitespace-normal break-words leading-tight">{bClubParts.league_name}</div>
              </div>

              {/* Row 4: stars */}
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-[11px] text-text-muted">
                <div className="min-w-0">
                  <StarsFA rating={aClubParts.rating ?? 0} textClassName="text-text-muted" />
                </div>
                <div />
                <div className="min-w-0 flex justify-end">
                  <StarsFA rating={bClubParts.rating ?? 0} textClassName="text-text-muted" />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
