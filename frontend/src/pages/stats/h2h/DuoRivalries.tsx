/** Duo-vs-duo rivalries (2v2) — top `team_rivalries_2v2` rows by rivalry score. */
import { useMemo } from "react";

import EmptyState from "../../../ui/primitives/EmptyState";
import type { StatsH2HTeamRivalry } from "../../../api/types";
import { TeamRivalryRow, teamRivalryWidths } from "../HeadToHeadRows";

export function DuoRivalries({
  rivalries,
  limit = 8,
  onOpenMatches,
}: {
  rivalries: StatsH2HTeamRivalry[];
  limit?: number;
  onOpenMatches?: (r: StatsH2HTeamRivalry) => void;
}) {
  const top = useMemo(
    () => rivalries.slice().sort((a, b) => b.rivalry_score - a.rivalry_score).slice(0, limit),
    [rivalries, limit],
  );
  const widths = teamRivalryWidths(top);
  if (!top.length) return <EmptyState title="No duo rivalries yet." className="py-2" />;
  return (
    <div className="space-y-2">
      {top.map((r) => (
        <TeamRivalryRow
          key={`${r.team1.map((p) => p.id).join("-")}-${r.team2.map((p) => p.id).join("-")}`}
          r={r}
          widths={widths}
          onOpenMatches={onOpenMatches ? () => onOpenMatches(r) : null}
        />
      ))}
    </div>
  );
}
