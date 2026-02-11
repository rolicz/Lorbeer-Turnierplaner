import CollapsibleCard from "../ui/primitives/CollapsibleCard";
import PlayersStatsCard from "./stats/PlayersStatsCard";
import TrendsCard from "./stats/TrendsCard";
import HeadToHeadCard from "./stats/HeadToHeadCard";
import StreaksCard from "./stats/StreaksCard";
import PlayerMatchesCard from "./stats/PlayerMatchesCard";
import RatingsCard from "./stats/RatingsCard";
import StarsPerformanceCard from "./stats/StarsPerformanceCard";
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { prefersReducedMotion } from "../ui/scroll";

export default function StatsPage() {
  const location = useLocation() as { hash?: string; state?: any; key?: string };
  const focusTrends = useMemo(() => {
    return location?.hash === "#trends" || location?.hash === "#stats-trends" || location?.state?.focus === "trends";
  }, [location?.hash, location?.state?.focus]);

  const initialTrendsView = (location?.state?.trendsView as "lastN" | "total" | undefined) ?? undefined;

  useEffect(() => {
    if (!focusTrends) return;
    let canceled = false;
    const el = document.getElementById("stats-trends") ?? document.getElementById("trends");
    if (!el) return;

    const alignSnap = () => {
      if (canceled) return;
      try {
        el.scrollIntoView({ behavior: "auto", block: "start" });
      } catch {
        // ignore
      }
    };

    // Ensure alignment after first paint as well (some browsers ignore pre-paint scroll in rare cases).
    const raf = requestAnimationFrame(() => {
      if (canceled) return;
      try {
        el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      } catch {
        // ignore
      }
    });

    // If content above loads a moment later (avatars/data), the Trends card can get pushed down again.
    // Observe short-lived resizes and re-align, then stop (no autoscroll during normal interaction).
    const page = document.querySelector(".page") as HTMLElement | null;
    const hasRO = typeof (window as any).ResizeObserver !== "undefined";
    const stopAfterMs = 1200;
    const start = Date.now();
    let ro: ResizeObserver | null = null;
    let resizeRaf = 0;

    if (page && hasRO) {
      ro = new ResizeObserver(() => {
        if (canceled) return;
        if (Date.now() - start > stopAfterMs) return;
        if (resizeRaf) return;
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = 0;
          alignSnap();
        });
      });
      ro.observe(page);
    }

    const tStop = window.setTimeout(() => {
      if (ro) ro.disconnect();
      ro = null;
    }, stopAfterMs);

    return () => {
      canceled = true;
      cancelAnimationFrame(raf);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      window.clearTimeout(tStop);
      if (ro) ro.disconnect();
    };
  }, [focusTrends, location?.key]);

  return (
    <div className="page no-scroll-anchor">
      <div className="grid gap-3 lg:grid-cols-2">
        <PlayersStatsCard />
        <TrendsCard defaultOpen={focusTrends} initialView={initialTrendsView} />
        <HeadToHeadCard />
        <StreaksCard />
        <RatingsCard />
        <PlayerMatchesCard />
        <StarsPerformanceCard />

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
