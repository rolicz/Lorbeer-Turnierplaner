/** Trends tab — interactive multi-metric line chart with pinch/pan. */
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";

import InlineLoading from "../../../ui/primitives/InlineLoading";
import { getStatsPlayerMatches, getStatsRatingsHistory } from "../../../api/stats.api";
import type { StatsScope } from "../../../api/types";
import type { StatsMode } from "../statsMode";
import { usePlayerColors } from "../usePlayerColors";
import { TrendChart } from "../charts";
import { Chip, ChipGroup } from "../../../ui/primitives/Chip";
import { qk } from "../../../api/queryKeys";
import { type Row } from "../standings";
import { Slider } from "../controls";
import { EloNote } from "../explainers";
import { type Metric, type ViewMode, useChartData } from "./useChartData";
import { useChartGestures } from "./useChartGestures";

export type { Metric, ViewMode } from "./useChartData";

const METRIC_OPTS: { key: Metric; label: string }[] = [
  { key: "points", label: "Points" },
  { key: "goals", label: "Goals" },
  { key: "conceded", label: "Conceded" },
  { key: "gd", label: "Goal diff" },
  { key: "winrate", label: "Win %" },
  { key: "elo", label: "Elo" },
  { key: "form", label: "Form" },
];

type RangeKey = "1y" | "2y" | "all";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      {children}
    </div>
  );
}

export default function TrendsExplorer({ mode, scope, rows, initialMetric, initialView, initialPerMatch }: { mode: StatsMode; scope: StatsScope; rows: Row[]; initialMetric?: Metric; initialView?: ViewMode; initialPerMatch?: boolean }) {
  const { colorOf } = usePlayerColors();
  const [metric, setMetric] = useState<Metric>(initialMetric ?? "points");
  const [view, setView] = useState<ViewMode>(initialView ?? "cumulative");
  const [rollN, setRollN] = useState(3);
  const [range, setRange] = useState<RangeKey>("1y");
  const [perMatch, setPerMatch] = useState(initialPerMatch ?? false);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [now] = useState(() => Date.now());
  const [manualWin, setManualWin] = useState<{ t0: number; t1: number } | null>(null);
  const [plotW, setPlotW] = useState(320);

  const matchesQs = useQueries({
    queries: rows.map((r) => ({
      queryKey: qk.stats.playerMatches(r.id, scope),
      queryFn: () => getStatsPlayerMatches({ playerId: r.id, scope }),
      enabled: rows.length > 0 && metric !== "elo",
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    })),
  });

  const eloQ = useQuery({
    queryKey: qk.stats.ratingsHistory(mode, scope),
    queryFn: () => getStatsRatingsHistory({ mode: mode as "overall" | "1v1" | "2v2", scope }),
    enabled: metric === "elo" && rows.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const loading = metric === "elo"
    ? (eloQ.isLoading && !eloQ.data)
    : matchesQs.some((q) => q.isLoading && !q.data);

  // Elo: cumulative = running rating; per = net delta; rolling hidden; no per-match.
  const isElo = metric === "elo";
  // Form: same as profiles (avg of last-N match points ÷ N) — two views like elo
  // (the form value, or its per-event delta); no per-match modifier.
  const isForm = metric === "form";
  // Win % is already a rate; cumulative + the per-match modifier only apply to absolute metrics.
  const allowsCumulative = !isElo && !isForm && metric !== "winrate";
  // Elo/Form use "cumulative" for the value and "per" for the delta; Last-N handled separately.
  const effView: ViewMode = isElo || isForm
    ? (view === "per" ? "per" : "cumulative")
    : (!allowsCumulative && view === "cumulative" ? "rolling" : view);
  const applyPM = perMatch && !isElo && !isForm && metric !== "winrate";

  // Series computed over ALL events; the visible date window (below) pans/zooms the view.
  const { events, series } = useChartData({ rows, matchesQs, eloQ, metric, effView, rollN, hidden, mode, applyPM, colorOf });

  // ---- visible date window (pan/zoom) ----
  const DAY = 864e5;
  const dataMin = events.length ? events[0].ts : now - 365 * DAY;
  const dataMax = events.length ? events[events.length - 1].ts : now;
  const presetWin = useMemo(() => {
    const t1 = dataMax;
    const t0 = range === "all" ? dataMin : Math.max(dataMin, now - (range === "1y" ? 365 : 730) * DAY);
    return { t0: Math.min(t0, t1 - DAY), t1 };
  }, [range, dataMin, dataMax, now, DAY]);
  const win = manualWin ?? presetWin;

  const plotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const measure = () => setPlotW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useChartGestures({ plotRef, win, dataMin, dataMax, setManualWin });

  const isPpm = metric === "points" && applyPM;
  const isFormValue = isForm && effView !== "per";
  const isFormDelta = isForm && effView === "per";
  const allY = series.flatMap((s) => s.points.filter((p): p is number => p != null));
  let yMax: number;
  let yMin: number;
  let yTicks: number[] | undefined;
  if (isPpm || isFormValue) {
    // Points-per-match / form value live on the 0–3 scale.
    yMin = 0; yMax = 3; yTicks = [0, 1, 2, 3];
  } else if ((isElo && effView === "per") || isFormDelta) {
    // Δ per event: symmetric around 0 so the zero baseline sits dead center
    // (e.g. −58 … 0 … 58). Chart's auto mid-tick = round((yMin+yMax)/2) = 0.
    const M = Math.max(1, ...allY.map((v) => Math.ceil(Math.abs(v))));
    yMin = -M;
    yMax = M;
  } else if (isElo && effView === "cumulative" && allY.length) {
    // Rating over time: center the axis on the 1000 baseline; symmetric extent
    // is the largest absolute deviation from 1000 (auto mid-tick = 1000).
    const K = Math.max(10, ...allY.map((v) => Math.ceil(Math.abs(v - 1000))));
    yMin = 1000 - K;
    yMax = 1000 + K;
  } else {
    yMax = Math.max(1, ...allY);
    yMin = Math.min(0, ...allY);
  }

  return (
    <div className="space-y-3">
      {/* fixed-size plot — pinch zooms the x-axis, drag pans */}
      <div>
        <div ref={plotRef} className="rounded-2xl border border-border-card-chip/40 bg-bg-card-inner/40 p-2" data-no-swipe-nav>
          {loading ? (
            <InlineLoading label="Loading…" />
          ) : (
            <TrendChart events={events} series={series} yMax={isPpm ? 3 : Math.ceil(yMax)} yMin={isPpm ? 0 : Math.floor(yMin)} yTicks={yTicks} width={plotW - 16} viewT0={win.t0} viewT1={win.t1} showLabels height={240} />
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-text-muted">
          <span>Pinch to zoom · drag to pan</span>
          {manualWin ? <button type="button" className="font-medium text-accent" onClick={() => setManualWin(null)}>Reset zoom</button> : null}
        </div>
        {/* Same explainer as the Elo column in the table. */}
        {isElo ? <div className="mt-2"><EloNote /></div> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {rows.map((r) => {
            const c = colorOf(r.id);
            const on = !hidden.has(r.id);
            return (
              <button key={r.id} type="button"
                onClick={() => setHidden((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                className={
                  // A legend key, not a selection chip: the `chip` surface (DESIGN.md §3 level 3)
                  // when the series is drawn, the same outline hollowed out and struck through
                  // when it is hidden.
                  "chip inline-flex items-center gap-1.5 transition focus-ring " +
                  (on ? "text-text-normal" : "border-dashed bg-transparent text-text-muted line-through")
                }>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.solid, opacity: on ? 1 : 0.4 }} />
                {r.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* controls */}
      <div className="space-y-3">
        <Field label="Metric">
          <div className="flex flex-wrap items-center gap-2">
            <ChipGroup<Metric> value={metric} onChange={setMetric} ariaLabel="Metric" options={METRIC_OPTS} />
            {!isElo && !isForm && metric !== "winrate" ? <Chip selected={perMatch} onClick={() => setPerMatch((v) => !v)}>Per match</Chip> : null}
          </div>
        </Field>
        <Field label="View">
          {isElo ? (
            <ChipGroup<"cumulative" | "per"> value={effView === "per" ? "per" : "cumulative"} onChange={(v) => setView(v)} ariaLabel="View"
              options={[{ key: "cumulative", label: "Rating" }, { key: "per", label: "Δ per event" }]} />
          ) : isForm ? (
            <ChipGroup<"cumulative" | "per"> value={effView === "per" ? "per" : "cumulative"} onChange={(v) => setView(v)} ariaLabel="View"
              options={[{ key: "cumulative", label: "Form" }, { key: "per", label: "Δ per event" }]} />
          ) : (
            <ChipGroup<ViewMode> value={effView} onChange={setView} ariaLabel="View"
              options={[
                ...(allowsCumulative ? [{ key: "cumulative" as ViewMode, label: "Cumulative" }] : []),
                { key: "per", label: "Per event" },
                { key: "rolling", label: "Last N" },
              ]} />
          )}
        </Field>
        {effView === "rolling" || isForm ? (
          <div className="space-y-1">
            <Slider label="Last N" value={rollN} min={2} max={Math.max(3, Math.min(20, events.length || 10))} onChange={setRollN} />
            <div className="text-[11px] text-text-muted">
              {isForm
                ? `Form = average points over the last ${rollN} matches (÷N), as on profiles.`
                : `Rolling average over the last ${rollN} tournaments.`}
            </div>
          </div>
        ) : null}
        <Field label="Range">
          <ChipGroup<RangeKey> value={range} onChange={(r) => { setRange(r); setManualWin(null); }} ariaLabel="Range"
            options={[{ key: "1y", label: "1 year" }, { key: "2y", label: "2 years" }, { key: "all", label: "All time" }]} />
        </Field>
      </div>
    </div>
  );
}
