/** Best-duos leaderboard (2v2) — ranked list from `best_teammates_2v2`. */
import type { StatsH2HDuo } from "../../../api/types";
import { fmtInt } from "../../../utils/format";
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
  if (!duos.length) return <div className="text-sm text-text-muted">No 2v2 duos yet.</div>;
  return (
    <div className="list-divided">
      {duos.map((d, i) => {
        const k = duoKey(d.p1.id, d.p2.id);
        const on = k === selectedKey;
        const gd = d.gd >= 0 ? `+${d.gd}` : String(d.gd);
        return (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(d)}
            className={"row row-tap " + (on ? "bg-accent/10" : "")}
          >
            <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-text-normal">
              {d.p1.display_name} <span className="text-text-muted">/</span> {d.p2.display_name}
            </span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted">
              {fmtInt(d.played)}P · <span className="text-win">{fmtInt(d.wins)}</span>-<span className="text-draw">{fmtInt(d.draws)}</span>-<span className="text-loss">{fmtInt(d.losses)}</span> · {gd}
            </span>
            <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-accent">{d.pts_per_match.toFixed(2)}</span>
          </button>
        );
      })}
    </div>
  );
}
