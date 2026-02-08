import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { MetaRow } from "../../ui/primitives/Meta";

import { getStatsPlayerMatches, getStatsPlayers } from "../../api/stats.api";
import type { Match, StatsPlayerMatchesResponse, StatsPlayersResponse, StatsTournamentLite } from "../../api/types";
import { sideBy } from "../../helpers";

type Mode = "overall" | "1v1" | "2v2";
type View = "lastN" | "total";
type WindowMonths = 3 | 6 | 12 | "all";

function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function fmtMonth(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${yy}`;
}

function fmtMonthDate(d: Date) {
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${yy}`;
}

function addMonths(d: Date, months: number) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function wrapTwoLinesWords(s: string, maxLen: number) {
  const raw = String(s ?? "").trim();
  if (!raw) return ["", ""] as const;
  if (raw.length <= maxLen) return [raw, ""] as const;

  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [raw, ""] as const; // don't break words

  let best: { i: number; score: number } | null = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const over = Math.max(0, a.length - maxLen) + Math.max(0, b.length - maxLen);
    const balance = Math.abs(a.length - b.length);
    const score = Math.max(a.length, b.length) + balance * 0.25 + over * 2;
    if (!best || score < best.score) best = { i, score };
  }

  const i = best?.i ?? Math.ceil(words.length / 2);
  return [words.slice(0, i).join(" "), words.slice(i).join(" ")] as const;
}

function monthTicksBetween(startTs: number, endTs: number) {
  const out: Array<{ ts: number; label: string }> = [];
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs) return out;

  const start = new Date(startTs);
  const end = new Date(endTs);

  // Month boundaries (1st of each month) within the window.
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  if (cur.getTime() < startTs) cur = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  while (cur.getTime() <= end.getTime()) {
    out.push({ ts: cur.getTime(), label: fmtMonthDate(cur) });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  if (!out.length) out.push({ ts: startTs, label: fmtMonthDate(start) });
  return out;
}

export function colorForIdx(idx: number, total: number) {
  // Distinct, theme-invariant palette via HSL.
  const hue = Math.round(((idx % Math.max(1, total)) * 360) / Math.max(1, total));
  return {
    solid: `hsl(${hue} 72% 56%)`,
    muted: `hsl(${hue} 62% 38%)`, // darker for "no data" segments
    outline: `hsl(${hue} 25% 16%)`,
  };
}

function ModeSwitch({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const idx = value === "overall" ? 0 : value === "1v1" ? 1 : 2;
  const wCls = "w-16 sm:w-24";
  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label="Filter mode"
      title="Filter: Overall / 1v1 / 2v2"
    >
      <span
        className={"absolute inset-y-1 left-1 rounded-xl shadow-sm transition-transform duration-200 ease-out " + wCls}
        style={{
          backgroundColor: "rgb(var(--color-bg-card-inner))",
          transform: `translateX(${idx * 100}%)`,
        }}
        aria-hidden="true"
      />
      {(
        [
          { k: "overall" as const, label: "Overall", icon: "fa-layer-group" },
          { k: "1v1" as const, label: "1v1", icon: "fa-user" },
          { k: "2v2" as const, label: "2v2", icon: "fa-users" },
        ] as const
      ).map((x) => (
        <button
          key={x.k}
          type="button"
          onClick={() => onChange(x.k)}
          className={
            "relative z-10 inline-flex h-9 items-center justify-center gap-2 rounded-xl text-[11px] transition-colors " +
            wCls +
            " " +
            (value === x.k ? "text-text-normal" : "text-text-muted hover:text-text-normal")
          }
          aria-pressed={value === x.k}
        >
          <i className={"fa-solid " + x.icon + " hidden sm:inline"} aria-hidden="true" />
          <span>{x.label}</span>
        </button>
      ))}
    </div>
  );
}

function ViewSwitch({ value, onChange }: { value: View; onChange: (m: View) => void }) {
  const idx = value === "lastN" ? 0 : 1;
  const wCls = "w-16 sm:w-24";
  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label="View"
      title="View"
    >
      <span
        className={"absolute inset-y-1 left-1 rounded-xl shadow-sm transition-transform duration-200 ease-out " + wCls}
        style={{
          backgroundColor: "rgb(var(--color-bg-card-inner))",
          transform: `translateX(${idx * 100}%)`,
        }}
        aria-hidden="true"
      />
      {(
        [
          { k: "lastN" as const, label: "Last N", icon: "fa-bolt" },
          { k: "total" as const, label: "Total", icon: "fa-layer-group" },
        ] as const
      ).map((x) => (
        <button
          key={x.k}
          type="button"
          onClick={() => onChange(x.k)}
          className={
            "relative z-10 inline-flex h-9 items-center justify-center gap-2 rounded-xl text-[11px] transition-colors " +
            wCls +
            " " +
            (value === x.k ? "text-text-normal" : "text-text-muted hover:text-text-normal")
          }
          aria-pressed={value === x.k}
        >
          <i className={"fa-solid " + x.icon + " hidden sm:inline"} aria-hidden="true" />
          <span>{x.label}</span>
        </button>
      ))}
    </div>
  );
}

function WindowSwitch({ value, onChange }: { value: WindowMonths; onChange: (m: WindowMonths) => void }) {
  const idx = value === 3 ? 0 : value === 6 ? 1 : value === 12 ? 2 : 3;
  const wCls = "w-14 sm:w-20";
  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label="Window"
      title="Window size"
    >
      <span
        className={"absolute inset-y-1 left-1 rounded-xl shadow-sm transition-transform duration-200 ease-out " + wCls}
        style={{
          backgroundColor: "rgb(var(--color-bg-card-inner))",
          transform: `translateX(${idx * 100}%)`,
        }}
        aria-hidden="true"
      />
      {(
        [
          { k: 3 as const, label: "3m" },
          { k: 6 as const, label: "6m" },
          { k: 12 as const, label: "1y" },
          { k: "all" as const, label: "All" },
        ] as const
      ).map((x) => (
        <button
          key={x.k}
          type="button"
          onClick={() => onChange(x.k)}
          className={
            "relative z-10 inline-flex h-9 items-center justify-center rounded-xl text-[11px] transition-colors " +
            wCls +
            " " +
            (value === x.k ? "text-text-normal" : "text-text-muted hover:text-text-normal")
          }
          aria-pressed={value === x.k}
        >
          <span>{x.label}</span>
        </button>
      ))}
    </div>
  );
}

function winnerSide(m: Match): "A" | "B" | null {
  if (m.state !== "finished") return null;
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const ag = a?.goals ?? 0;
  const bg = b?.goals ?? 0;
  if (ag === bg) return null;
  return ag > bg ? "A" : "B";
}

function pointsForPlayerInMatch(m: Match, playerId: number): number | null {
  if (m.state !== "finished") return null;
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const aHas = (a?.players ?? []).some((p) => p.id === playerId);
  const bHas = (b?.players ?? []).some((p) => p.id === playerId);
  const side: "A" | "B" | null = aHas && !bHas ? "A" : bHas && !aHas ? "B" : null;
  if (!side) return null;

  const w = winnerSide(m);
  if (!w) return 1;
  return w === side ? 3 : 0;
}

function avgLast(arr: number[], n: number) {
  const slice = arr.slice(-n);
  if (!slice.length) return 0;
  // Divide by the chosen N even if fewer matches exist (pad missing with 0).
  return slice.reduce((a, b) => a + b, 0) / Math.max(1, n);
}

export type SeriesPoint = { y: number; present: boolean } | null; // null = no datapoint

export function MultiLineChart({
  title,
  tournamentTs,
  windowStartTs,
  windowEndTs,
  tournamentTitles,
  xLabelEvery = 1,
  yMax,
  yTicks,
  series,
  xHintLeft,
  xHintRight,
  ySuffix,
  size = "full",
  showTournamentTitles = true,
  showLegend = true,
  showHeader = true,
  frame = "flat",
}: {
  title: string;
  tournamentTs: number[];
  windowStartTs: number;
  windowEndTs: number;
  tournamentTitles: string[];
  xLabelEvery?: number;
  yMax: number;
  yTicks: number[];
  series: Array<{ id: number; name: string; color: string; colorMuted: string; outline: string; points: SeriesPoint[] }>;
  xHintLeft?: string;
  xHintRight?: string;
  ySuffix?: string;
  size?: "full" | "mini";
  showTournamentTitles?: boolean;
  showLegend?: boolean;
  showHeader?: boolean;
  frame?: "flat" | "none";
}) {
  const w = 920;
  // Tune the viewBox aspect so `preserveAspectRatio="meet"` doesn't leave big horizontal gutters
  // in short (mini) plots.
  const h = 520;
  // Leave room for Y-axis labels to the left of the axis.
  const padL = size === "mini" ? 52 : 56;
  const padR = 14;
  const padT = 14;
  const padB = size === "mini" ? 78 : 86;
  const n = tournamentTs.length;

  const span = Math.max(1, windowEndTs - windowStartTs);
  const xAtTime = (ts: number) => {
    const t = Math.max(windowStartTs, Math.min(windowEndTs, ts));
    const p = (t - windowStartTs) / span;
    return padL + p * (w - padL - padR);
  };

  const xAt = (i: number) => xAtTime(tournamentTs[Math.max(0, Math.min(n - 1, i))] ?? windowStartTs);
  const yAt = (v: number) => {
    const vv = Math.max(0, Math.min(yMax, v));
    const innerH = h - padT - padB;
    return padT + (1 - vv / Math.max(1e-6, yMax)) * innerH;
  };

  const gridStroke = "rgb(var(--color-border-card-inner))";
  const labelFill = "rgb(var(--color-text-muted))";
  // Font sizes are in viewBox units; since the SVG is scaled down, these need to be large.
  const axisLabelSize = size === "mini" ? 28 : 32;
  const axisXSize = size === "mini" ? 22 : 26; // narrow month labels (MM/YY)
  const axisWeight = 600;

  // Absolute time ticks (month boundaries only; do not force start/end labels).
  const xTicksAll = useMemo(() => monthTicksBetween(windowStartTs, windowEndTs), [windowEndTs, windowStartTs]);
  const xTicksLabeled = useMemo(() => {
    const every = Math.max(1, Math.trunc(xLabelEvery) || 1);
    if (every === 1) return xTicksAll;
    const out = xTicksAll.filter((_, idx) => idx % every === 0);
    // Ensure the last tick is labeled too (helps orientation).
    const last = xTicksAll[xTicksAll.length - 1];
    if (last && !out.some((t) => t.ts === last.ts)) out.push(last);
    return out;
  }, [xLabelEvery, xTicksAll]);

  // When multiple series share the same y at a given x, offset them into "lanes" so colors are visible
  // side-by-side instead of blending/overpainting.
  const laneOffsetsByIndex = useMemo(() => {
    const threshold = 2.25; // SVG px; group near-identical y values
    const laneGap = 5; // SVG px
    const out = new Map<number, Map<number, number>>();

    for (let i = 0; i < n; i++) {
      const atI: Array<{ id: number; y: number }> = [];
      for (const s of series) {
        const p = s.points[i];
        if (!p) continue;
        atI.push({ id: s.id, y: yAt(p.y) });
      }
      if (atI.length <= 1) continue;
      atI.sort((a, b) => a.y - b.y);

      const groups: Array<Array<{ id: number; y: number }>> = [];
      let cur: Array<{ id: number; y: number }> = [];
      for (const item of atI) {
        if (!cur.length) {
          cur = [item];
          continue;
        }
        const prev = cur[cur.length - 1];
        if (Math.abs(item.y - prev.y) <= threshold) cur.push(item);
        else {
          groups.push(cur);
          cur = [item];
        }
      }
      if (cur.length) groups.push(cur);

      const m = new Map<number, number>();
      let any = false;
      for (const g of groups) {
        if (g.length <= 1) continue;
        any = true;
        const mid = (g.length - 1) / 2;
        for (let j = 0; j < g.length; j++) {
          m.set(g[j].id, (j - mid) * laneGap);
        }
      }
      if (any) out.set(i, m);
    }
    return out;
  }, [n, series, yMax, windowStartTs, windowEndTs]); // yAt depends on yMax

  const laneOffset = (seriesId: number, idx: number) => laneOffsetsByIndex.get(idx)?.get(seriesId) ?? 0;

  return (
    <div
      className={
        (frame === "flat" ? "card-inner-flat " : "") + "rounded-2xl flex min-h-0 min-w-0 flex-col overflow-hidden"
      }
    >
      {showHeader ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-normal">{title}</div>
            <div className="mt-0.5 text-[11px] text-text-muted">
              {xHintLeft || "—"} <span className="opacity-70">to</span> {xHintRight || "—"}
            </div>
          </div>
          <div className="shrink-0 text-[11px] text-text-muted">{series.length} players</div>
        </div>
      ) : null}

      {/* Fixed, responsive plot height (no dynamic viewport sizing). */}
      <div
        className={
          (showHeader ? "mt-2 " : "") +
          // Dashboard preview is short; on desktop, the stats chart needs more height to avoid unused horizontal space.
          (size === "mini" ? "h-[200px] sm:h-[220px] lg:h-[240px]" : "h-[200px] sm:h-[220px] lg:h-[340px]")
        }
      >
        <div
          className={
            "relative h-full w-full overflow-hidden rounded-2xl border border-border-card-chip/55 bg-bg-card-chip shadow-sm " +
            (size === "mini" ? "p-1.5" : "p-2")
          }
        >
          {/* Brighter plot surface (solid tint; no gradient). */}
          <div className="pointer-events-none absolute inset-0 bg-white/26" />
          {/* Keep aspect ratio so text/points don't get stretched when the plot grows vertically. */}
          <svg
            className="relative h-full w-full overflow-hidden"
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="xMidYMid meet"
            aria-label={title}
          >
            {/* x grid (absolute time) */}
            {xTicksAll.map((t) => (
              <line
                key={t.ts}
                x1={xAtTime(t.ts)}
                x2={xAtTime(t.ts)}
                y1={padT}
                y2={h - padB}
                stroke={gridStroke}
                strokeOpacity="0.48"
                strokeWidth="1.6"
              />
            ))}

            {/* y grid */}
            {yTicks.map((t) => (
              <g key={t}>
                <line
                  x1={padL}
                  x2={w - padR}
                  y1={yAt(t)}
                  y2={yAt(t)}
                  stroke={gridStroke}
                  strokeOpacity={t === 0 ? 0.72 : 0.48}
                  strokeWidth="1.35"
                />
                <text
                  x={padL - 10}
                  y={yAt(t) + 10}
                  fontSize={axisLabelSize}
                  fontWeight={axisWeight as any}
                  textAnchor="end"
                  fill={labelFill}
                >
                  {ySuffix ? `${t}${ySuffix}` : t}
                </text>
              </g>
            ))}

            {/* x axis */}
            <line
              x1={padL}
              x2={w - padR}
              y1={h - padB}
              y2={h - padB}
              stroke={gridStroke}
              strokeOpacity="0.55"
              strokeWidth="1"
            />

            {/* tournament markers (events) */}
            {tournamentTs.length ? (
              <>
                {tournamentTs.map((_, i) => (
                  <circle
                    key={i}
                    cx={xAt(i)}
                    cy={h - padB}
                    r={3.6}
                    fill="rgb(var(--color-text-muted))"
                    opacity="0.26"
                  />
                ))}
              </>
            ) : null}

            {/* tournament titles (vertical) at the top of the plot */}
            {showTournamentTitles && tournamentTitles.length ? (
              <>
                {tournamentTitles.map((name, i) => {
                  // Clamp slightly so the most recent/oldest label can't bleed out of the plot box.
                  const xRaw = xAt(i);
                  const x = Math.max(padL + 8, Math.min(w - padR - 8, xRaw));
                  // Place labels inside the plot area, starting at the very top.
                  const y = padT + 6;
                  const [l1, l2] = wrapTwoLinesWords(name, 16);
                  return (
                    <text
                      key={i}
                      x={x}
                      y={y}
                      fontSize={16}
                      fontWeight={axisWeight as any}
                      textAnchor="start"
                      dominantBaseline="hanging"
                      fill={labelFill}
                      opacity="0.88"
                      transform={`rotate(90 ${x} ${y})`}
                    >
                      <title>{name}</title>
                      <tspan x={x} dy={0}>
                        {l1}
                      </tspan>
                      {l2 ? (
                        <tspan x={x} dy={18}>
                          {l2}
                        </tspan>
                      ) : null}
                    </text>
                  );
                })}
              </>
            ) : null}

            {/* x labels + tick marks (absolute time) */}
            {xTicksLabeled.length ? (
              <>
                {xTicksLabeled.map((t, idx) => {
                  const isLeft = idx === 0;
                  const isRight = idx === xTicksLabeled.length - 1;
                  return (
                    <g key={t.ts}>
                      <line
                        x1={xAtTime(t.ts)}
                        x2={xAtTime(t.ts)}
                        y1={h - padB}
                        y2={h - padB + 10}
                        stroke={gridStroke}
                        strokeOpacity="0.55"
                        strokeWidth="1"
                      />
                      <text
                        x={xAtTime(t.ts)}
                        y={h - 22}
                        fontSize={axisXSize}
                        fontWeight={axisWeight as any}
                        textAnchor={isLeft ? "start" : isRight ? "end" : "middle"}
                        fill={labelFill}
                      >
                        {t.label}
                      </text>
                    </g>
                  );
                })}
              </>
            ) : null}

            {/* series */}
            {series.map((s) => {
              const pts = s.points;
              const segments: Array<{
                i1: number;
                y1: number;
                i2: number;
                y2: number;
                muted: boolean;
                opacity: number;
              }> = [];

              // Build solid runs and "muted" connectors over gaps.
              let lastIdx: number | null = null;
              let lastY: number | null = null;
              for (let i = 0; i < pts.length; i++) {
                const p = pts[i];
                if (!p) continue;
                if (lastIdx != null && lastY != null) {
                  const gap = i - lastIdx;
                  const muted = gap > 1 || !p.present || !(pts[lastIdx]?.present ?? true);
                  segments.push({
                    i1: lastIdx,
                    y1: lastY,
                    i2: i,
                    y2: p.y,
                    muted,
                    opacity: muted ? 0.55 : 0.88,
                  });
                }
                lastIdx = i;
                lastY = p.y;
              }

              // Dots for actual datapoints
              const dots = pts
                .map((p, i) => (p ? { p, i } : null))
                .filter(Boolean) as Array<{ p: NonNullable<SeriesPoint>; i: number }>;

              // No blend-mode: overlapping colors are shown via lanes.

              return (
                <g key={s.id}>
                  {/* outline pass (under everything) */}
                  {segments.map((seg, idx) => (
                    <line
                      key={`o-${idx}`}
                      x1={xAt(seg.i1)}
                      y1={yAt(seg.y1) + laneOffset(s.id, seg.i1)}
                      x2={xAt(seg.i2)}
                      y2={yAt(seg.y2) + laneOffset(s.id, seg.i2)}
                      stroke={s.outline}
                      strokeOpacity={seg.muted ? 0.22 : 0.34}
                      strokeWidth="16"
                      strokeLinecap="round"
                    />
                  ))}
                  {segments.map((seg, idx) => (
                    <line
                      key={idx}
                      x1={xAt(seg.i1)}
                      y1={yAt(seg.y1) + laneOffset(s.id, seg.i1)}
                      x2={xAt(seg.i2)}
                      y2={yAt(seg.y2) + laneOffset(s.id, seg.i2)}
                      stroke={seg.muted ? s.colorMuted : s.color}
                      strokeOpacity={seg.opacity}
                      strokeWidth="11"
                      strokeLinecap="round"
                    />
                  ))}
                  {dots.map(({ p, i }) => (
                    <circle
                      key={i}
                      cx={xAt(i)}
                      cy={yAt(p.y) + laneOffset(s.id, i)}
                      r={p.present ? 5.2 : 4.9}
                      fill={p.present ? s.color : s.colorMuted}
                      opacity={p.present ? 0.92 : 0.55}
                    />
                  ))}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Reserve space for 2 legend rows (prevents width overflow on small phones and avoids layout jumps). */}
      {showLegend ? (
        <div className="mt-2 min-w-0 pb-1">
          <div className={size === "mini" ? "flex h-[44px] flex-wrap content-start items-center gap-2 overflow-y-auto overflow-x-hidden pr-1" : "flex h-[56px] flex-wrap content-start items-center gap-2 overflow-y-auto overflow-x-hidden pr-1"}>
            {series.map((s) => (
              <div key={s.id} className="inline-flex items-center gap-2 rounded-xl px-2 py-1 text-[11px] text-text-muted">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="max-w-[12rem] truncate">{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TrendsCard({
  defaultOpen = false,
  initialView = "lastN",
}: {
  defaultOpen?: boolean;
  initialView?: View;
} = {}) {
  const [mode, setMode] = useState<Mode>("overall");
  const [view, setView] = useState<View>(initialView);
  const [formN, setFormN] = useState(10);
  const [endIdx, setEndIdx] = useState<number | null>(null);
  const [windowMonths, setWindowMonths] = useState<WindowMonths>(6);

  const wrapRef = useRef<HTMLDivElement | null>(null);

  // lastN irrelevant here, but keep it small (we only use tournaments + positions).
  const statsQ = useQuery<StatsPlayersResponse>({
    queryKey: ["stats", "players", mode, 0],
    queryFn: () => getStatsPlayers({ mode, lastN: 0 }),
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const players = statsQ.data?.players ?? [];
  const tournamentsAll: StatsTournamentLite[] = statsQ.data?.tournaments ?? [];

  // Needed for form/cumulative
  const needMatches = view === "lastN" || view === "total";
  const matchesQs = useQueries({
    queries: players.map((p) => ({
      queryKey: ["stats", "playerMatches", mode, p.player_id],
      queryFn: () => getStatsPlayerMatches({ playerId: p.player_id }),
      enabled: needMatches && players.length > 0,
      staleTime: 0,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    })),
  });

  const tournamentsDoneSorted = useMemo(() => {
    // StatsTournamentLite doesn't include mode/status, so derive from player-matches responses.
    // Union across players to cover tournaments not played by everyone.
    const byId = new Map<number, { id: number; name: string; date: string; mode: "1v1" | "2v2"; status: string }>();
    for (const q of matchesQs as Array<{ data?: StatsPlayerMatchesResponse }>) {
      const ts = q.data?.tournaments ?? [];
      for (const t of ts) {
        if (!byId.has(t.id)) byId.set(t.id, { id: t.id, name: t.name, date: t.date, mode: t.mode, status: t.status });
      }
    }

    return Array.from(byId.values())
      .filter((t) => String(t.status) === "done" && (mode === "overall" || t.mode === mode))
      .sort((a, b) => {
        const da = new Date(a.date ?? 0).getTime();
        const db = new Date(b.date ?? 0).getTime();
        if (da !== db) return da - db;
        return a.id - b.id;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, matchesQs.map((q) => q.dataUpdatedAt).join("|")]);

  useEffect(() => {
    if (!tournamentsDoneSorted.length) {
      setEndIdx(null);
      return;
    }
    setEndIdx((prev) => {
      // Allow selecting "now" as the end of the window (even if there were no recent tournaments).
      const maxEnd = tournamentsDoneSorted.length;
      if (prev == null) return maxEnd;
      return Math.max(0, Math.min(maxEnd, prev));
    });
  }, [tournamentsDoneSorted.length]);

  const { tournaments, tids, timeSpanLabel, windowStartTs, windowEndTs } = useMemo(() => {
    const all = tournamentsDoneSorted;
    if (!all.length || endIdx == null) {
      return { tournaments: [] as StatsTournamentLite[], tids: [] as number[], timeSpanLabel: "", windowStartTs: 0, windowEndTs: 0 };
    }
    const last = all[all.length - 1];
    const lastTs = new Date(last?.date ?? 0).getTime();
    const nowTs = Date.now();
    const endTs = endIdx >= all.length ? Math.max(nowTs, lastTs) : new Date(all[endIdx]?.date ?? 0).getTime();
    const endD = new Date(endTs);
    const startD =
      windowMonths === "all"
        ? new Date(Math.min(...all.map((t) => new Date(t.date ?? 0).getTime()).filter((x) => Number.isFinite(x) && x > 0)))
        : addMonths(endD, -windowMonths);

    const window = all.filter((t) => {
      const d = new Date(t.date ?? 0);
      return d >= startD && d <= endD;
    });

    const label = windowMonths === "all" ? `All → ${fmtMonthDate(endD)}` : `${fmtMonthDate(startD)} → ${fmtMonthDate(endD)}`;
    const lite: StatsTournamentLite[] = window.map((t) => ({
      id: t.id,
      name: t.name,
      date: t.date,
      players_count: 0,
    }));
    return { tournaments: lite, tids: lite.map((t) => t.id), timeSpanLabel: label, windowStartTs: startD.getTime(), windowEndTs: endD.getTime() };
  }, [endIdx, tournamentsDoneSorted, windowMonths]);

  const perPlayer = useMemo(() => {
    const out = new Map<
      number,
      {
        // tournament_id -> points in that tournament
        tPoints: Map<number, number>;
        // tournament_id -> avg points per match over last 10 matches up to this tournament
        tForm10: Map<number, number>;
        // tournament_id -> participated in that tournament
        tPlayed: Set<number>;
      }
    >();
    if (!needMatches) return out;
    for (let i = 0; i < players.length; i++) {
      const pid = players[i].player_id;
      const q = matchesQs[i] as { data?: StatsPlayerMatchesResponse } | undefined;
      const resp = q?.data;
      const tPoints = new Map<number, number>();
      const tForm = new Map<number, number>();
      const tPlayed = new Set<number>();

      // Chronological (old -> new) for "form up to tournament".
      const tournamentsChrono = (resp?.tournaments ?? [])
        .filter((t) => t.status === "done" && (mode === "overall" || t.mode === mode))
        .slice()
        .sort((a, b) => {
          const da = new Date(a.date ?? 0).getTime();
          const db = new Date(b.date ?? 0).getTime();
          if (da !== db) return da - db;
          return a.id - b.id;
        });

      const matchPtsTimeline: number[] = [];
      for (const t of tournamentsChrono) {
        let sum = 0;
        let playedThisT = false;
        const matches = (t.matches ?? []).slice().sort((m1, m2) => (m1.order_index ?? 0) - (m2.order_index ?? 0));
        for (const m of matches) {
          const p = pointsForPlayerInMatch(m as Match, pid);
          if (p == null) continue;
          playedThisT = true;
          sum += p;
          matchPtsTimeline.push(p);
        }
        if (playedThisT) {
          tPlayed.add(t.id);
          tPoints.set(t.id, sum);
        }
        // Form after this tournament (avg of last N played matches up to now)
        tForm.set(t.id, avgLast(matchPtsTimeline, Math.max(1, formN)));
      }

      out.set(pid, { tPoints, tForm10: tForm, tPlayed });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needMatches, formN, mode, players, matchesQs.map((q) => q.dataUpdatedAt).join("|")]);

  const chart = useMemo(() => {
    const xHintLeft = fmtDate(tournaments[0]?.date);
    const xHintRight = fmtDate(tournaments[tournaments.length - 1]?.date);
    const tournamentTs = tournaments.map((t) => new Date(t.date ?? 0).getTime());
    const tournamentTitles = tournaments.map((t) => t.name);

    // Form(last N) / cumulative from matches
    let maxCum = 0;
    const series = players.map((p, idx) => {
      const pp = perPlayer.get(p.player_id);
      const tPoints = pp?.tPoints ?? new Map<number, number>();
      const tForm10 = pp?.tForm10 ?? new Map<number, number>();
      const tPlayed = pp?.tPlayed ?? new Set<number>();
      let cum = 0;
      let lastForm = 0;
      let sawAny = false;
      const c = colorForIdx(idx, players.length);
      const pts: SeriesPoint[] = tids.map((tid) => {
        const played = tPlayed.has(tid);
        const pointsThisT = tPoints.get(tid);
        if (!played || pointsThisT == null) {
          if (view === "total") {
            maxCum = Math.max(maxCum, cum);
            return { y: cum, present: false };
          }
          // form10: prefix before first appearance -> 0; later missing -> carry lastForm
          if (!sawAny) {
            lastForm = 0;
            return { y: 0, present: false };
          }
          return { y: lastForm, present: false };
        }

        if (view === "total") {
          cum += pointsThisT;
          maxCum = Math.max(maxCum, cum);
          return { y: cum, present: true };
        }
        const v = tForm10.get(tid) ?? 0;
        sawAny = true;
        lastForm = v;
        return { y: v, present: true };
      });
      return { id: p.player_id, name: p.display_name, color: c.solid, colorMuted: c.muted, outline: c.outline, points: pts };
    });

    if (view === "lastN") {
      const yMax = 3;
      const yTicks = [0, 1, 2, 3];
      return { title: `Trends (Form, last ${Math.max(1, formN)} matches)`, xHintLeft, xHintRight, yMax, yTicks, ySuffix: "", series, tournamentTs, tournamentTitles };
    }

    const yMax = Math.max(1, Math.ceil(maxCum / 10) * 10);
    const yTicks = [0, Math.floor(yMax / 2), yMax];
    return { title: "Trends (Total Points)", xHintLeft, xHintRight, yMax, yTicks, ySuffix: "", series, tournamentTs, tournamentTitles };
  }, [formN, perPlayer, players, tids, tournaments, view]);

  const matchesLoading = needMatches && matchesQs.some((q) => q.isLoading);
  const matchesError = needMatches ? matchesQs.find((q) => q.error)?.error : null;

  const Filters = (
    <div className="card-inner-flat rounded-2xl space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-9 w-20 shrink-0 items-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
            <i className="fa-solid fa-filter text-[11px]" aria-hidden="true" />
            <span>Filter</span>
          </span>
          <ModeSwitch value={mode} onChange={setMode} />
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-9 w-20 shrink-0 items-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
            <i className="fa-solid fa-eye text-[11px]" aria-hidden="true" />
            <span>View</span>
          </span>
          <ViewSwitch value={view} onChange={setView} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-9 w-20 shrink-0 items-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
            <i className="fa-solid fa-calendar-days text-[11px]" aria-hidden="true" />
            <span>Window</span>
          </span>
          <WindowSwitch value={windowMonths} onChange={setWindowMonths} />
        </div>
      </div>

      {/* Reserve vertical space even in Total view to avoid plot jumping on toggle. */}
      <div className="pt-2 border-t border-border-card-chip/40">
        <div className={view === "lastN" ? "" : "opacity-0 pointer-events-none select-none"} aria-hidden={view !== "lastN"}>
          <MetaRow size="11">
            <span>Last N</span>
            <span className="text-text-normal">N = {formN}</span>
          </MetaRow>
          <input
            type="range"
            min={1}
            max={25}
            value={formN}
            onChange={(e) => setFormN(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      {/* Timeline scrubber (6-month window). */}
      {tournamentsDoneSorted.length ? (
        <div className="pt-2 border-t border-border-card-chip/40 space-y-2">
          <MetaRow size="11">
            <span>Timeline</span>
            <span className="text-text-normal">
              {windowMonths === "all" ? "All time" : windowMonths === 12 ? "1 year" : `${windowMonths} months`}
            </span>
          </MetaRow>
          <div className="flex items-center justify-between gap-3 text-[11px] text-text-muted">
            <span className="shrink-0">{timeSpanLabel || "—"}</span>
            <span className="shrink-0">{tournaments.length} tournaments</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, tournamentsDoneSorted.length)} // allow "now" at the end
            value={endIdx ?? Math.max(0, tournamentsDoneSorted.length)}
            onChange={(e) => setEndIdx(Number(e.target.value))}
            className="w-full"
            aria-label="Timeline"
          />
        </div>
      ) : null}
    </div>
  );

  const Body = (
    <div className="flex min-h-0 flex-col gap-3">
      {Filters}

      {statsQ.isLoading ? <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Loading…</div> : null}
      {statsQ.error ? <div className="card-inner-flat rounded-2xl text-sm text-red-400">{String(statsQ.error)}</div> : null}
      {matchesLoading ? <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Loading match trends…</div> : null}
      {matchesError ? <div className="card-inner-flat rounded-2xl text-sm text-red-400">{String(matchesError)}</div> : null}

      {players.length && tournaments.length ? (
        <div>
          <MultiLineChart
            title={chart.title}
            tournamentTs={chart.tournamentTs}
            windowStartTs={windowStartTs}
            windowEndTs={windowEndTs}
            tournamentTitles={chart.tournamentTitles}
            xLabelEvery={windowMonths === 12 || windowMonths === "all" ? 2 : 1}
            xHintLeft={chart.xHintLeft}
            xHintRight={chart.xHintRight}
            yMax={chart.yMax}
            yTicks={chart.yTicks}
            ySuffix={chart.ySuffix}
            series={chart.series}
          />
        </div>
      ) : null}

      <div className="card-inner-flat rounded-2xl text-[11px] text-text-muted">
        X-axis is <span className="text-text-normal">absolute time</span> (month grid). Numbers at the bottom are{" "}
        <span className="text-text-normal">tournament titles</span>. Form is average points per match over the{" "}
        <span className="text-text-normal">last N finished matches</span>. Missing tournaments are shown as a darker connector.
      </div>
    </div>
  );

  return (
    <div
      id="stats-trends"
      ref={wrapRef}
      className="scroll-mt-[calc(env(safe-area-inset-top,0px)+128px)] sm:scroll-mt-[calc(env(safe-area-inset-top,0px)+144px)]"
    >
      <CollapsibleCard
        title={
          <span className="inline-flex items-center gap-2">
            <i className="fa-solid fa-chart-area text-text-muted" aria-hidden="true" />
            Trends
          </span>
        }
        defaultOpen={defaultOpen}
        scrollOnOpen={true}
        variant="outer"
        bodyVariant="none"
        bodyClassName="space-y-3"
      >
        {Body}
      </CollapsibleCard>
    </div>
  );
}
