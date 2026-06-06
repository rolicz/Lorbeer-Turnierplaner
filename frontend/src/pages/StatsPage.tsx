import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Users, TrendingUp, Swords, Flame, Star, ListChecks, BarChart3 } from "lucide-react";

import PlayersStatsCard from "./stats/PlayersStatsCard";
import TrendsCard from "./stats/TrendsCard";
import HeadToHeadCard from "./stats/HeadToHeadCard";
import StreaksCard from "./stats/StreaksCard";
import PlayerMatchesCard from "./stats/PlayerMatchesCard";
import RatingsCard from "./stats/RatingsCard";
import StarsPerformanceCard from "./stats/StarsPerformanceCard";
import { SectionTabs, type SectionTab } from "../ui/SectionTabs";
import { useRouteEntryLoading } from "../ui/layout/useRouteEntryLoading";
import PageLoadingScreen from "../ui/primitives/PageLoadingScreen";

type TabKey = "players" | "trends" | "h2h" | "streaks" | "ratings" | "stars" | "matches";

type StatsLocationState = {
  focus?: string;
  trendsView?: "lastN" | "total";
};

const TABS: SectionTab<TabKey>[] = [
  { key: "players", label: "Players", icon: <Users size={14} /> },
  { key: "trends", label: "Trends", icon: <TrendingUp size={14} /> },
  { key: "h2h", label: "H2H", icon: <Swords size={14} /> },
  { key: "streaks", label: "Streaks", icon: <Flame size={14} /> },
  { key: "ratings", label: "Ratings", icon: <Star size={14} /> },
  { key: "stars", label: "Stars", icon: <BarChart3 size={14} /> },
  { key: "matches", label: "Matches", icon: <ListChecks size={14} /> },
];

export default function StatsPage() {
  const location = useLocation();
  const pageEntered = useRouteEntryLoading();
  const state = (location.state as StatsLocationState | null) ?? null;

  const initialTab = useMemo<TabKey>(() => {
    if (location.hash === "#trends" || location.hash === "#stats-trends" || state?.focus === "trends")
      return "trends";
    return "players";
  }, [location.hash, state?.focus]);

  const [active, setActive] = useState<TabKey>(initialTab);
  const initialTrendsView = state?.trendsView ?? undefined;

  // When navigated here via hash/state, switch to the right tab.
  useEffect(() => {
    setActive(initialTab);
  }, [initialTab]);

  // Expose a way for child cards to request a section focus (e.g. from dashboard link).
  const handlePlayersInitialReady = useCallback(() => {}, []);
  void handlePlayersInitialReady;

  if (!pageEntered) {
    return <div className="page"><PageLoadingScreen sectionCount={3} /></div>;
  }

  return (
    <div className="page">
      <div className="mb-4 hidden lg:block">
        <h1 className="text-xl font-bold tracking-tight text-text-normal">Stats</h1>
      </div>

      <SectionTabs tabs={TABS} active={active} onChange={setActive} className="mb-4" />

      {active === "players" && <PlayersStatsCard embedded />}
      {active === "trends" && (
        <TrendsCard embedded defaultOpen initialView={initialTrendsView} />
      )}
      {active === "h2h" && <HeadToHeadCard embedded />}
      {active === "streaks" && <StreaksCard embedded />}
      {active === "ratings" && <RatingsCard embedded />}
      {active === "stars" && <StarsPerformanceCard embedded />}
      {active === "matches" && <PlayerMatchesCard embedded />}
    </div>
  );
}
