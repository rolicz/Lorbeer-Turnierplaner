import { Pill, pillDate } from "../../ui/primitives/Pill";
import type { TournamentMode } from "../../api/types";
import { fmtDate } from "../../utils/format";

/**
 * The tournament's own meta — which mode it is played in, and when.
 *
 * It used to sit in a header block above the tab strip (with a third "live"
 * marker next to it). T10 gave it two homes instead, one per breakpoint: next
 * to the desktop `h1`, where the title row has room to spare, and at the top of
 * the Overview tab on a phone, where the page's first content block is.
 */
export default function TournamentMetaPills({
  mode,
  date,
  className = "",
}: {
  mode?: TournamentMode | null;
  date?: string | null;
  className?: string;
}) {
  if (!mode && !date) return null;
  return (
    <div className={`flex shrink-0 flex-wrap items-center gap-1.5 ${className}`}>
      {mode ? <Pill title="Mode">{mode}</Pill> : null}
      {date ? (
        <Pill className={pillDate()} title="Date">
          {fmtDate(date)}
        </Pill>
      ) : null}
    </div>
  );
}
