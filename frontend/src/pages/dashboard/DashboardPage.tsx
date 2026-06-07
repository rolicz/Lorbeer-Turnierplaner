import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Trophy } from "lucide-react";

import CupCard from "./CupCard";
import CurrentMatchPreviewCard from "./CurrentMatchPreviewCard";
import TrendsPreviewCard from "./TrendsPreviewCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";
import { listCupDefs } from "../../api/cup.api";
import { apiFetch } from "../../api/client";
import { cupColorVarForKey, rgbFromCssVar } from "../../cupColors";
import { useRouteEntryLoading } from "../../ui/layout/useRouteEntryLoading";
import PageLoadingScreen from "../../ui/primitives/PageLoadingScreen";

type LiveTournamentLite = {
  id: number;
  name: string;
  mode: "1v1" | "2v2";
  status: "live";
  date?: string | null;
};

type DashTab = "overview" | "cups";
const DASH_TABS: SectionTab<DashTab>[] = [
  { key: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
  { key: "cups", label: "Cups", icon: <Trophy size={14} /> },
];

export default function DashboardPage() {
  const pageEntered = useRouteEntryLoading();
  const [dashTab, setDashTab] = useState<DashTab>("overview");

  const defsQ = useQuery({ queryKey: ["cup", "defs"], queryFn: listCupDefs });
  const liveQ = useQuery({
    queryKey: ["tournaments", "live"],
    queryFn: async (): Promise<LiveTournamentLite | null> =>
      apiFetch<LiveTournamentLite | null>("/tournaments/live"),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

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
      <div className="page">
        <PageLoadingScreen sectionCount={4} />
      </div>
    );
  }

  return (
    <div className="page space-y-4">
      <ErrorToastOnError error={defsQ.error} title="Dashboard loading failed" />

      <div className="mb-1 hidden lg:block">
        <h1 className="text-xl font-bold tracking-tight text-text-normal">Dashboard</h1>
      </div>

      <SectionTabs tabs={DASH_TABS} active={dashTab} onChange={setDashTab} />

      {dashTab === "overview" ? (
        <div className="space-y-4">
          <CurrentMatchPreviewCard />
          <TrendsPreviewCard />
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
    </div>
  );
}
