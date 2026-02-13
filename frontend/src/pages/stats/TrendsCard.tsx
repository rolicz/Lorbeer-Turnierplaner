import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { MetaRow } from "../../ui/primitives/Meta";

import { getStatsPlayerMatches, getStatsPlayers } from "../../api/stats.api";
import type { Match, StatsPlayerMatchesResponse, StatsPlayersResponse, StatsTournamentLite } from "../../api/types";
import { sideBy } from "../../helpers";

type Mode = "overall" | "1v1" | "2v2";
type View = "lastN" | "total";

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
    // Do NOT clamp to window start/end.
    // We want lines to naturally enter/exit the plot when panning/zooming (instead of "sticking"
    // the first/last point to the axis and stretching the segment).
    const p = (ts - windowStartTs) / span;
    // Safety clamp for extreme out-of-window values (keeps SVG coords in a sane range).
    const pp = clamp(p, -2.5, 3.5);
    return padL + pp * (w - padL - padR);
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
                  const ts = tournamentTs[i];
                  // Only label tournaments that are within the current window; otherwise they'd all clamp
                  // to the edges and create unreadable stacks.
                  if (!Number.isFinite(ts) || ts < windowStartTs || ts > windowEndTs) return null;
                  // Clamp slightly so the most recent/oldest label can't bleed out of the plot box.
                  const xRaw = xAt(i);
                  const x = Math.max(padL + 8, Math.min(w - padR - 8, xRaw));
                  // Place labels inside the plot area, starting at the very top.
                  const y = padT + 6;
                  const [l1, l2] = wrapTwoLinesWords(name, size === "mini" ? 14 : 16);
                  const titleFont = size === "mini" ? 14 : 16;
                  const titleLine = size === "mini" ? 16 : 18;
                  return (
                    <text
                      key={i}
                      x={x}
                      y={y}
                      fontSize={titleFont}
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
                        <tspan x={x} dy={titleLine}>
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
                        // Always center labels under their gridline (including the outermost ones).
                        textAnchor="middle"
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

              const solidOpacity = 0.88;
              const fadeLen = size === "mini" ? 26 : 30; // SVG units (fixed length)
              const gradients = segments
                .filter((seg) => seg.muted)
                .map((seg) => {
                  const p1 = pts[seg.i1];
                  const p2 = pts[seg.i2];
                  const present1 = !!p1?.present;
                  const present2 = !!p2?.present;

                  const x1 = xAt(seg.i1);
                  const y1 = yAt(seg.y1) + laneOffset(s.id, seg.i1);
                  const x2 = xAt(seg.i2);
                  const y2 = yAt(seg.y2) + laneOffset(s.id, seg.i2);
                  const len = Math.hypot(x2 - x1, y2 - y1);
                  if (!Number.isFinite(len) || len <= 1e-6) return null;

                  const frac = Math.max(0, Math.min(0.45, fadeLen / len));
                  const id = `seggrad-${s.id}-${seg.i1}-${seg.i2}`;

                  const muted = { color: s.colorMuted, op: seg.opacity };
                  const solid = { color: s.color, op: solidOpacity };

                  const stops: Array<{ off: number; color: string; op: number }> = [];
                  if (present1 && present2) {
                    // Both sides played, but missing tournaments in between -> fade out, stay muted, fade in.
                    stops.push({ off: 0, ...solid });
                    stops.push({ off: frac, ...muted });
                    stops.push({ off: 1 - frac, ...muted });
                    stops.push({ off: 1, ...solid });
                  } else if (present1 && !present2) {
                    // Played -> missing
                    stops.push({ off: 0, ...solid });
                    stops.push({ off: frac, ...muted });
                    stops.push({ off: 1, ...muted });
                  } else if (!present1 && present2) {
                    // Missing -> played
                    stops.push({ off: 0, ...muted });
                    stops.push({ off: 1 - frac, ...muted });
                    stops.push({ off: 1, ...solid });
                  } else {
                    stops.push({ off: 0, ...muted });
                    stops.push({ off: 1, ...muted });
                  }

                  return { seg, id, x1, y1, x2, y2, stops };
                })
                .filter(Boolean) as Array<{
                seg: (typeof segments)[number];
                id: string;
                x1: number;
                y1: number;
                x2: number;
                y2: number;
                stops: Array<{ off: number; color: string; op: number }>;
              }>;

              // No blend-mode: overlapping colors are shown via lanes.

              return (
                <g key={s.id}>
                  {gradients.length ? (
                    <defs>
                      {gradients.map((g) => (
                        <linearGradient
                          key={g.id}
                          id={g.id}
                          gradientUnits="userSpaceOnUse"
                          x1={g.x1}
                          y1={g.y1}
                          x2={g.x2}
                          y2={g.y2}
                        >
                          {g.stops.map((st, i) => (
                            <stop
                              key={i}
                              offset={`${Math.round(st.off * 1000) / 10}%`}
                              stopColor={st.color}
                              stopOpacity={st.op}
                            />
                          ))}
                        </linearGradient>
                      ))}
                    </defs>
                  ) : null}

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
                  {segments.map((seg, idx) => {
                    if (!seg.muted) {
                      return (
                        <line
                          key={idx}
                          x1={xAt(seg.i1)}
                          y1={yAt(seg.y1) + laneOffset(s.id, seg.i1)}
                          x2={xAt(seg.i2)}
                          y2={yAt(seg.y2) + laneOffset(s.id, seg.i2)}
                          stroke={s.color}
                          strokeOpacity={seg.opacity}
                          strokeWidth="11"
                          strokeLinecap="round"
                        />
                      );
                    }

                    const g = gradients.find((x) => x.seg === seg) ?? null;
                    if (!g) {
                      return (
                        <line
                          key={idx}
                          x1={xAt(seg.i1)}
                          y1={yAt(seg.y1) + laneOffset(s.id, seg.i1)}
                          x2={xAt(seg.i2)}
                          y2={yAt(seg.y2) + laneOffset(s.id, seg.i2)}
                          stroke={s.colorMuted}
                          strokeOpacity={seg.opacity}
                          strokeWidth="11"
                          strokeLinecap="round"
                        />
                      );
                    }

                    return (
                      <line
                        key={idx}
                        x1={xAt(seg.i1)}
                        y1={yAt(seg.y1) + laneOffset(s.id, seg.i1)}
                        x2={xAt(seg.i2)}
                        y2={yAt(seg.y2) + laneOffset(s.id, seg.i2)}
                        stroke={`url(#${g.id})`}
                        strokeOpacity="1"
                        strokeWidth="11"
                        strokeLinecap="round"
                      />
                    );
                  })}
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

function clamp(x: number, lo: number, hi: number) {
  return x < lo ? lo : x > hi ? hi : x;
}

function dist2(t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

// Legacy helper used by the old ScrollZoom chart (kept for now, even if not rendered).
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.round(r.width));
      const h = Math.max(0, Math.round(r.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };

    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize, { passive: true });
    const id = window.setInterval(measure, 750);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearInterval(id);
    };
  }, []);

  return { ref, size };
}

function clampWindow(startTs: number, spanMs: number, domainStartTs: number, domainEndTs: number) {
  const span = Math.max(1, spanMs);
  let start = startTs;
  let end = start + span;
  if (start < domainStartTs) {
    start = domainStartTs;
    end = start + span;
  }
  if (end > domainEndTs) {
    end = domainEndTs;
    start = end - span;
  }
  if (start < domainStartTs) start = domainStartTs;
  return { start, end: Math.max(start + 1, end) };
}

function PanZoomTrendsChart({
  title,
  tournamentTs,
  tournamentTitles,
  yMax,
  yTicks,
  ySuffix,
  series,
}: {
  title: string;
  tournamentTs: number[];
  tournamentTitles: string[];
  yMax: number;
  yTicks: number[];
  ySuffix?: string;
  series: Array<{ id: number; name: string; color: string; colorMuted: string; outline: string; points: SeriesPoint[] }>;
}) {
  // Capture "now" once so the domain doesn't move on every render (would break panning).
  const nowTs = useMemo(() => Date.now(), []);
  const userInteractedRef = useRef(false);
  const validTs = useMemo(
    () => tournamentTs.filter((t) => Number.isFinite(t) && t > 0).slice().sort((a, b) => a - b),
    [tournamentTs]
  );
  const domainStartTs = validTs[0] ?? nowTs;
  const domainEndTs = Math.max(nowTs, validTs[validTs.length - 1] ?? nowTs);
  const domainSpan = Math.max(1, domainEndTs - domainStartTs);

  const minSpanMs = 1000 * 60 * 60 * 24 * 30 * 1; // ~1 month
  const maxSpanMs = Math.max(minSpanMs, domainSpan);
  // Default: show the whole history. Pinch/zoom (or desktop controls) to narrow down.
  const defaultSpanMs = maxSpanMs;

  const [windowEndTs, setWindowEndTs] = useState(domainEndTs);
  const [spanMs, setSpanMs] = useState(defaultSpanMs);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<
    | { mode: "none" }
    | { mode: "pan"; id: number; startX: number; startEndTs: number; span: number }
    | {
        mode: "pinch";
        ids: [number, number];
        startDist: number;
        startMidX: number;
        startSpan: number;
        startWindowStart: number;
        startWindowEnd: number;
      }
  >({ mode: "none" });
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<{
    domainStartTs: number;
    domainEndTs: number;
    minSpanMs: number;
    maxSpanMs: number;
    windowStart: number;
    windowEnd: number;
  } | null>(null);

  // Keep end anchored at "now/latest" when data changes.
  useEffect(() => {
    setWindowEndTs((prev) => Math.max(prev, domainEndTs));
  }, [domainEndTs]);
  useEffect(() => {
    setSpanMs((prev) => clamp(prev, minSpanMs, maxSpanMs));
  }, [minSpanMs, maxSpanMs]);

  // If the chart mounts while data is still loading, the initial domain can be tiny
  // (e.g. only the latest tournament). When more tournaments arrive, expand to show
  // all history unless the user already panned/zoomed.
  useEffect(() => {
    if (userInteractedRef.current) return;
    if (validTs.length < 2) return;
    setSpanMs(maxSpanMs);
    setWindowEndTs(domainEndTs);
  }, [domainEndTs, maxSpanMs, validTs.length]);

  const window = useMemo(() => {
    const span = clamp(spanMs, minSpanMs, maxSpanMs);
    const rawStart = windowEndTs - span;
    return clampWindow(rawStart, span, domainStartTs, domainEndTs);
  }, [domainEndTs, domainStartTs, maxSpanMs, minSpanMs, spanMs, windowEndTs]);

  useEffect(() => {
    stateRef.current = {
      domainStartTs,
      domainEndTs,
      minSpanMs,
      maxSpanMs,
      windowStart: window.start,
      windowEnd: window.end,
    };
  }, [domainEndTs, domainStartTs, maxSpanMs, minSpanMs, window.end, window.start]);

  const xLabelEvery = useMemo(() => {
    const months = Math.max(1, (window.end - window.start) / (30 * 24 * 3600 * 1000));
    // Roughly: label every month for <=6m, every 2 for <=12m, otherwise every 3.
    if (months <= 6) return 1;
    if (months <= 12) return 2;
    return 3;
  }, [window.end, window.start]);

  function zoomAt(factor: number, clientX: number) {
    userInteractedRef.current = true;
    const rect = surfaceRef.current?.getBoundingClientRect();
    const w = Math.max(1, rect?.width ?? 1);
    const p = clamp(clientX / w, 0, 1);
    const anchorTs = window.start + p * (window.end - window.start);

    const nextSpan = clamp((window.end - window.start) / factor, minSpanMs, maxSpanMs);
    const anchorOffset = p * nextSpan;
    const nextStart = anchorTs - anchorOffset;
    const clamped = clampWindow(nextStart, nextSpan, domainStartTs, domainEndTs);

    setSpanMs(nextSpan);
    setWindowEndTs(clamped.end);
  }

  // iOS Safari ignores `touch-action` in many cases. Add native (non-passive) listeners so
  // horizontal pan + pinch zoom works reliably without blowing up layout width.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;

    let touchMode: "none" | "pan" | "pinch" = "none";
    let panLock: "h" | "v" | null = null;
    let startX = 0;
    let startY = 0;
    let startEnd = 0;
    let startStart = 0;
    let startSpan = 0;
    let startDist = 0;
    let startMidX = 0;

    const onTouchStart = (e: TouchEvent) => {
      const st = stateRef.current;
      if (!st) return;
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touchMode = "pan";
        panLock = null;
        startX = t.clientX;
        startY = t.clientY;
        startEnd = st.windowEnd;
        startSpan = st.windowEnd - st.windowStart;
        return;
      }
      if (e.touches.length >= 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        touchMode = "pinch";
        startDist = Math.max(1, dist2(t1, t2));
        startMidX = (t1.clientX + t2.clientX) / 2;
        startStart = st.windowStart;
        startEnd = st.windowEnd;
        startSpan = st.windowEnd - st.windowStart;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const st = stateRef.current;
      if (!st) return;
      const rect = el.getBoundingClientRect();
      const w = Math.max(1, rect.width);

      if (touchMode === "pan") {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);

        if (panLock == null) {
          if (adx < 6 && ady < 6) return;
          // Lock direction once the gesture is clear.
          if (adx > ady * 0.65) panLock = "h";
          else if (ady > adx * 1.25) panLock = "v";
          else return; // keep waiting for clearer intent
        }

        if (panLock === "v") {
          // allow normal page scroll
          touchMode = "none";
          panLock = null;
          return;
        }

        e.preventDefault();
        e.stopPropagation();
        userInteractedRef.current = true;

        const span = Math.max(1, startSpan);
        const dt = (-dx / w) * span;
        const nextEnd = clamp(startEnd + dt, st.domainStartTs + span, st.domainEndTs);
        setWindowEndTs(nextEnd);
        return;
      }

      if (touchMode === "pinch") {
        if (e.touches.length < 2) return;
        e.preventDefault();
        e.stopPropagation();
        userInteractedRef.current = true;

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.max(1, dist2(t1, t2));
        const midX = (t1.clientX + t2.clientX) / 2;
        const dx = midX - startMidX;

        const p0 = clamp((startMidX - rect.left) / w, 0, 1);
        const factor = dist / startDist;
        const nextSpan = clamp(startSpan / factor, st.minSpanMs, st.maxSpanMs);

        const anchorTs = startStart + p0 * startSpan;
        const nextStart = anchorTs - p0 * nextSpan;
        const clamped0 = clampWindow(nextStart, nextSpan, st.domainStartTs, st.domainEndTs);

        const dt = (-dx / w) * nextSpan;
        const endAfterPan = clamp(clamped0.end + dt, st.domainStartTs + nextSpan, st.domainEndTs);

        setSpanMs(nextSpan);
        setWindowEndTs(endAfterPan);
      }
    };

    const onTouchEnd = () => {
      touchMode = "none";
    };

    const onWheel = (e: WheelEvent) => {
      // Make preventDefault reliable (React wheel is often passive).
      const st = stateRef.current;
      if (!st) return;
      const rect = el.getBoundingClientRect();
      const w = Math.max(1, rect.width);

      if (e.altKey || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        userInteractedRef.current = true;
        const clientX = e.clientX - rect.left;
        const p = clamp(clientX / w, 0, 1);
        const anchorTs = st.windowStart + p * (st.windowEnd - st.windowStart);
        const factor = Math.exp(-e.deltaY * 0.0022);
        const nextSpan = clamp((st.windowEnd - st.windowStart) / factor, st.minSpanMs, st.maxSpanMs);
        const nextStart = anchorTs - p * nextSpan;
        const clamped0 = clampWindow(nextStart, nextSpan, st.domainStartTs, st.domainEndTs);
        setSpanMs(nextSpan);
        setWindowEndTs(clamped0.end);
        return;
      }

      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      if (!dx) return;
      const adx = Math.abs(dx);
      const ady = Math.abs(e.deltaY);
      if (ady && adx < ady * 0.9) return;

      e.preventDefault();
      userInteractedRef.current = true;
      const span = Math.max(1, st.windowEnd - st.windowStart);
      const dt = (-dx / w) * span;
      setWindowEndTs((prev) => clamp(prev + dt, st.domainStartTs + span, st.domainEndTs));
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart as any);
      el.removeEventListener("touchmove", onTouchMove as any);
      el.removeEventListener("touchend", onTouchEnd as any);
      el.removeEventListener("touchcancel", onTouchEnd as any);
      el.removeEventListener("wheel", onWheel as any);
    };
  }, []);

  return (
    <div className="card-inner-flat rounded-2xl flex min-h-0 min-w-0 w-full max-w-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-normal">{title}</div>
          <div className="mt-0.5 text-[11px] text-text-muted">
            <span className="text-text-normal">{fmtMonthDate(new Date(window.start))}</span>
            <span className="opacity-70"> to </span>
            <span className="text-text-normal">{fmtMonthDate(new Date(window.end))}</span>
            <span className="opacity-70"> · </span>
            drag to pan, pinch to zoom
          </div>
        </div>
        {/* Desktop-only zoom buttons (mobile uses pinch). */}
        <div className="shrink-0 hidden sm:flex items-center gap-2">
          <button
            type="button"
            className="icon-button h-9 w-9 p-0 inline-flex items-center justify-center"
            onClick={() => zoomAt(1 / 1.25, (surfaceRef.current?.clientWidth ?? 0) * 0.65)}
            title="Zoom out"
          >
            <i className="fa-solid fa-magnifying-glass-minus" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button h-9 w-9 p-0 inline-flex items-center justify-center"
            onClick={() => zoomAt(1.25, (surfaceRef.current?.clientWidth ?? 0) * 0.65)}
            title="Zoom in"
          >
            <i className="fa-solid fa-magnifying-glass-plus" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={surfaceRef}
        className="mt-2 w-full max-w-full min-w-0"
        onPointerDown={(e) => {
          if (e.pointerType === "touch") return; // touch handled by native listeners (iOS Safari)
          if (e.pointerType === "mouse" && e.button !== 0) return;
          pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

          try {
            surfaceRef.current?.setPointerCapture(e.pointerId);
          } catch {
            // ignore
          }

          const pts = Array.from(pointersRef.current.entries());
          if (pts.length === 1) {
            userInteractedRef.current = true;
            gestureRef.current = {
              mode: "pan",
              id: e.pointerId,
              startX: e.clientX,
              startEndTs: window.end,
              span: window.end - window.start,
            };
            return;
          }
          if (pts.length >= 2) {
            const [a, b] = pts.slice(0, 2);
            const ax = a[1].x;
            const ay = a[1].y;
            const bx = b[1].x;
            const by = b[1].y;
            const d0 = Math.max(1, Math.hypot(ax - bx, ay - by));
            const midX0 = (ax + bx) / 2;
            gestureRef.current = {
              mode: "pinch",
              ids: [a[0], b[0]],
              startDist: d0,
              startMidX: midX0,
              startSpan: window.end - window.start,
              startWindowStart: window.start,
              startWindowEnd: window.end,
            };
          }
        }}
        onPointerMove={(e) => {
          if (!pointersRef.current.has(e.pointerId)) return;
          pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const rect = surfaceRef.current?.getBoundingClientRect();
          const w = Math.max(1, rect?.width ?? 1);

          const g = gestureRef.current;
          if (g.mode === "pan") {
            if (e.pointerId !== g.id) return;
            userInteractedRef.current = true;
            const dx = e.clientX - g.startX;
            const span = Math.max(1, g.span);
            const dt = (-dx / w) * span;
            setWindowEndTs(clamp(g.startEndTs + dt, domainStartTs + span, domainEndTs));
            return;
          }

          if (g.mode === "pinch") {
            userInteractedRef.current = true;
            const [id1, id2] = g.ids;
            const p1 = pointersRef.current.get(id1);
            const p2 = pointersRef.current.get(id2);
            if (!p1 || !p2) return;
            const dist = Math.max(1, Math.hypot(p1.x - p2.x, p1.y - p2.y));
            const midX = (p1.x + p2.x) / 2;
            const dx = midX - g.startMidX;

            const left = rect?.left ?? 0;
            const p0 = clamp((g.startMidX - left) / w, 0, 1);
            const factor = dist / g.startDist; // >1 => fingers apart => zoom in
            const nextSpan = clamp(g.startSpan / factor, minSpanMs, maxSpanMs);

            const anchorTs = g.startWindowStart + p0 * g.startSpan;
            const nextStart = anchorTs - p0 * nextSpan;
            const clamped0 = clampWindow(nextStart, nextSpan, domainStartTs, domainEndTs);

            // Midpoint drift pans while pinching (map-like).
            const dt = (-dx / w) * nextSpan;
            const endAfterPan = clamp(clamped0.end + dt, domainStartTs + nextSpan, domainEndTs);

            setSpanMs(nextSpan);
            setWindowEndTs(endAfterPan);
          }
        }}
        onPointerUp={(e) => {
          pointersRef.current.delete(e.pointerId);
          try {
            surfaceRef.current?.releasePointerCapture(e.pointerId);
          } catch {
            // ignore
          }

          const pts = Array.from(pointersRef.current.entries());
          if (!pts.length) {
            gestureRef.current = { mode: "none" };
            return;
          }
          if (pts.length === 1) {
            const [id, p] = pts[0];
            gestureRef.current = {
              mode: "pan",
              id,
              startX: p.x,
              startEndTs: window.end,
              span: window.end - window.start,
            };
            return;
          }
          // still >=2: keep pinch using first two.
          const [a, b] = pts.slice(0, 2);
          const d0 = Math.max(1, Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y));
          const midX0 = (a[1].x + b[1].x) / 2;
          gestureRef.current = {
            mode: "pinch",
            ids: [a[0], b[0]],
            startDist: d0,
            startMidX: midX0,
            startSpan: window.end - window.start,
            startWindowStart: window.start,
            startWindowEnd: window.end,
          };
        }}
        onPointerCancel={() => {
          pointersRef.current.clear();
            gestureRef.current = { mode: "none" };
        }}
        style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
      >
        <MultiLineChart
          title={title}
          tournamentTs={tournamentTs}
          windowStartTs={window.start}
          windowEndTs={window.end}
          tournamentTitles={tournamentTitles}
          xLabelEvery={xLabelEvery}
          xHintLeft={fmtMonthDate(new Date(window.start))}
          xHintRight={fmtMonthDate(new Date(window.end))}
          yMax={yMax}
          yTicks={yTicks}
          ySuffix={ySuffix}
          series={series}
          size="full"
          showLegend={true}
          showTournamentTitles={true}
          showHeader={false}
          frame="none"
        />
      </div>
    </div>
  );
}

function ScrollZoomTrendsChart({
  title,
  tournamentTs,
  tournamentTitles,
  yMax,
  yTicks,
  ySuffix,
  series,
}: {
  title: string;
  tournamentTs: number[];
  tournamentTitles: string[];
  yMax: number;
  yTicks: number[];
  ySuffix?: string;
  series: Array<{ id: number; name: string; color: string; colorMuted: string; outline: string; points: SeriesPoint[] }>;
}) {
  const initialViewportWRef = useRef<number>(0);
  useEffect(() => {
    // Capture once; on iOS Safari the "layout viewport" width can grow if something overflows.
    const w = document?.documentElement?.clientWidth || window.innerWidth || 0;
    initialViewportWRef.current = Math.max(0, Math.floor(w));
  }, []);

  const validTs = useMemo(
    () => tournamentTs.filter((t) => Number.isFinite(t) && t > 0).slice().sort((a, b) => a - b),
    [tournamentTs]
  );
  const domainStartTs = validTs[0] ?? Date.now();
  const domainEndTs = Math.max(Date.now(), validTs[validTs.length - 1] ?? Date.now());
  const spanMs = Math.max(1, domainEndTs - domainStartTs);

  const { ref: frameRef, size: frameSize } = useElementSize<HTMLDivElement>();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomAnchorRef = useRef<{ anchorTs: number; clientX: number } | null>(null);
  const zoomRef = useRef(zoom);
  const didInitScrollRef = useRef(false);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const plotH = Math.max(160, frameSize.h || 260);
  const padL = 56;
  const padR = 14;
  const padT = 14;
  const padB = 76;
  const axisLabelSize = 12;
  const axisXSize = 11;
  const axisWeight = 600;

  const monthsApprox = clamp(spanMs / (30 * 24 * 3600 * 1000), 1, 240);
  const pxPerMonthBase = 110;
  const contentW = useMemo(() => {
    // Mobile Safari can get into a runaway loop where this component grows,
    // gets re-measured wider, and grows again. Clamp to viewport width.
    const vw0 = initialViewportWRef.current || (typeof window !== "undefined" ? Math.max(0, Math.floor(window.innerWidth || 0)) : 0);
    const baseW = frameSize.w > 0 ? frameSize.w : vw0;
    const safeW = vw0 > 0 ? Math.min(baseW, vw0) : baseW;

    const w = monthsApprox * pxPerMonthBase * zoom;
    return Math.max(safeW || 0, Math.round(w));
  }, [frameSize.w, monthsApprox, zoom]);

  const xAtTime = (ts: number) => {
    const t = Math.max(domainStartTs, Math.min(domainEndTs, ts));
    const p = (t - domainStartTs) / spanMs;
    return padL + p * Math.max(1, contentW - padL - padR);
  };
  const yAt = (v: number) => {
    const vv = Math.max(0, Math.min(yMax, v));
    const innerH = Math.max(1, plotH - padT - padB);
    return padT + (1 - vv / Math.max(1e-6, yMax)) * innerH;
  };

  const gridStroke = "rgb(var(--color-border-card-inner))";
  const labelFill = "rgb(var(--color-text-muted))";

  const xTicksAll = useMemo(() => monthTicksBetween(domainStartTs, domainEndTs), [domainEndTs, domainStartTs]);
  const xLabelEvery = useMemo(() => {
    // Target ~110px between labels for readability.
    const targetPx = 110;
    const maxLabels = Math.max(1, Math.floor((contentW - padL - padR) / targetPx));
    const every = Math.ceil(xTicksAll.length / maxLabels);
    return clamp(every, 1, 6);
  }, [contentW, xTicksAll.length]);
  const xTicksLabeled = useMemo(() => {
    const every = Math.max(1, Math.trunc(xLabelEvery) || 1);
    if (every === 1) return xTicksAll;
    const out = xTicksAll.filter((_, idx) => idx % every === 0);
    const last = xTicksAll[xTicksAll.length - 1];
    if (last && !out.some((t) => t.ts === last.ts)) out.push(last);
    return out;
  }, [xLabelEvery, xTicksAll]);

  // Keep the most recent data in view on first mount.
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc || didInitScrollRef.current) return;
    if (contentW <= sc.clientWidth) return;
    const raf = requestAnimationFrame(() => {
      sc.scrollLeft = sc.scrollWidth - sc.clientWidth;
      didInitScrollRef.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [contentW]);

  // Re-anchor scroll position after zoom changes (wheel/pinch).
  useEffect(() => {
    const sc = scrollerRef.current;
    const a = zoomAnchorRef.current;
    if (!sc || !a) return;
    const x = xAtTime(a.anchorTs);
    sc.scrollLeft = clamp(x - a.clientX, 0, Math.max(0, contentW - sc.clientWidth));
    zoomAnchorRef.current = null;
  }, [contentW, domainStartTs, domainEndTs]); // depends on xAtTime()

  function zoomBy(factor: number, anchorTs: number, clientX: number) {
    zoomAnchorRef.current = { anchorTs, clientX };
    setZoom((z) => clamp(z * factor, 0.6, 4.0));
  }

  function tsAtClientX(clientX: number) {
    const sc = scrollerRef.current;
    if (!sc) return domainEndTs;
    const x = sc.scrollLeft + clientX;
    const p = clamp((x - padL) / Math.max(1, contentW - padL - padR), 0, 1);
    return domainStartTs + p * spanMs;
  }

  // Attach native listeners with `passive:false` so preventDefault() works:
  // - Ctrl+wheel otherwise zooms the whole page.
  useEffect(() => {
    const sc = scrollerRef.current;
    if (!sc) return;

    const onWheel = (e: WheelEvent) => {
      // Prefer Ctrl/Meta+wheel (trackpad pinch), but also allow Alt+wheel as a reliable fallback.
      if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
      e.preventDefault();
      const rect = sc.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const anchorTs = tsAtClientX(clientX);
      const factor = Math.exp(-e.deltaY * 0.0022);
      zoomBy(factor, anchorTs, clientX);
    };

    sc.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      sc.removeEventListener("wheel", onWheel as any);
    };
    // Intentionally depend on a minimal set; handlers read latest values via refs/state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentW, domainEndTs, domainStartTs]);

  // Lanes for overlap visibility (reuse the same idea, but in pixel coords).
  const laneOffsetsByIndex = useMemo(() => {
    const threshold = 2.25;
    const laneGap = 5;
    const out = new Map<number, Map<number, number>>();
    const n = tournamentTs.length;
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
  }, [plotH, series, tournamentTs.length, yMax]); // yAt depends on plotH/yMax

  const laneOffset = (seriesId: number, idx: number) => laneOffsetsByIndex.get(idx)?.get(seriesId) ?? 0;

  const showTournamentTitles = true;

  return (
    <div className="card-inner-flat rounded-2xl flex min-h-0 min-w-0 w-full max-w-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-normal">{title}</div>
          <div className="mt-0.5 text-[11px] text-text-muted">
            Pan: scroll · Zoom: slider / buttons (Alt+wheel works on desktop)
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            className="icon-button h-9 w-9 p-0 inline-flex items-center justify-center"
            onClick={() => zoomBy(1 / 1.2, domainEndTs, (scrollerRef.current?.clientWidth ?? 0) * 0.7)}
            title="Zoom out"
          >
            <i className="fa-solid fa-magnifying-glass-minus" aria-hidden="true" />
          </button>
          <input
            type="range"
            min={0.6}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => {
              const sc = scrollerRef.current;
              const clientX = (sc?.clientWidth ?? 0) * 0.65;
              const anchorTs = tsAtClientX(clientX);
              zoomAnchorRef.current = { anchorTs, clientX };
              setZoom(clamp(Number(e.target.value), 0.6, 4.0));
            }}
            className="w-24 sm:w-32"
            aria-label="Zoom"
            title="Zoom"
          />
          <button
            type="button"
            className="icon-button h-9 w-9 p-0 inline-flex items-center justify-center"
            onClick={() => zoomBy(1.2, domainEndTs, (scrollerRef.current?.clientWidth ?? 0) * 0.7)}
            title="Zoom in"
          >
            <i className="fa-solid fa-magnifying-glass-plus" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div ref={frameRef} className="mt-2 h-[200px] sm:h-[220px] lg:h-[340px] min-h-0 min-w-0 w-full max-w-full">
        <div
          ref={scrollerRef}
          className="relative h-full w-full max-w-full min-w-0 overflow-x-auto overflow-y-hidden rounded-2xl border border-border-card-chip/55 bg-bg-card-chip shadow-sm"
          style={{
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-x",
            overscrollBehaviorX: "contain",
            maxWidth: "100%",
            contain: "layout paint",
          }}
        >
          <div style={{ width: contentW, height: plotH }} className="relative">
            {/* Plot background (keep the subtle tint you already liked). */}
            <div className="pointer-events-none absolute inset-0 bg-white/26" />
            <svg
              className="relative block"
              width={contentW}
              height={plotH}
              viewBox={`0 0 ${contentW} ${plotH}`}
              aria-label={title}
            >
              {/* x grid */}
              {xTicksAll.map((t) => (
                <line
                  key={t.ts}
                  x1={xAtTime(t.ts)}
                  x2={xAtTime(t.ts)}
                  y1={padT}
                  y2={plotH - padB}
                  stroke={gridStroke}
                  strokeOpacity="0.48"
                  strokeWidth="1.2"
                />
              ))}

              {/* y grid */}
              {yTicks.map((t) => (
                <g key={t}>
                  <line
                    x1={padL}
                    x2={contentW - padR}
                    y1={yAt(t)}
                    y2={yAt(t)}
                    stroke={gridStroke}
                    strokeOpacity={t === 0 ? 0.72 : 0.48}
                    strokeWidth="1.2"
                  />
                  <text
                    x={padL - 10}
                    y={yAt(t) + 4}
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
                x2={contentW - padR}
                y1={plotH - padB}
                y2={plotH - padB}
                stroke={gridStroke}
                strokeOpacity="0.55"
                strokeWidth="1"
              />

              {/* tournament markers */}
              {tournamentTs.length ? (
                <>
                  {tournamentTs.map((ts, i) => (
                    <circle
                      key={i}
                      cx={xAtTime(ts)}
                      cy={plotH - padB}
                      r={3.2}
                      fill="rgb(var(--color-text-muted))"
                      opacity="0.22"
                    />
                  ))}
                </>
              ) : null}

              {/* tournament titles (vertical, two lines) */}
              {showTournamentTitles && tournamentTitles.length ? (
                <>
                  {tournamentTitles.map((name, i) => {
                    const ts = tournamentTs[i];
                    if (!Number.isFinite(ts) || ts <= 0) return null;
                    const xRaw = xAtTime(ts);
                    const x = Math.max(padL + 8, Math.min(contentW - padR - 8, xRaw));
                    const y = padT + 6;
                    const [l1, l2] = wrapTwoLinesWords(name, 16);
                    const titleFont = 10;
                    const titleLine = 12;
                    return (
                      <text
                        key={i}
                        x={x}
                        y={y}
                        fontSize={titleFont}
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
                          <tspan x={x} dy={titleLine}>
                            {l2}
                          </tspan>
                        ) : null}
                      </text>
                    );
                  })}
                </>
              ) : null}

              {/* x labels */}
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
                          y1={plotH - padB}
                          y2={plotH - padB + 8}
                          stroke={gridStroke}
                          strokeOpacity="0.55"
                          strokeWidth="1"
                        />
                        <text
                          x={xAtTime(t.ts)}
                          y={plotH - 18}
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
                const segments: Array<{ i1: number; y1: number; i2: number; y2: number; muted: boolean; opacity: number }> = [];
                let lastIdx: number | null = null;
                let lastY: number | null = null;
                for (let i = 0; i < pts.length; i++) {
                  const p = pts[i];
                  if (!p) continue;
                  if (lastIdx != null && lastY != null) {
                    const gap = i - lastIdx;
                    const muted = gap > 1 || !p.present || !(pts[lastIdx]?.present ?? true);
                    segments.push({ i1: lastIdx, y1: lastY, i2: i, y2: p.y, muted, opacity: muted ? 0.55 : 0.88 });
                  }
                  lastIdx = i;
                  lastY = p.y;
                }

                const dots = pts
                  .map((p, i) => (p ? { p, i } : null))
                  .filter(Boolean) as Array<{ p: NonNullable<SeriesPoint>; i: number }>;

                const solidOpacity = 0.88;
                const fadeLen = 28;
                const gradients = segments
                  .filter((seg) => seg.muted)
                  .map((seg) => {
                    const p1 = pts[seg.i1];
                    const p2 = pts[seg.i2];
                    const present1 = !!p1?.present;
                    const present2 = !!p2?.present;
                    const x1 = xAtTime(tournamentTs[seg.i1] ?? domainStartTs);
                    const y1 = yAt(seg.y1) + laneOffset(s.id, seg.i1);
                    const x2 = xAtTime(tournamentTs[seg.i2] ?? domainStartTs);
                    const y2 = yAt(seg.y2) + laneOffset(s.id, seg.i2);
                    const len = Math.hypot(x2 - x1, y2 - y1);
                    if (!Number.isFinite(len) || len <= 1e-6) return null;
                    const frac = Math.max(0, Math.min(0.45, fadeLen / len));
                    const id = `seggrad-scroll-${s.id}-${seg.i1}-${seg.i2}`;
                    const muted = { color: s.colorMuted, op: seg.opacity };
                    const solid = { color: s.color, op: solidOpacity };
                    const stops: Array<{ off: number; color: string; op: number }> = [];
                    if (present1 && present2) {
                      stops.push({ off: 0, ...solid });
                      stops.push({ off: frac, ...muted });
                      stops.push({ off: 1 - frac, ...muted });
                      stops.push({ off: 1, ...solid });
                    } else if (present1 && !present2) {
                      stops.push({ off: 0, ...solid });
                      stops.push({ off: frac, ...muted });
                      stops.push({ off: 1, ...muted });
                    } else if (!present1 && present2) {
                      stops.push({ off: 0, ...muted });
                      stops.push({ off: 1 - frac, ...muted });
                      stops.push({ off: 1, ...solid });
                    } else {
                      stops.push({ off: 0, ...muted });
                      stops.push({ off: 1, ...muted });
                    }
                    return { seg, id, x1, y1, x2, y2, stops };
                  })
                  .filter(Boolean) as Array<{
                  seg: (typeof segments)[number];
                  id: string;
                  x1: number;
                  y1: number;
                  x2: number;
                  y2: number;
                  stops: Array<{ off: number; color: string; op: number }>;
                }>;

                return (
                  <g key={s.id}>
                    {gradients.length ? (
                      <defs>
                        {gradients.map((g) => (
                          <linearGradient
                            key={g.id}
                            id={g.id}
                            gradientUnits="userSpaceOnUse"
                            x1={g.x1}
                            y1={g.y1}
                            x2={g.x2}
                            y2={g.y2}
                          >
                            {g.stops.map((st, i) => (
                              <stop
                                key={i}
                                offset={`${Math.round(st.off * 1000) / 10}%`}
                                stopColor={st.color}
                                stopOpacity={st.op}
                              />
                            ))}
                          </linearGradient>
                        ))}
                      </defs>
                    ) : null}

                    {segments.map((seg, idx) => {
                      const x1 = xAtTime(tournamentTs[seg.i1] ?? domainStartTs);
                      const x2 = xAtTime(tournamentTs[seg.i2] ?? domainStartTs);
                      const y1 = yAt(seg.y1) + laneOffset(s.id, seg.i1);
                      const y2 = yAt(seg.y2) + laneOffset(s.id, seg.i2);
                      if (!seg.muted) {
                        return (
                          <line
                            key={idx}
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke={s.color}
                            strokeOpacity={seg.opacity}
                            strokeWidth="2.6"
                            strokeLinecap="round"
                          />
                        );
                      }
                      const g = gradients.find((x) => x.seg === seg) ?? null;
                      return (
                        <line
                          key={idx}
                          x1={x1}
                          y1={y1}
                          x2={x2}
                          y2={y2}
                          stroke={g ? `url(#${g.id})` : s.colorMuted}
                          strokeOpacity="1"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                        />
                      );
                    })}

                    {dots.map(({ p, i }) => {
                      const ts = tournamentTs[i];
                      if (!Number.isFinite(ts) || ts <= 0) return null;
                      return (
                        <circle
                          key={i}
                          cx={xAtTime(ts)}
                          cy={yAt(p.y) + laneOffset(s.id, i)}
                          r={p.present ? 3.4 : 3.2}
                          fill={p.present ? s.color : s.colorMuted}
                          opacity={p.present ? 0.92 : 0.55}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      <div className="mt-2 min-w-0 pb-1">
        <div className="flex h-[56px] flex-wrap content-start items-center gap-2 overflow-y-auto overflow-x-hidden pr-1">
          {series.map((s) => (
            <div key={s.id} className="inline-flex items-center gap-2 rounded-xl px-2 py-1 text-[11px] text-text-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="max-w-[12rem] truncate">{s.name}</span>
            </div>
          ))}
        </div>
      </div>
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

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const qc = useQueryClient();

  // lastN irrelevant here, but keep it small (we only use tournaments + positions).
  const statsQ = useQuery<StatsPlayersResponse>({
    queryKey: ["stats", "players", mode, 0],
    queryFn: () => getStatsPlayers({ mode, lastN: 0 }),
    placeholderData: keepPreviousData,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const players = statsQ.data?.players ?? [];
  const tournamentsAll: StatsTournamentLite[] = statsQ.data?.tournaments ?? [];

  // Warmup: prefetch the lightweight players+tourneys payload for other modes so toggling is instant.
  useEffect(() => {
    const modes: Mode[] = ["overall", "1v1", "2v2"];
    for (const m of modes) {
      void qc.prefetchQuery({
        queryKey: ["stats", "players", m, 0],
        queryFn: () => getStatsPlayers({ mode: m, lastN: 0 }),
        staleTime: 30_000,
      });
    }
  }, [qc]);

  // Needed for form/cumulative
  const needMatches = view === "lastN" || view === "total";
  const matchesQs = useQueries({
    queries: players.map((p) => ({
      queryKey: ["stats", "playerMatches", p.player_id],
      queryFn: () => getStatsPlayerMatches({ playerId: p.player_id }),
      enabled: needMatches && players.length > 0,
      placeholderData: keepPreviousData,
      staleTime: 30_000,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
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

  const { tournaments, tids } = useMemo(() => {
    const all = tournamentsDoneSorted;
    const lite: StatsTournamentLite[] = all.map((t) => ({
      id: t.id,
      name: t.name,
      date: t.date,
      players_count: 0,
    }));
    return { tournaments: lite, tids: lite.map((t) => t.id) };
  }, [tournamentsDoneSorted]);

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
  const busy = statsQ.isFetching || (needMatches && matchesQs.some((q) => q.isFetching));

  const Filters = (
    <div className="card-inner-flat rounded-2xl space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-9 w-20 shrink-0 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
            <i className="fa-solid fa-filter text-[11px]" aria-hidden="true" />
            <span>Filter</span>
          </span>
          <ModeSwitch value={mode} onChange={setMode} />
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-9 w-20 shrink-0 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
            <i className="fa-solid fa-eye text-[11px]" aria-hidden="true" />
            <span>View</span>
          </span>
          <ViewSwitch value={view} onChange={setView} />
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

    </div>
  );

  const Body = (
    <div className="flex min-h-0 flex-col gap-3">
      <ErrorToastOnError error={statsQ.error} title="Trends loading failed" />
      <ErrorToastOnError error={matchesError} title="Trends loading failed" />
      {Filters}

      <div className="min-w-0 relative" style={{ overflowAnchor: "none" }}>
        {players.length && tournaments.length ? (
          <PanZoomTrendsChart
            title={chart.title}
            tournamentTs={chart.tournamentTs}
            tournamentTitles={chart.tournamentTitles}
            yMax={chart.yMax}
            yTicks={chart.yTicks}
            ySuffix={chart.ySuffix}
            series={chart.series}
          />
        ) : (
          <div className="card-inner-flat rounded-2xl h-[200px] sm:h-[220px] lg:h-[340px] flex items-center justify-center text-sm text-text-muted">
            {statsQ.isLoading ? "Loading…" : "Not enough data yet."}
          </div>
        )}

        {busy ? (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-3">
            <div className="rounded-xl bg-bg-card-outer/70 px-2 py-1 text-[11px] text-text-muted">
              Updating…
            </div>
          </div>
        ) : null}
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
