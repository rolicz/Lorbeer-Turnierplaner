import CollapsibleCard from "../ui/primitives/CollapsibleCard";
import PlayersStatsCard from "./stats/PlayersStatsCard";
import TrendsCard from "./stats/TrendsCard";
import HeadToHeadCard from "./stats/HeadToHeadCard";
import StreaksCard from "./stats/StreaksCard";
import PlayerMatchesCard from "./stats/PlayerMatchesCard";
import RatingsCard from "./stats/RatingsCard";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";

export default function StatsPage() {
  const location = useLocation() as { hash?: string; state?: any };
  const focusTrends = useMemo(() => {
    return location?.hash === "#trends" || location?.state?.focus === "trends";
  }, [location?.hash, location?.state?.focus]);

  const initialTrendsView = (location?.state?.trendsView as "lastN" | "total" | undefined) ?? undefined;

  return (
    <div className="page no-scroll-anchor">
      <div className="grid gap-3 lg:grid-cols-2">
        <PlayersStatsCard />
        <TrendsCard defaultOpen={focusTrends} initialView={initialTrendsView} />
        <HeadToHeadCard />
        <StreaksCard />
        <RatingsCard />
        <PlayerMatchesCard />

        <CollapsibleCard
          title={
            <span className="inline-flex items-center gap-2">
              <i className="fa-regular fa-lightbulb text-text-muted" aria-hidden="true" />
              Next Ideas
            </span>
          }
          defaultOpen={false}
          scrollOnOpen={true}
          variant="outer"
          bodyVariant="none"
          className="lg:col-span-2"
        >
          <div className="card-inner space-y-2">
            <div className="text-sm text-text-muted">Planned blocks (so we don’t forget):</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="panel-subtle p-3 text-sm text-text-normal">Cups: cabinet, longest reign, fastest loss</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">H2H: per-season matrix + “nemesis” timeline</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">Streaks: per-season streaks + streak timeline</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">Seasons: per-season leaders + awards</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">Trends: points over time + participation</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">
                Club meta: pick rate + winrate per stars/league
              </div>
              <div className="panel-subtle p-3 text-sm text-text-normal">Ratings: history chart + season resets</div>
            </div>
          </div>
        </CollapsibleCard>
      </div>
    </div>
  );
}
