/**
 * What a club has been worth, and since when (R4) — read-only, shown wherever a
 * rating is edited so a star change is visibly a new entry rather than a rewrite
 * of the past.
 *
 * Newest first. A row recovered from a production backup says "by" instead of
 * "since": the day is an upper bound, not the day someone pressed save.
 */
import { useQuery } from "@tanstack/react-query";

import { getClubStarHistory } from "../api/clubs.api";
import { qk } from "../api/queryKeys";
import type { ClubStarHistoryEntry } from "../api/types";
import { fmtDate } from "../utils/format";
import { cn } from "./cn";
import InlineLoading from "./primitives/InlineLoading";
import { Stars } from "./primitives/Stars";
import { starsLabel } from "./clubControls";

function entryLabel(entry: ClubStarHistoryEntry): string {
  const when = fmtDate(entry.valid_from);
  if (!when) return "";
  return entry.source === "recovered" ? `by ${when}` : `since ${when}`;
}

export default function ClubStarHistory({
  clubId,
  className,
}: {
  clubId: number | null;
  className?: string;
}) {
  const q = useQuery({
    queryKey: qk.clubStarHistory(clubId ?? 0),
    queryFn: () => getClubStarHistory(clubId as number),
    enabled: clubId != null,
    staleTime: 60_000,
  });

  if (clubId == null) return null;

  const entries = [...(q.data?.entries ?? [])].reverse();
  const notes: string[] = [];
  if (entries.length === 1) notes.push("The only rating on record — every match before that date counts it too.");
  if (entries.some((e) => e.source === "recovered")) {
    notes.push("A “by” date comes from a production backup: the rating changed on or before that day.");
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <h3 className="text-sm font-semibold text-text-normal">Star history</h3>

      {q.isLoading && !q.data ? (
        <InlineLoading label="Loading history…" />
      ) : !entries.length ? (
        <p className="text-xs text-text-muted">No rating recorded yet.</p>
      ) : (
        <>
          <div className="list-divided">
            {entries.map((entry, i) => (
              <div key={`${entry.valid_from}-${entry.stars}`} className="flex items-center justify-between gap-3 py-1.5">
                <span className="flex min-w-0 items-center gap-2">
                  <Stars rating={entry.stars} size={12} textClassName="text-text-normal" />
                  <span className="text-xs tabular-nums text-text-muted">{starsLabel(entry.stars)}★</span>
                </span>
                <span className="shrink-0 text-xs text-text-muted">
                  {entryLabel(entry)}
                  {/* Lowercase on purpose: uppercase inside an `inset` belongs to
                      `section-label` and to column headers alone (DESIGN.md §6). */}
                  {i === 0 ? <span className="ml-1.5 text-micro text-text-muted">current</span> : null}
                </span>
              </div>
            ))}
          </div>
          {/* At most one paragraph: two stacked notes under a three-line list read
              like a disclaimer, and this block sits inside a picker sheet. */}
          {notes.length ? <p className="text-xs text-text-muted">{notes.join(" ")}</p> : null}
        </>
      )}
    </div>
  );
}
