import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";

import CupsPreviewCard from "./CupsPreviewCard";
import CurrentMatchPreviewCard from "./CurrentMatchPreviewCard";
import TrendsPreviewCard from "./TrendsPreviewCard";
import StandingsPreviewCard from "./StandingsPreviewCard";
import { useLiveTournament } from "../../hooks/useLiveTournament";
import { useRouteEntryLoading } from "../../ui/layout/useRouteEntryLoading";
import { forgetLocation } from "../../ui/shell/lastLocation";
import PageLayout from "../../ui/layout/PageLayout";
import PageLoadingScreen from "../../ui/primitives/PageLoadingScreen";

/** What the Cups tab became (T5) — the preview's and `?tab=cups`' destination. */
const CUPS_STATS = "/stats?view=overview&sub=cups";

export default function DashboardPage() {
  const pageEntered = useRouteEntryLoading();
  const { pathname, search } = useLocation();
  // The live card re-queries on its own; this keeps the page's loading gate and
  // the shared cache in sync with it.
  const liveQ = useLiveTournament();

  // The dashboard had a Cups tab until T5, when the preview below replaced it.
  // An old `?tab=cups` link opens the full Cups page instead of a dead tab —
  // and is dropped from the per-destination memory (U6), so a remembered
  // `/dashboard?tab=cups` cannot bounce the Dashboard tab into Stats forever.
  const legacyCupsTab = new URLSearchParams(search).get("tab") === "cups";
  useEffect(() => {
    if (legacyCupsTab) forgetLocation(pathname + search);
  }, [legacyCupsTab, pathname, search]);

  const initialLoading =
    !pageEntered || (!liveQ.error && typeof liveQ.data === "undefined" && liveQ.isLoading);

  if (legacyCupsTab) return <Navigate to={CUPS_STATS} replace />;

  if (initialLoading) {
    return (
      <PageLayout>
        <PageLoadingScreen sectionCount={4} />
      </PageLayout>
    );
  }

  // One column of flat sections, in the order they matter: what is happening
  // right now, who holds the cups, the trend, the table.
  return (
    <PageLayout title="Dashboard" className="space-y-4">
      <CurrentMatchPreviewCard />
      <CupsPreviewCard />
      <TrendsPreviewCard />
      <StandingsPreviewCard />
    </PageLayout>
  );
}
