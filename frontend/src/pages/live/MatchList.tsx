import Button from "../../ui/primitives/Button";
import type { Match } from "../../api/types";
import { sideBy } from "./helpers";

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

        return (
          <div key={m.id} className="rounded-xl border border-zinc-800 px-4 py-3 hover:bg-zinc-900/20">
            <div className="flex items-start justify-between gap-2">
              <button
                className="min-w-0 flex-1 text-left disabled:opacity-80"
                onClick={() => (canEdit ? onEditMatch(m) : undefined)}
                disabled={!canEdit}
                title={canEdit ? "Edit match" : "Login as editor/admin to edit"}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 font-medium">
                    <span className="truncate">{aNames}</span>{" "}
                    <span className="text-zinc-400">vs</span>{" "}
                    <span className="truncate">{bNames}</span>
                  </div>
                  <div className="shrink-0 text-sm text-zinc-400">
                    leg {m.leg} · {m.state}
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-sm">
                  <div className="text-zinc-200">
                    {a?.goals ?? 0} : {b?.goals ?? 0}
                  </div>
                  <div className="text-zinc-500">#{m.id}</div>
                </div>

                <div className="mt-1 text-xs text-zinc-500">
                  {clubLabel(a?.club_id)} - {clubLabel(b?.club_id)}
                </div>
              </button>

              {canReorder && (
                <div className="flex flex-col gap-2">
                  <Button variant="ghost" onClick={() => onMoveUp(m.id)} disabled={busyReorder} title="Move up">
                    ↑
                  </Button>
                  <Button variant="ghost" onClick={() => onMoveDown(m.id)} disabled={busyReorder} title="Move down">
                    ↓
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
