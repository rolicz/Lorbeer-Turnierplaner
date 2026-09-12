import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Trophy } from "lucide-react";

import CupCard from "./CupCard";
import CurrentMatchPreviewCard from "./CurrentMatchPreviewCard";
import TrendsPreviewCard from "./TrendsPreviewCard";
import StandingsPreviewCard from "./StandingsPreviewCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";
import { listCupDefs } from "../../api/cup.api";
import { qk } from "../../api/queryKeys";
import { cupColorVarForKey, rgbFromCssVar } from "../../cupColors";
import { useLiveTournament } from "../../hooks/useLiveTournament";
import { useRouteEntryLoading } from "../../ui/layout/useRouteEntryLoading";
import PageLayout from "../../ui/layout/PageLayout";
import PageLoadingScreen from "../../ui/primitives/PageLoadingScreen";
import { useTabParam } from "../../ui/shell/useTabParam";

type DashTab = "overview" | "cups";
const DASH_TAB_KEYS = ["overview", "cups"] as const satisfies readonly DashTab[];
const DASH_TABS: SectionTab<DashTab>[] = [
  { key: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
  { key: "cups", label: "Cups", icon: <Trophy size={14} /> },
];

export default function DashboardPage() {
  const pageEntered = useRouteEntryLoading();
  // Persist the tab in the URL so opening a tournament and going back returns here.
  const [dashTab, setDashTab] = useTabParam<DashTab>(DASH_TAB_KEYS, "overview");

  const defsQ = useQuery({ queryKey: qk.cupDefs(), queryFn: listCupDefs });
  const liveQ = useLiveTournament();

  const cups = useMemo(() => {
    const raw = defsQ.data?.cups?.length
      ? defsQ.data.cups
      : [{ key: "default", name: "Cup", since_date: null }];
    const nonDefault = raw.filter((c) => c.key !== "default");
    const defaults = raw.filter((c) => c.key === "default");
    return [...nonDefault, ...defaults];
  }, [defsQ.data]);

  // liveQ is only used to ensure the live card stays updated; the card itself re-queries.
  void liveQ;

  const initialLoading =
    !pageEntered ||
    (!defsQ.error && !defsQ.data && defsQ.isLoading) ||
    (!liveQ.error && typeof liveQ.data === "undefined" && liveQ.isLoading);

  if (initialLoading) {
    return (
      <PageLayout>
        <PageLoadingScreen sectionCount={4} />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Dashboard" className="space-y-4">
      <ErrorToastOnError error={defsQ.error} title="Dashboard loading failed" />

      <SectionTabs tabs={DASH_TABS} active={dashTab} onChange={setDashTab} />

      {dashTab === "overview" ? (
        <div className="space-y-4">
          <CurrentMatchPreviewCard />
          <TrendsPreviewCard />
          <StandingsPreviewCard />
        </div>
      ) : (
      /* Cups */
      <div className="grid gap-6 lg:grid-cols-2">
        {cups.map((c) => (
          <section key={c.key}>
            <div className="section-head">
              <span className="section-label inline-flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: rgbFromCssVar(cupColorVarForKey(c.key)),
                    boxShadow: `0 0 0 3px ${rgbFromCssVar(cupColorVarForKey(c.key))}22`,
                  }}
                  aria-hidden="true"
                />
                <span className="truncate">{c.name}</span>
              </span>
            </div>
            <CupCard cupKey={c.key} />
          </section>
        ))}
      </div>
      )}
    </PageLayout>
  );
}
