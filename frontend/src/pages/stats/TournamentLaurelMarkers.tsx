import type { TournamentCupStake } from "../../api/types";
import { cupColorVarForKey } from "../../cupColors";
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
        const varName = cupColorVarForKey(stake.key);
        return (
          <span
            key={stake.key}
            className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[7px] shadow-sm"
            style={{
              borderColor: `rgb(var(${varName}) / 0.7)`,
              backgroundColor: `rgb(var(${varName}) / 0.22)`,
              color: `rgb(var(${varName}))`,
            }}
            title={`${stake.name} at stake`}
          >
            <i className="fa-solid fa-crown" aria-hidden="true" />
          </span>
        );
      })}
    </span>
  );
}
