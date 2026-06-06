import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import CupCard from "./CupCard";
import CurrentMatchPreviewCard from "./CurrentMatchPreviewCard";
import TrendsPreviewCard from "./TrendsPreviewCard";
import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
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

export default function DashboardPage() {
  const pageEntered = useRouteEntryLoading();

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

      {/* Live-now hero — full-width when a tournament is running */}
      <CurrentMatchPreviewCard />

      {/* Two-column grid on desktop for Trends + Cup cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TrendsPreviewCard />

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
            bodyVariant="none"
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
