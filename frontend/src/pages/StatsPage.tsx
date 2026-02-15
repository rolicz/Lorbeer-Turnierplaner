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
import { usePageSubNav, type SubNavItem } from "../ui/layout/SubNavContext";
import { useSectionSubnav } from "../ui/layout/useSectionSubnav";
import SectionSeparator from "../ui/primitives/SectionSeparator";
import CollapsibleCard from "../ui/primitives/CollapsibleCard";

type StatsLocationState = {
  focus?: string;
  trendsView?: "lastN" | "total";
};

export default function StatsPage() {
  const location = useLocation();
  const state = (location.state as StatsLocationState | null) ?? null;
  const focusTrends = useMemo(() => {
    return location.hash === "#trends" || location.hash === "#stats-trends" || state?.focus === "trends";
  }, [location.hash, state?.focus]);

  const initialTrendsView = state?.trendsView ?? undefined;

  const sections = useMemo(
    () => [
      { key: "players", id: "stats-section-players" },
      { key: "trends", id: "stats-section-trends" },
      { key: "h2h", id: "stats-section-h2h" },
      { key: "streaks", id: "stats-section-streaks" },
      { key: "ratings", id: "stats-section-ratings" },
      { key: "stars", id: "stats-section-stars" },
      { key: "matches", id: "stats-section-matches" },
      { key: "ideas", id: "stats-section-ideas" },
    ],
    []
  );

  const { activeKey: activeSubKey, blinkKey: subnavBlinkKey, jumpToSection } = useSectionSubnav({
    sections,
    enabled: true,
  });

  const subNavItems = useMemo<SubNavItem[]>(
    () => {
      const spreadCls = "flex-1 md:flex-none";
      return [
      {
        key: "players",
        label: "Players",
        icon: "fa-users",
        iconOnlyMobile: true,
        active: activeSubKey === "players",
        className: `${spreadCls}${subnavBlinkKey === "players" ? " subnav-click-blink" : ""}`,
        onClick: () => jumpToSection("players", "stats-section-players", { blink: true, retries: 20 }),
      },
      {
        key: "trends",
        label: "Trends",
        icon: "fa-chart-area",
        iconOnlyMobile: true,
        active: activeSubKey === "trends",
        className: `${spreadCls}${subnavBlinkKey === "trends" ? " subnav-click-blink" : ""}`,
        onClick: () => jumpToSection("trends", "stats-section-trends", { blink: true, retries: 20 }),
      },
      {
        key: "h2h",
        label: "H2H",
        icon: "fa-user-group",
        iconOnlyMobile: true,
        active: activeSubKey === "h2h",
        className: `${spreadCls}${subnavBlinkKey === "h2h" ? " subnav-click-blink" : ""}`,
        onClick: () => jumpToSection("h2h", "stats-section-h2h", { blink: true, retries: 20 }),
      },
      {
        key: "streaks",
        label: "Streaks",
        icon: "fa-fire",
        iconOnlyMobile: true,
        active: activeSubKey === "streaks",
        className: `${spreadCls}${subnavBlinkKey === "streaks" ? " subnav-click-blink" : ""}`,
        onClick: () => jumpToSection("streaks", "stats-section-streaks", { blink: true, retries: 20 }),
      },
      {
        key: "ratings",
        label: "Ratings",
        icon: "fa-ranking-star",
        iconOnlyMobile: true,
        active: activeSubKey === "ratings",
        className: `${spreadCls}${subnavBlinkKey === "ratings" ? " subnav-click-blink" : ""}`,
        onClick: () => jumpToSection("ratings", "stats-section-ratings", { blink: true, retries: 20 }),
      },
      {
        key: "stars",
        label: "Stars",
        icon: "fa-star-half-stroke",
        iconOnlyMobile: true,
        active: activeSubKey === "stars",
        className: `${spreadCls}${subnavBlinkKey === "stars" ? " subnav-click-blink" : ""}`,
        onClick: () => jumpToSection("stars", "stats-section-stars", { blink: true, retries: 20 }),
      },
      {
        key: "matches",
        label: "Matches",
        icon: "fa-list-check",
        iconOnlyMobile: true,
        active: activeSubKey === "matches",
        className: `${spreadCls}${subnavBlinkKey === "matches" ? " subnav-click-blink" : ""}`,
        onClick: () => jumpToSection("matches", "stats-section-matches", { blink: true, retries: 20 }),
      },
      ];
    },
    [activeSubKey, subnavBlinkKey, jumpToSection]
  );

  usePageSubNav(subNavItems);

  useEffect(() => {
    if (focusTrends) return;
    window.setTimeout(() => {
      jumpToSection("players", "stats-section-players", {
        blink: false,
        lockMs: 600,
        retries: 20,
        behavior: "auto",
      });
    }, 0);
  }, [focusTrends, jumpToSection, location.key]);

  useEffect(() => {
    if (!focusTrends) return;
    let canceled = false;
    const el = document.getElementById("stats-section-trends");
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
    const page = document.querySelector<HTMLElement>(".page");
    const hasRO = typeof window.ResizeObserver !== "undefined";
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
  }, [focusTrends, location.key]);

  return (
    <div className="page no-scroll-anchor">
      <div className="grid gap-3 lg:grid-cols-2">
        <SectionSeparator
          id="stats-section-players"
          title={
            <span className="inline-flex items-center gap-2">
              <i className="fa-regular fa-user text-text-muted" aria-hidden="true" />
              Players
            </span>
          }
          className="mt-0 border-t-0 pt-0"
        >
          <PlayersStatsCard embedded />
        </SectionSeparator>
        <SectionSeparator
          id="stats-section-trends"
          title={
            <span className="inline-flex items-center gap-2">
              <i className="fa-solid fa-chart-area text-text-muted" aria-hidden="true" />
              Trends
            </span>
          }
          className="mt-0 border-t-0 pt-0"
        >
          <TrendsCard embedded defaultOpen={focusTrends} initialView={initialTrendsView} />
        </SectionSeparator>
        <SectionSeparator
          id="stats-section-h2h"
          title={
            <span className="inline-flex items-center gap-2">
              <i className="fa-solid fa-user-group text-text-muted" aria-hidden="true" />
              Head-to-Head
            </span>
          }
        >
          <HeadToHeadCard embedded />
        </SectionSeparator>
        <SectionSeparator
          id="stats-section-streaks"
          title={
            <span className="inline-flex items-center gap-2">
              <i className="fa-solid fa-fire-flame-curved text-text-muted" aria-hidden="true" />
              Streaks
            </span>
          }
        >
          <StreaksCard embedded />
        </SectionSeparator>
        <SectionSeparator
          id="stats-section-ratings"
          title={
            <span className="inline-flex items-center gap-2">
              <i className="fa-solid fa-ranking-star text-text-muted" aria-hidden="true" />
              Ratings
            </span>
          }
        >
          <RatingsCard embedded />
        </SectionSeparator>
        <SectionSeparator
          id="stats-section-stars"
          title={
            <span className="inline-flex items-center gap-2">
              <i className="fa-solid fa-chart-bar text-text-muted" aria-hidden="true" />
              Club Stars Performance
            </span>
          }
        >
          <StarsPerformanceCard embedded />
        </SectionSeparator>
        <SectionSeparator
          id="stats-section-matches"
          title={
            <span className="inline-flex items-center gap-2">
              <i className="fa-solid fa-list text-text-muted" aria-hidden="true" />
              Player Matches
            </span>
          }
        >
          <PlayerMatchesCard embedded />
        </SectionSeparator>

        <SectionSeparator
          id="stats-section-ideas"
          title={
            <span className="inline-flex items-center gap-2">
              <i className="fa-regular fa-lightbulb text-text-muted" aria-hidden="true" />
              Next Ideas
            </span>
          }
          className="lg:col-span-2"
        >
          <CollapsibleCard
            title={
              <span className="inline-flex items-center gap-2">
                <i className="fa-regular fa-lightbulb text-text-muted" aria-hidden="true" />
                Next Ideas
              </span>
            }
            defaultOpen={false}
            className="panel-subtle"
          >
            <div className="space-y-2">
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
        </SectionSeparator>
      </div>
    </div>
  );
}
