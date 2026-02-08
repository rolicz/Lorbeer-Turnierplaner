import CollapsibleCard from "../ui/primitives/CollapsibleCard";
import PlayersStatsCard from "./stats/PlayersStatsCard";
import HeadToHeadCard from "./stats/HeadToHeadCard";

export default function StatsPage() {
  return (
    <div className="page">
      <div className="grid gap-3 lg:grid-cols-2">
        <PlayersStatsCard />
        <HeadToHeadCard />

        <CollapsibleCard
          title={
            <span className="inline-flex items-center gap-2">
              <i className="fa-regular fa-lightbulb text-text-muted" aria-hidden="true" />
              Next Ideas
            </span>
          }
          defaultOpen={false}
          variant="outer"
          bodyVariant="none"
          className="lg:col-span-2"
        >
          <div className="card-inner space-y-2">
            <div className="text-sm text-text-muted">Planned blocks (so we don’t forget):</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="panel-subtle p-3 text-sm text-text-normal">Cups: cabinet, longest reign, fastest loss</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">Streaks: win/unbeaten, goal streaks</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">Player vs player: full H2H matrix</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">Seasons: per-season leaders + awards</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">Trends: points over time + participation</div>
              <div className="panel-subtle p-3 text-sm text-text-normal">
                Club meta: pick rate + winrate per stars/league
              </div>
            </div>
          </div>
        </CollapsibleCard>
      </div>
    </div>
  );
}
