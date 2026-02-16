import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import CupCard from "./CupCard";
import CurrentMatchPreviewCard from "./CurrentMatchPreviewCard";
import TrendsPreviewCard from "./TrendsPreviewCard";
import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { listCupDefs } from "../../api/cup.api";
import { apiFetch } from "../../api/client";
import { useAnyTournamentWS } from "../../hooks/useTournamentWS";
import { cupColorVarForKey, rgbFromCssVar } from "../../cupColors";
import { usePageSubNav, type SubNavItem } from "../../ui/layout/SubNavContext";
import { useSectionSubnav } from "../../ui/layout/useSectionSubnav";

type LiveTournamentLite = {
  id: number;
  name: string;
  mode: "1v1" | "2v2";
  status: "live";
  date?: string | null;
};

export default function DashboardPage() {
  useAnyTournamentWS();
  const defaultScrollDoneRef = useRef(false);

  const defsQ = useQuery({ queryKey: ["cup", "defs"], queryFn: listCupDefs });
  const liveQ = useQuery({
    queryKey: ["tournaments", "live"],
    queryFn: async (): Promise<LiveTournamentLite | null> => apiFetch<LiveTournamentLite | null>("/tournaments/live"),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const cups = useMemo(() => {
    const raw = defsQ.data?.cups?.length ? defsQ.data.cups : [{ key: "default", name: "Cup", since_date: null }];
    // Keep config order, but put the default cup last.
    const nonDefault = raw.filter((c) => c.key !== "default");
    const defaults = raw.filter((c) => c.key === "default");
    return [...nonDefault, ...defaults];
  }, [defsQ.data]);
  const hasLiveNow = !!liveQ.data?.id;

  const pageSections = useMemo(() => {
    const sections: Array<{ key: string; id: string }> = [];
    if (hasLiveNow) sections.push({ key: "live-now", id: "section-dashboard-live" });
    sections.push({ key: "trends", id: "section-dashboard-trends" });
    for (const c of cups) sections.push({ key: `cup-${c.key}`, id: `section-dashboard-cup-${c.key}` });
    return sections;
  }, [cups, hasLiveNow]);

  const { activeKey: activeSubKey, blinkKey: subnavBlinkKey, jumpToSection } = useSectionSubnav({
    sections: pageSections,
    enabled: true,
  });

  useEffect(() => {
    if (defaultScrollDoneRef.current) return;
    if (!pageSections.length) return;
    defaultScrollDoneRef.current = true;
    window.setTimeout(() => {
      jumpToSection(pageSections[0].key, pageSections[0].id, {
        blink: false,
        lockMs: 600,
        retries: 14,
        behavior: "auto",
      });
    }, 0);
  }, [jumpToSection, pageSections]);

  const subNavItems = useMemo<SubNavItem[]>(() => {
    const items: SubNavItem[] = [];
    if (hasLiveNow) {
      items.push({
        key: "live-now",
        label: "Live now",
        icon: "fa-circle-play",
        iconOnly: true,
        title: "Live now",
        active: activeSubKey === "live-now",
        className: subnavBlinkKey === "live-now" ? "subnav-click-blink" : "",
        onClick: () => jumpToSection("live-now", "section-dashboard-live", { blink: true, lockMs: 700, retries: 14 }),
      });
    }
    items.push({
      key: "trends",
      label: "Trends",
      icon: "fa-chart-line",
      active: activeSubKey === "trends",
      className: subnavBlinkKey === "trends" ? "subnav-click-blink" : "",
      onClick: () => jumpToSection("trends", "section-dashboard-trends", { blink: true, lockMs: 700, retries: 14 }),
    });
    for (const c of cups) {
      const key = `cup-${c.key}`;
      const id = `section-dashboard-cup-${c.key}`;
      items.push({
        key,
        label: c.name,
        icon: "fa-trophy",
        active: activeSubKey === key,
        className: subnavBlinkKey === key ? "subnav-click-blink" : "",
        onClick: () => jumpToSection(key, id, { blink: true, lockMs: 700, retries: 14 }),
      });
    }
    return items;
  }, [activeSubKey, cups, hasLiveNow, jumpToSection, subnavBlinkKey]);

  usePageSubNav(subNavItems);

  return (
    <div className="page">
      <ErrorToastOnError error={defsQ.error} title="Dashboard loading failed" />
      <div className="grid gap-3 lg:grid-cols-2">
        {hasLiveNow ? (
          <div id="section-dashboard-live" className="scroll-mt-[calc(env(safe-area-inset-top,0px)+160px)]">
            <CurrentMatchPreviewCard />
          </div>
        ) : null}

        <div id="section-dashboard-trends" className="scroll-mt-[calc(env(safe-area-inset-top,0px)+160px)]">
          <TrendsPreviewCard />
        </div>

        {cups.map((c) => (
          <div
            key={c.key}
            id={`section-dashboard-cup-${c.key}`}
            className="scroll-mt-[calc(env(safe-area-inset-top,0px)+160px)]"
          >
            <CollapsibleCard
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
          </div>
        ))}
      </div>
    </div>
  );
}
