/** Shared streak display helper (used by StreaksView and RecordsView). */
import type { StatsStreakRun } from "../../api/types";
import { fmtShortDate } from "../../utils/format";

export function streakDateText(r: StatsStreakRun): string {
  const s = fmtShortDate(r.start_ts);
  if (r.ongoing) return s ? `since ${s}` : "current";
  const e = fmtShortDate(r.end_ts);
  if (s && e) return s === e ? s : `${s} – ${e}`;
  return s || e || "";
}
