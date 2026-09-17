import { Crown } from "lucide-react";

import type { TournamentCupStake } from "../../api/types";
import { cupMarkColorVarForKey } from "../../cupColors";
import { cn } from "../../ui/cn";

export default function TournamentLaurelMarkers({
  stakes,
  className = "",
}: {
  stakes?: TournamentCupStake[] | null;
  className?: string;
}) {
  const rows = stakes ?? [];
  if (!rows.length) return null;

  return (
    <span className={cn("pointer-events-none absolute -right-1 -top-1 z-10 inline-flex items-center gap-0.5", className)}>
      {rows.map((stake) => {
        // A tiny crown disc is a mark, not text (C11): the 3:1 non-text floor.
        const varName = cupMarkColorVarForKey(stake.key);
        return (
          <span
            key={stake.key}
            className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border shadow-sm"
            style={{
              borderColor: `rgb(var(${varName}) / 0.7)`,
              backgroundColor: `rgb(var(${varName}) / 0.22)`,
              color: `rgb(var(${varName}))`,
            }}
            title={`${stake.name} at stake`}
          >
            <Crown size={8} fill="currentColor" aria-hidden="true" />
          </span>
        );
      })}
    </span>
  );
}
