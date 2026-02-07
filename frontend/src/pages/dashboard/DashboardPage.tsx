import { useQuery } from "@tanstack/react-query";

import CupCard from "./CupCard";
import CurrentMatchPreviewCard from "./CurrentMatchPreviewCard";
import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { listCupDefs } from "../../api/cup.api";
import { useAnyTournamentWS } from "../../hooks/useTournamentWS";
import { cupColorVarForKey, rgbFromCssVar } from "../../cupColors";
import { useMemo } from "react";

export default function DashboardPage() {
  useAnyTournamentWS();

  const defsQ = useQuery({ queryKey: ["cup", "defs"], queryFn: listCupDefs });
  const cupsRaw = defsQ.data?.cups?.length ? defsQ.data.cups : [{ key: "default", name: "Cup", since_date: null }];
  const cups = useMemo(() => {
    // Keep config order, but put the default cup last.
    const nonDefault = cupsRaw.filter((c) => c.key !== "default");
    const defaults = cupsRaw.filter((c) => c.key === "default");
    return [...nonDefault, ...defaults];
  }, [cupsRaw]);

  return (
    <div className="page">
      <div className="grid gap-3 lg:grid-cols-2">
        <CurrentMatchPreviewCard />

        {defsQ.error ? <div className="text-sm text-red-400">{String(defsQ.error)}</div> : null}

        {cups.map((c) => (
          <CollapsibleCard
            key={c.key}
            title={
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: rgbFromCssVar(cupColorVarForKey(c.key)),
                      boxShadow: `0 0 0 3px ${rgbFromCssVar(cupColorVarForKey(c.key))}22`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-base font-black tracking-tight">{c.name}</span>
                </div>
                <div
                  className="mt-1 h-[3px] w-full rounded-full"
                  style={{
                    backgroundImage: `linear-gradient(90deg, transparent, ${rgbFromCssVar(cupColorVarForKey(c.key))}, transparent)`,
                    opacity: 0.95,
                  }}
                  aria-hidden="true"
                />
              </div>
            }
            defaultOpen={true}
            variant="outer"
          >
            <div className="card-inner">
              <CupCard cupKey={c.key} />
            </div>
          </CollapsibleCard>
        ))}
      </div>
    </div>
  );
}
