import { Link } from "react-router-dom";

import { cn } from "../../ui/cn";
import { recordIcon, recordModeLabel } from "../stats/recordIcons";
import type { StatsRecord } from "../../api/types";

/**
 * The records this player holds today, as one wrapping band of icon chips (M5, Rumpi's idea).
 * Grey `.chip`s with a lucide glyph — never a cup token, never a Crown: the avatar ring a few
 * pixels away means "holds a cup today" (T15/C12) and this must read as a different kind of mark.
 * An ongoing streak record wears `border-accent`, the signal `PlayerStreakChips` already paints on
 * this profile for "the record is being set right now". No count: ties are visible in Stats.
 */
export default function RecordBadges({ playerId, records }: { playerId: number; records: StatsRecord[] }) {
  const held = records.flatMap((r) => {
    const h = r.holders.find((x) => x.player.id === playerId);
    return h ? [{ r, ongoing: h.ongoing }] : [];
  });

  if (held.length === 0) return null;

  return (
    <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Records held" data-record-badges>
      {held.map(({ r, ongoing }) => {
        const Icon = recordIcon(r.key);
        const modeLabel = recordModeLabel(r.key);
        return (
          <li key={r.key}>
            <Link
              to={r.path}
              data-record={r.key}
              data-ongoing={ongoing || undefined}
              className={cn(
                "chip inline-flex h-7 items-center gap-1 px-2 no-underline focus-ring",
                ongoing && "border-accent",
              )}
              title={ongoing ? `${r.label} — record holder, current run` : `${r.label} — record holder`}
              aria-label={`${r.label}: record holder${ongoing ? ", current run" : ""}. Open in Stats`}
            >
              <Icon size={14} strokeWidth={2.25} aria-hidden="true" />
              {modeLabel ? <span className="text-micro leading-none">{modeLabel}</span> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
