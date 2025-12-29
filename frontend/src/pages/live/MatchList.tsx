import Button from "../../ui/primitives/Button";
import type { Match } from "../../api/types";
import { sideBy } from "./helpers";

type State = Match["state"];

function palette(state: State) {
  switch (state) {
    case "playing":
      return {
        wrap: "border-emerald-800/60 bg-emerald-500/10 hover:bg-emerald-500/15 ring-1 ring-emerald-900/40",
        bar: "bg-emerald-400",
        pill: "text-emerald-100 border-emerald-800/60 bg-emerald-950/50",
        win: "text-emerald-100",
        lose: "text-zinc-300/80",
      };
    case "scheduled":
      return {
        wrap: "border-sky-800/60 bg-sky-500/10 hover:bg-sky-500/15 ring-1 ring-sky-900/40",
        bar: "bg-sky-400",
        pill: "text-sky-100 border-sky-800/60 bg-sky-950/50",
        win: "text-sky-100",
        lose: "text-zinc-300/80",
      };
    case "finished":
    default:
      return {
        wrap: "border-zinc-800 bg-zinc-950 hover:bg-zinc-900/20 ring-1 ring-transparent",
        bar: "bg-zinc-600",
        pill: "text-zinc-200 border-zinc-800 bg-zinc-900/30",
        win: "text-zinc-100",
        lose: "text-zinc-400",
      };
  }
}

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

export default function MatchList({
  matches,
  canEdit,
  canReorder,
  busyReorder,
  onEditMatch,
  onMoveUp,
  onMoveDown,
  clubLabel,
}: {
  matches: Match[];
  canEdit: boolean;
  canReorder: boolean;
  busyReorder: boolean;
  onEditMatch: (m: Match) => void;
  onMoveUp: (matchId: number) => void;
  onMoveDown: (matchId: number) => void;
  clubLabel: (id: number | null | undefined) => string;
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

        const pal = palette(m.state);
        const w = winnerSide(m);
        const aWin = w === "A";
        const bWin = w === "B";
        const hasWinner = w !== null;

        const showScore = m.state !== "scheduled";
        const ag = a?.goals ?? 0;
        const bg = b?.goals ?? 0;

        const scoreLeft = showScore ? String(ag) : "-";
        const scoreRight = showScore ? String(bg) : "-";

        const showMove = canReorder && m.state === "scheduled";

        return (
          <div
            key={m.id}
            className={`relative overflow-hidden rounded-xl border px-4 py-3 transition-colors ${pal.wrap}`}
          >
            <div className={`absolute left-0 top-0 h-full w-2 ${pal.bar}`} />

            <button
              className="block w-full text-left disabled:opacity-80"
              onClick={() => (canEdit ? onEditMatch(m) : undefined)}
              disabled={!canEdit}
              title={canEdit ? "Edit match" : "Login as editor/admin to edit"}
            >
              {/* Top row: state + leg + move arrows (scheduled only) */}
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${pal.pill}`}>{m.state}</span>
                  <span className="text-xs text-zinc-500">leg {m.leg}</span>
                </div>

                {showMove && (
                  <div className="flex items-center gap-1">
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
                      ↑
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
                      ↓
                    </Button>
                  </div>
                )}
              </div>

              {/* Row 1: players + centered score */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                {/* Team A players */}
                <div className="min-w-0">
                  <div className={`space-y-0.5 ${hasWinner && !aWin ? pal.lose : pal.win}`}>
                    {aPlayers.map((n, i) => (
                      <div key={i} className="truncate text-[15px] font-semibold leading-snug">
                        {n}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Score centered */}
                <div className="justify-self-center">
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-1.5">
                    <span className={`text-xl font-semibold tabular-nums ${aWin ? pal.win : "text-zinc-100"}`}>
                      {scoreLeft}
                    </span>
                    <span className="text-zinc-500">:</span>
                    <span className={`text-xl font-semibold tabular-nums ${bWin ? pal.win : "text-zinc-100"}`}>
                      {scoreRight}
                    </span>
                  </div>
                </div>

                {/* Team B players */}
                <div className="min-w-0 text-right">
                  <div className={`space-y-0.5 ${hasWinner && !bWin ? pal.lose : pal.win}`}>
                    {bPlayers.map((n, i) => (
                      <div key={i} className="truncate text-[15px] font-semibold leading-snug">
                        {n}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Row 2: clubs (more space now) */}
              <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                <div
                  className={`min-w-0 whitespace-normal break-words ${
                    hasWinner && !aWin ? "text-zinc-500" : "text-zinc-300"
                  }`}
                >
                  {clubLabel(a?.club_id)}
                </div>
                <div
                  className={`min-w-0 text-right whitespace-normal break-words ${
                    hasWinner && !bWin ? "text-zinc-500" : "text-zinc-300"
                  }`}
                >
                  {clubLabel(b?.club_id)}
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
