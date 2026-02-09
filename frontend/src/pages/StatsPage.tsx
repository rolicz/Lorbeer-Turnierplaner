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
            <div className="text-sm text-text-muted">Planned blocks (not implemented yet):</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="panel-subtle p-3 text-sm text-text-normal">Cups: cabinet, longest reign, fastest loss, defenses</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">H2H: "nemesis" timeline, per-season splits</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">Streaks: streak timeline, per-season streaks</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">Seasons: per-season stats + awards (later)</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">Trends: participation heatmap (who skipped when)</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">
                Club meta: pick rate + winrate per stars/league, "signature clubs" per player
              </div>
              <div className="panel-subtle p-3 text-sm text-text-normal">Ratings: history chart + rating volatility</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">Awards: MVP (points), golden boot, best defense, upset king</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">"Clutch": performance in close games (&lt;= 1 goal)</div>
            </div>
          </div>
        </CollapsibleCard>
      </div>
    </div>
  );
}
