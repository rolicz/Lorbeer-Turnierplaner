/** Best-duos leaderboard (2v2) — ranked list from `best_teammates_2v2`. */
import EmptyState from "../../../ui/primitives/EmptyState";
import RecordLine, { recordWidths } from "../../../ui/primitives/RecordLine";
import type { StatsH2HDuo } from "../../../api/types";
import { duoKey } from "../h2hHelpers";

export function DuoLeaderboard({
  duos,
  selectedKey,
  onSelect,
}: {
  duos: StatsH2HDuo[];
  selectedKey: string | null;
  onSelect: (d: StatsH2HDuo) => void;
}) {
  const widths = recordWidths(duos);
  if (!duos.length) return <EmptyState title="No 2v2 duos yet." className="py-2" />;
  return (
    <div className="list-divided">
      {duos.map((d, i) => {
        const k = duoKey(d.p1.id, d.p2.id);
        const on = k === selectedKey;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(d)}
            className={"row row-tap " + (on ? "bg-accent/10" : "")}
          >
            <span className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-text-normal">
              {d.p1.display_name} <span className="text-text-muted">/</span> {d.p2.display_name}
            </span>
            <RecordLine
              played={d.played}
              wins={d.wins}
              draws={d.draws}
              losses={d.losses}
              gd={d.gd}
              gdLabel=""
              widths={widths}
              className="shrink-0 font-mono text-xs text-text-muted"
            />
            <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-accent">{d.pts_per_match.toFixed(2)}</span>
          </button>
        );
      })}
    </div>
  );
}
