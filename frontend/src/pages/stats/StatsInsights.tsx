import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { LineChart, Table2, Grid3x3, UserRound, Flame, Star, Medal, Award, Trophy, ChevronRight } from "lucide-react";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import { StarsFA } from "../../ui/primitives/StarsFA";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";
import { getStatsRatings, getStatsPlayers, getStatsPlayerMatches, getStatsH2H, getStatsStreaks } from "../../api/stats.api";
import { getCup, listCupDefs } from "../../api/cup.api";
import { cupColorVarForKey, rgbFromCssVar } from "../../cupColors";
import { listClubs } from "../../api/clubs.api";
import type { Club, Match, StatsScope, StatsH2HPair, StatsH2HOpponentRow, StatsPlayerMatchesTournament, StatsStreakCategory, StatsStreakRun } from "../../api/types";
import type { StatsMode } from "./StatsControls";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { usePlayerColors } from "./usePlayerColors";
import { Sparkline, Radar, TrendChart, ChipGroup } from "./charts";
import { MatchHistoryList } from "./MatchHistoryList";
import { PlayerPicker } from "./PlayerPicker";
import CupCard from "../dashboard/CupCard";

type Tab = "trends" | "table" | "positions" | "h2h" | "streaks" | "stars" | "player" | "records" | "cups";

type Row = {
  id: number; name: string; pts: number; rating: number;
  played: number; wins: number; draws: number; losses: number;
  gf: number; ga: number; gd: number; form: number[]; formAvg: number;
};

// ---- shared data ----------------------------------------------------------
function useStandings(mode: StatsMode, scope: StatsScope) {
  const ratingsQ = useQuery({
    queryKey: ["stats", "ratings", mode, scope],
    queryFn: () => getStatsRatings({ mode, scope }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const playersQ = useQuery({
    queryKey: ["stats", "players", mode, 12],
    queryFn: () => getStatsPlayers({ mode, lastN: 12 }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const formById = useMemo(() => {
    const m = new Map<number, { pts: number[]; avg: number }>();
    for (const p of playersQ.data?.players ?? []) m.set(Number(p.player_id), { pts: (p.lastN_pts ?? []).map(Number), avg: Number(p.lastN_avg_pts ?? 0) });
    return m;
  }, [playersQ.data]);
  const rows = useMemo<Row[]>(() => (ratingsQ.data?.rows ?? []).map((r) => {
    const f = formById.get(Number(r.player.id));
    return {
      id: Number(r.player.id), name: r.player.display_name, pts: Number(r.pts), rating: Number(r.rating),
      played: r.played, wins: r.wins, draws: r.draws, losses: r.losses, gf: r.gf, ga: r.ga, gd: r.gd,
      form: f?.pts ?? [], formAvg: f?.avg ?? 0,
    };
  }), [ratingsQ.data, formById]);
  return { rows, loading: ratingsQ.isLoading && !ratingsQ.data };
}

// ---- per-match helpers ----------------------------------------------------
function sideOf(m: Match, pid: number): "A" | "B" | null {
  const a = m.sides.find((s) => s.side === "A");
  const b = m.sides.find((s) => s.side === "B");
  if (a?.players.some((p) => p.id === pid)) return "A";
  if (b?.players.some((p) => p.id === pid)) return "B";
  return null;
}
function matchStats(m: Match, pid: number): { pts: number; gf: number; ga: number; res: "W" | "D" | "L" } | null {
  if (m.state !== "finished") return null;
  const side = sideOf(m, pid);
  if (!side) return null;
  const me = m.sides.find((s) => s.side === side)!;
  const opp = m.sides.find((s) => s.side !== side)!;
  const mg = Number(me.goals ?? 0), og = Number(opp.goals ?? 0);
  const res = mg > og ? "W" : mg < og ? "L" : "D";
  return { pts: res === "W" ? 3 : res === "D" ? 1 : 0, gf: mg, ga: og, res };
}

// ---- small controls -------------------------------------------------------
function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-bg-card-chip/60 accent-[rgb(var(--color-accent))]"
      />
      <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-text-normal">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      {children}
    </div>
  );
}

// ==========================================================================
//  TRENDS — interactive
// ==========================================================================
type Metric = "points" | "goals" | "conceded" | "gd" | "winrate";
type ViewMode = "per" | "cumulative" | "rolling";

const METRIC_OPTS: { key: Metric; label: string }[] = [
  { key: "points", label: "Points" },
  { key: "goals", label: "Goals" },
  { key: "conceded", label: "Conceded" },
  { key: "gd", label: "Goal diff" },
  { key: "winrate", label: "Win %" },
];

type RangeKey = "1y" | "2y" | "all";

function ToggleChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={"rounded-full px-2.5 py-1 text-xs transition focus-ring " + (on ? "bg-accent/15 font-medium text-accent ring-1 ring-inset ring-accent/40" : "bg-bg-card-chip/50 text-text-muted hover:text-text-normal")}
    >
      {children}
    </button>
  );
}

function TrendsExplorer({ mode, scope, rows, initialMetric, initialView }: { mode: StatsMode; scope: StatsScope; rows: Row[]; initialMetric?: Metric; initialView?: ViewMode }) {
  const { colorOf } = usePlayerColors();
  const [metric, setMetric] = useState<Metric>(initialMetric ?? "points");
  const [view, setView] = useState<ViewMode>(initialView ?? "cumulative");
  const [rollN, setRollN] = useState(10);
  const [range, setRange] = useState<RangeKey>("1y");
  const [perMatch, setPerMatch] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [now] = useState(() => Date.now());
  const [manualWin, setManualWin] = useState<{ t0: number; t1: number } | null>(null);
  const [plotW, setPlotW] = useState(320);

  const matchesQs = useQueries({
    queries: rows.map((r) => ({
      queryKey: ["stats", "playerMatches", r.id, scope],
      queryFn: () => getStatsPlayerMatches({ playerId: r.id, scope }),
      enabled: rows.length > 0,
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    })),
  });
  const loading = matchesQs.some((q) => q.isLoading && !q.data);

  // Win % is already a rate; cumulative + the per-match modifier only apply to absolute metrics.
  const allowsCumulative = metric !== "winrate";
  const effView: ViewMode = !allowsCumulative && view === "cumulative" ? "rolling" : view;
  const applyPM = perMatch && metric !== "winrate";

  // Series computed over ALL events; the visible date window (below) pans/zooms the view.
  const { events, series } = useMemo(() => {
    const perPlayer = new Map<number, Map<number, { v: number; played: number }>>();
    const tInfo = new Map<number, { date: string; name: string }>();
    rows.forEach((r, i) => {
      const data = matchesQs[i]?.data as { tournaments: StatsPlayerMatchesTournament[] } | undefined;
      const vals = new Map<number, { v: number; played: number }>();
      for (const t of data?.tournaments ?? []) {
        if (mode !== "overall" && t.mode !== mode) continue;
        let pts = 0, gf = 0, ga = 0, w = 0, played = 0, any = false;
        for (const m of t.matches) {
          const s = matchStats(m, r.id);
          if (!s) continue;
          any = true; played++; pts += s.pts; gf += s.gf; ga += s.ga; if (s.res === "W") w++;
        }
        if (!any) continue;
        tInfo.set(t.id, { date: t.date, name: t.name });
        const v = metric === "points" ? pts : metric === "goals" ? gf : metric === "conceded" ? ga
          : metric === "gd" ? gf - ga : (played ? (w / played) * 100 : 0);
        vals.set(t.id, { v, played });
      }
      perPlayer.set(r.id, vals);
    });
    const tsOf = (tid: number) => new Date(tInfo.get(tid)?.date ?? 0).getTime();
    const allTids = [...tInfo.keys()].sort((a, b) => tsOf(a) - tsOf(b) || a - b);
    const events = allTids.map((tid) => ({ ts: tsOf(tid), label: tInfo.get(tid)?.name ?? "" }));

    const series = rows.map((r) => {
      const vals = perPlayer.get(r.id) ?? new Map<number, { v: number; played: number }>();
      let cumV = 0, cumP = 0;
      const full = allTids.map((tid) => {
        const cell = vals.get(tid);
        if (!cell) return null;
        cumV += cell.v; cumP += cell.played;
        return { v: cell.v, played: cell.played, cumV, cumP };
      });
      const base = (i: number): number | null => {
        const c = full[i];
        if (!c) return null;
        return applyPM ? (c.played ? c.v / c.played : null) : c.v;
      };
      const points = allTids.map((_, i) => {
        const c = full[i];
        if (effView === "cumulative") {
          if (!c) return null;
          return applyPM ? (c.cumP ? c.cumV / c.cumP : null) : c.cumV;
        }
        if (effView === "per") return base(i);
        const wv: number[] = [];
        for (let j = i; j >= 0 && wv.length < rollN; j--) { const b = base(j); if (b != null) wv.push(b); }
        return wv.length ? wv.reduce((a, b) => a + b, 0) / wv.length : null;
      });
      const c = colorOf(r.id);
      return { id: r.id, name: r.name, color: c.solid, points: hidden.has(r.id) ? points.map(() => null) : points };
    });
    return { events, series };
  }, [rows, matchesQs, metric, effView, rollN, hidden, mode, applyPM, colorOf]);

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
  const winRef = useRef(win);
  useEffect(() => { winRef.current = win; }, [win]);
  const boundsRef = useRef({ dataMin, dataMax });
  useEffect(() => { boundsRef.current = { dataMin, dataMax }; }, [dataMin, dataMax]);

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

  // Pinch = zoom x-axis window; one-finger horizontal drag = pan; vertical = page scroll.
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const clampWin = (t0: number, t1: number) => {
      const { dataMin: lo, dataMax: hi } = boundsRef.current;
      const full = Math.max(DAY, hi - lo);
      const w = Math.min(Math.max(t1 - t0, 20 * DAY), full);
      let nt0 = t0;
      let nt1 = t0 + w;
      if (nt1 > hi) { nt1 = hi; nt0 = hi - w; }
      if (nt0 < lo) { nt0 = lo; nt1 = lo + w; }
      return { t0: nt0, t1: Math.min(nt1, hi) };
    };
    let pinch = false;
    let panDecided: boolean | null = null;
    let startDist = 0;
    let startMidFrac = 0;
    let startX = 0;
    let startY = 0;
    let startW = { t0: 0, t1: 0 };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinch = true; panDecided = null;
        startDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const r = el.getBoundingClientRect();
        startMidFrac = Math.max(0, Math.min(1, ((e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left) / Math.max(1, r.width)));
        startW = winRef.current;
      } else if (e.touches.length === 1) {
        pinch = false; panDecided = null;
        startX = e.touches[0].clientX; startY = e.touches[0].clientY; startW = winRef.current;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const f = Math.max(0.05, dist / Math.max(1, startDist));
        const w0 = startW.t1 - startW.t0;
        const tm = startW.t0 + startMidFrac * w0;
        const newW = w0 / f;
        setManualWin(clampWin(tm - startMidFrac * newW, tm + (1 - startMidFrac) * newW));
      } else if (!pinch && e.touches.length === 1) {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (panDecided === null) {
          if (Math.abs(dx) > Math.abs(dy) + 4) panDecided = true;
          else if (Math.abs(dy) > Math.abs(dx) + 4) panDecided = false;
        }
        if (panDecided) {
          e.preventDefault();
          const w0 = startW.t1 - startW.t0;
          const shift = -(dx / Math.max(1, el.clientWidth)) * w0;
          setManualWin(clampWin(startW.t0 + shift, startW.t1 + shift));
        }
      }
    };
    const onEnd = (e: TouchEvent) => { if (e.touches.length === 0) { pinch = false; panDecided = null; } };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const allY = series.flatMap((s) => s.points.filter((p): p is number => p != null));
  const yMax = Math.max(1, ...allY);
  const yMin = Math.min(0, ...allY);

  return (
    <div className="space-y-3">
      {/* fixed-size plot — pinch zooms the x-axis, drag pans */}
      <div>
        <div ref={plotRef} className="rounded-2xl border border-border-card-chip/40 bg-bg-card-inner/40 p-2" data-no-swipe-nav>
          {loading ? (
            <InlineLoading label="Loading…" />
          ) : (
            <TrendChart events={events} series={series} yMax={Math.ceil(yMax)} yMin={Math.floor(yMin)} width={plotW - 16} viewT0={win.t0} viewT1={win.t1} showLabels={showLabels} height={240} />
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-text-muted">
          <span>Pinch to zoom · drag to pan</span>
          {manualWin ? <button type="button" className="font-medium text-accent" onClick={() => setManualWin(null)}>Reset zoom</button> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {rows.map((r) => {
            const c = colorOf(r.id);
            const on = !hidden.has(r.id);
            return (
              <button key={r.id} type="button"
                onClick={() => setHidden((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition " + (on ? "bg-bg-card-chip/60 text-text-normal" : "bg-bg-card-chip/20 text-text-muted line-through")}>
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
            {metric !== "winrate" ? <ToggleChip on={perMatch} onClick={() => setPerMatch((v) => !v)}>Per match</ToggleChip> : null}
          </div>
        </Field>
        <Field label="View">
          <ChipGroup<ViewMode> value={effView} onChange={setView} ariaLabel="View"
            options={[
              ...(allowsCumulative ? [{ key: "cumulative" as ViewMode, label: "Cumulative" }] : []),
              { key: "per", label: "Per event" },
              { key: "rolling", label: "Last N" },
            ]} />
        </Field>
        {effView === "rolling" ? (
          <Slider label="Last N" value={rollN} min={2} max={Math.max(3, Math.min(20, events.length || 10))} onChange={setRollN} />
        ) : null}
        <Field label="Range">
          <ChipGroup<RangeKey> value={range} onChange={(r) => { setRange(r); setManualWin(null); }} ariaLabel="Range"
            options={[{ key: "1y", label: "1 year" }, { key: "2y", label: "2 years" }, { key: "all", label: "All time" }]} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip on={showLabels} onClick={() => setShowLabels((v) => !v)}>Tournament names</ToggleChip>
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
//  TABLE — sortable, many derived metrics
// ==========================================================================
type ColDef = {
  key: string;
  label: string;
  val: (r: Row) => number;
  fmt: (n: number, r: Row) => string;
  cls?: string;
  bold?: boolean;
};

const f2 = (n: number) => n.toFixed(2);
const TABLE_COLS: ColDef[] = [
  { key: "pts", label: "Pts", val: (r) => r.pts, fmt: (n) => String(n), bold: true },
  { key: "ppm", label: "PPM", val: (r) => (r.played ? r.pts / r.played : 0), fmt: (_n, r) => (r.played ? f2(r.pts / r.played) : "—") },
  { key: "played", label: "P", val: (r) => r.played, fmt: (n) => String(n), cls: "text-text-muted" },
  { key: "wins", label: "W", val: (r) => r.wins, fmt: (n) => String(n), cls: "text-status-text-green" },
  { key: "draws", label: "D", val: (r) => r.draws, fmt: (n) => String(n), cls: "text-amber-300" },
  { key: "losses", label: "L", val: (r) => r.losses, fmt: (n) => String(n), cls: "text-[color:rgb(var(--delta-down)/1)]" },
  { key: "winrate", label: "Win%", val: (r) => (r.played ? r.wins / r.played : 0), fmt: (_n, r) => (r.played ? `${Math.round((r.wins / r.played) * 100)}%` : "—") },
  { key: "gf", label: "GF", val: (r) => r.gf, fmt: (n) => String(n) },
  { key: "ga", label: "GA", val: (r) => r.ga, fmt: (n) => String(n) },
  { key: "gpm", label: "G/M", val: (r) => (r.played ? r.gf / r.played : 0), fmt: (_n, r) => (r.played ? f2(r.gf / r.played) : "—"), cls: "text-text-muted" },
  { key: "gapm", label: "GA/M", val: (r) => (r.played ? r.ga / r.played : 0), fmt: (_n, r) => (r.played ? f2(r.ga / r.played) : "—"), cls: "text-text-muted" },
  { key: "gd", label: "GD", val: (r) => r.gd, fmt: (n) => (n >= 0 ? `+${n}` : String(n)) },
  { key: "gdpm", label: "GD/M", val: (r) => (r.played ? r.gd / r.played : 0), fmt: (_n, r) => (r.played ? (r.gd >= 0 ? "+" : "") + f2(r.gd / r.played) : "—"), cls: "text-text-muted" },
  { key: "rating", label: "Elo", val: (r) => r.rating, fmt: (n) => String(Math.round(n)) },
];
const DEFAULT_COLS = ["pts", "ppm", "played", "winrate", "rating"];
// Chip controls — W/D/L and the goal trios each toggle together as one group.
const COL_CHIPS: { label: string; cols: string[] }[] = [
  { label: "Pts", cols: ["pts"] },
  { label: "PPM", cols: ["ppm"] },
  { label: "P", cols: ["played"] },
  { label: "W-D-L", cols: ["wins", "draws", "losses"] },
  { label: "Win%", cols: ["winrate"] },
  { label: "GF-GA-GD", cols: ["gf", "ga", "gd"] },
  { label: "GF-GA-GD /m", cols: ["gpm", "gapm", "gdpm"] },
  { label: "Elo", cols: ["rating"] },
];

function StatsTable({ rows, loading, onSelect }: { rows: Row[]; loading: boolean; onSelect: (id: number) => void }) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const [sortKey, setSortKey] = useState<string>("pts");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [visible, setVisible] = useState<Set<string>>(() => new Set(DEFAULT_COLS));

  const cols = useMemo(() => TABLE_COLS.filter((c) => visible.has(c.key)), [visible]);
  const colByKey = useMemo(() => new Map(TABLE_COLS.map((c) => [c.key, c])), []);
  const sortCol = colByKey.get(visible.has(sortKey) ? sortKey : "pts") ?? TABLE_COLS[0];
  const sorted = useMemo(
    () => rows.slice().sort((a, b) => (sortCol.val(a) - sortCol.val(b)) * dir),
    [rows, sortCol, dir],
  );
  const setSort = (k: string) => { if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setDir(-1); } };
  const toggleGroup = (groupCols: string[], on: boolean) =>
    setVisible((prev) => {
      const n = new Set(prev);
      if (on) {
        for (const k of groupCols) n.delete(k);
        if (n.size === 0) n.add("pts");
      } else {
        for (const k of groupCols) n.add(k);
      }
      return n;
    });

  if (loading) return <InlineLoading label="Loading…" />;
  return (
    <div className="space-y-3">
      <div>
        <div className="section-head"><span className="section-label">Columns</span></div>
        <div className="flex flex-wrap gap-1.5">
          {COL_CHIPS.map((item) => {
            const on = item.cols.every((k) => visible.has(k));
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => toggleGroup(item.cols, on)}
                aria-pressed={on}
                className={
                  "rounded-full px-2.5 py-1 text-xs transition focus-ring " +
                  (on ? "bg-accent/15 font-medium text-accent ring-1 ring-inset ring-accent/40" : "bg-bg-card-chip/50 text-text-muted hover:text-text-normal")
                }
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto" data-no-swipe-nav>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-card-chip/50 text-[11px] uppercase tracking-wide text-text-muted">
              <th className="sticky left-0 z-10 bg-bg-default py-2 pl-1 pr-2 text-left font-medium">Player</th>
              {cols.map((c) => (
                <th key={c.key} className="px-2 py-2 text-right font-medium">
                  <button type="button" onClick={() => setSort(c.key)} className={"inline-flex items-center gap-0.5 " + (sortKey === c.key ? "text-accent" : "hover:text-text-normal")}>
                    {c.label}{sortKey === c.key ? <span>{dir === -1 ? "▾" : "▴"}</span> : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.id} onClick={() => onSelect(r.id)} className="cursor-pointer border-b border-border-card-inner/40 transition hover:bg-hover-default/30">
                <td className="sticky left-0 z-10 bg-bg-default py-2 pl-1 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="w-4 text-right text-xs tabular-nums text-text-muted">{i + 1}</span>
                    <AvatarCircle playerId={r.id} name={r.name} updatedAt={avatarUpdatedAtById.get(r.id) ?? null} sizeClass="h-7 w-7" />
                    <span className="truncate font-medium text-text-normal">{r.name}</span>
                  </div>
                </td>
                {cols.map((c) => (
                  <td key={c.key} className={"px-2 text-right tabular-nums " + (c.bold ? "font-bold " : "") + (c.cls ?? "")}>
                    {c.fmt(c.val(r), r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================================================
//  POSITIONS — players × tournaments grid
// ==========================================================================
function PositionsView({ mode }: { mode: StatsMode }) {
  const q = useQuery({
    queryKey: ["stats", "players", mode, "positions"],
    queryFn: () => getStatsPlayers({ mode }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const defsQ = useQuery({ queryKey: ["cup", "defs"], queryFn: listCupDefs });
  // Include the main (default-keyed, gold) cup too — it has its own lineage line.
  const cupDefs = useMemo(() => defsQ.data?.cups ?? [], [defsQ.data]);
  const cupsQ = useQueries({ queries: cupDefs.map((c) => ({ queryKey: ["cup", c.key], queryFn: () => getCup(c.key), staleTime: 30_000 })) });

  const players = useMemo(() => (q.data?.players ?? []).slice().sort((a, b) => b.pts - a.pts), [q.data]);
  const tournaments = useMemo(
    () => (q.data?.tournaments ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)),
    [q.data],
  );
  const colByPlayer = useMemo(() => new Map(players.map((p, j) => [p.player_id, j])), [players]);
  const cupColor = (key: string) => rgbFromCssVar(cupColorVarForKey(key));

  // Per-cup owner-after-tournament timeline, reconstructed from transfer history.
  const ownerByCup = useMemo(() => {
    const out = new Map<string, Map<number, number>>();
    const chrono = (q.data?.tournaments ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    cupDefs.forEach((def, ci) => {
      const data = cupsQ[ci]?.data;
      if (!data) return;
      const hist = (data.history ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.tournament_id - b.tournament_id));
      const transfers = new Map<number, number>();
      for (const h of hist) if (h.to?.id && h.to.id > 0) transfers.set(h.tournament_id, h.to.id);
      let owner: number | null = hist[0]?.from?.id && hist[0].from.id > 0 ? hist[0].from.id : data.owner?.id ?? null;
      if (owner != null && owner <= 0) owner = null;
      const at = new Map<number, number>();
      for (const t of chrono) {
        if (transfers.has(t.id)) owner = transfers.get(t.id)!;
        if (owner != null && owner > 0) at.set(t.id, owner);
      }
      out.set(def.key, at);
    });
    return out;
  }, [cupDefs, cupsQ, q.data?.tournaments]);

  // Grid geometry (fixed sizes so the overlay line can be positioned analytically).
  const nameW = 128, headerH = 60, cellW = 40, cellH = 42, gap = 4;
  const gridW = nameW + players.length * (cellW + gap);
  const gridH = headerH + gap + tournaments.length * (cellH + gap);
  const colX = (j: number) => nameW + gap + j * (cellW + gap) + cellW / 2;
  const rowY = (i: number) => headerH + gap + i * (cellH + gap) + cellH / 2;

  const laurelPolylines = useMemo(() => {
    return cupDefs
      .map((def) => {
        const at = ownerByCup.get(def.key);
        const pts: string[] = [];
        tournaments.forEach((t, i) => {
          if (!at || !(t.cup_stakes ?? []).some((s) => s.key === def.key)) return;
          const owner = at.get(t.id);
          if (owner == null) return;
          const j = colByPlayer.get(owner);
          if (j == null) return;
          pts.push(`${colX(j)},${rowY(i)}`);
        });
        return { key: def.key, color: cupColor(def.key), pts: pts.join(" ") };
      })
      .filter((l) => l.pts.includes(" "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cupDefs, ownerByCup, tournaments, colByPlayer, players.length]);

  if (q.isLoading && !q.data) return <InlineLoading label="Loading…" />;
  if (!tournaments.length) return <div className="text-sm text-text-muted">No tournaments yet.</div>;

  return (
    <div>
      <div className="section-head"><span className="section-label">Tournament positions</span></div>
      <div className="overflow-x-auto" data-no-swipe-nav>
        <div className="relative" style={{ width: gridW }}>
          <div
            className="relative"
            style={{ display: "grid", gridTemplateColumns: `${nameW}px repeat(${players.length}, ${cellW}px)`, columnGap: gap, rowGap: gap }}
          >
            <div style={{ height: headerH }} />
            {players.map((p) => (
              <div key={p.player_id} style={{ height: headerH }} className="flex flex-col items-center justify-end gap-1 pb-1">
                <AvatarCircle playerId={p.player_id} name={p.display_name} updatedAt={avatarUpdatedAtById.get(p.player_id) ?? null} sizeClass="h-6 w-6" />
                <span className="w-full truncate text-center text-[9px] text-text-muted">{p.display_name}</span>
              </div>
            ))}
            {tournaments.map((t) => (
              <Fragment key={t.id}>
                <div style={{ height: cellH }} className="flex items-center pr-1.5">
                  <span
                    className="text-[10px] leading-tight text-text-normal"
                    style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                  >
                    {t.name}
                  </span>
                </div>
                {players.map((p) => {
                  const pos = p.positions_by_tournament?.[String(t.id)];
                  if (pos == null)
                    return <div key={p.player_id} style={{ height: cellH }} className="grid place-items-center rounded bg-bg-card-chip/15 text-[10px] text-text-muted">·</div>;
                  const total = t.players_count || 1;
                  const frac = total > 1 ? (pos - 1) / (total - 1) : 0;
                  const stakes = t.cup_stakes ?? [];
                  const isWinner = pos === 1 && stakes.length > 0;
                  return (
                    <div
                      key={p.player_id}
                      style={{ height: cellH, ["--pos-p"]: frac } as React.CSSProperties}
                      className="pos-tile relative grid place-items-center rounded border text-[11px] font-semibold tabular-nums"
                      title={`${p.display_name} · ${t.name}: #${pos}/${total}${isWinner ? ` · won ${stakes.map((s) => s.name).join(", ")}` : ""}`}
                    >
                      {isWinner ? (
                        <span className="absolute right-0.5 top-0.5 inline-flex gap-px">
                          {stakes.map((s) => (
                            <i key={s.key} className="fa-solid fa-crown text-[8px]" style={{ color: cupColor(s.key) }} aria-hidden="true" />
                          ))}
                        </span>
                      ) : null}
                      {pos}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
          {laurelPolylines.length ? (
            <svg className="pointer-events-none absolute left-0 top-0" width={gridW} height={gridH} aria-hidden="true">
              {laurelPolylines.map((l) => (
                <polyline key={l.key} points={l.pts} fill="none" stroke={l.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
              ))}
            </svg>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
//  H2H — matrix + rivalries + pairwise detail
// ==========================================================================
function h2hTone(pct: number): string {
  const t = Math.max(0, Math.min(1, pct / 100));
  return `hsl(${t * 130} 60% 42% / 0.85)`;
}

function H2HView({ mode, scope, rows }: { mode: StatsMode; scope: StatsScope; rows: Row[] }) {
  const q = useQuery({
    queryKey: ["stats", "h2h", "all", 200, "rivalry", scope],
    queryFn: () => getStatsH2H({ playerId: null, limit: 200, order: "rivalry", scope }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const [selected, setSelected] = useState<number | null>(rows[0]?.id ?? null);
  const [matrixMetric, setMatrixMetric] = useState<"winrate" | "played" | "gd" | "wdl">("winrate");
  const nameById = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);

  const pairs: StatsH2HPair[] = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    return mode === "1v1" ? d.rivalries_1v1 : mode === "2v2" ? d.rivalries_2v2 : d.rivalries_all;
  }, [q.data, mode]);
  const pairIndex = useMemo(() => {
    const m = new Map<string, StatsH2HPair>();
    for (const p of pairs) m.set([p.a.id, p.b.id].sort((x, y) => x - y).join("-"), p);
    return m;
  }, [pairs]);
  const cell = (rowId: number, colId: number) => {
    const p = pairIndex.get([rowId, colId].sort((x, y) => x - y).join("-"));
    if (!p || p.played === 0) return null;
    const rowIsA = p.a.id === rowId;
    const rowWins = rowIsA ? p.a_wins : p.b_wins;
    const colWins = rowIsA ? p.b_wins : p.a_wins;
    const rowGf = rowIsA ? p.a_gf : p.b_gf;
    const rowGa = rowIsA ? p.a_ga : p.b_ga;
    return { pct: (rowWins / p.played) * 100, w: rowWins, d: p.draws, l: colWins, played: p.played, gd: rowGf - rowGa };
  };
  const cellText = (v: { pct: number; played: number; gd: number; w: number; d: number; l: number }) =>
    matrixMetric === "played" ? String(v.played)
      : matrixMetric === "gd" ? (v.gd >= 0 ? `+${v.gd}` : String(v.gd))
        : matrixMetric === "wdl" ? `${v.w}-${v.d}-${v.l}`
          : String(Math.round(v.pct));
  const topRivalries = pairs.slice().sort((a, b) => b.rivalry_score - a.rivalry_score).slice(0, 8);

  // Per-player detail.
  const detailQ = useQuery({
    queryKey: ["stats", "h2h", "player", selected, scope],
    queryFn: () => getStatsH2H({ playerId: selected as number, order: "played", limit: 50, scope }),
    enabled: selected != null,
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const vs = useMemo<StatsH2HOpponentRow[]>(() => {
    const d = detailQ.data;
    if (!d) return [];
    return (mode === "1v1" ? d.vs_1v1 : mode === "2v2" ? d.vs_2v2 : d.vs_all) ?? [];
  }, [detailQ.data, mode]);
  const nemesis = mode === "1v1" ? detailQ.data?.nemesis_1v1 : mode === "2v2" ? detailQ.data?.nemesis_2v2 : detailQ.data?.nemesis_all;
  const favorite = mode === "1v1" ? detailQ.data?.favorite_victim_1v1 : mode === "2v2" ? detailQ.data?.favorite_victim_2v2 : detailQ.data?.favorite_victim_all;
  const selName = selected != null ? nameById.get(selected) ?? "" : "";

  if (q.isLoading && !q.data) return <InlineLoading label="Loading…" />;

  return (
    <div className="space-y-5">
      {/* Full-name square matrix */}
      <div>
        <div className="section-head"><span className="section-label">Matrix</span></div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ChipGroup<"winrate" | "played" | "gd" | "wdl">
            value={matrixMetric}
            onChange={setMatrixMetric}
            ariaLabel="Matrix metric"
            options={[{ key: "winrate", label: "Win %" }, { key: "wdl", label: "W-D-L" }, { key: "played", label: "Played" }, { key: "gd", label: "Goal diff" }]}
          />
        </div>
        <p className="mb-2 text-[11px] text-text-muted">Cell = row vs column ({matrixMetric === "played" ? "matches played" : matrixMetric === "gd" ? "goal difference" : matrixMetric === "wdl" ? "win-draw-loss" : "win %"}); colour shows the row's win rate (green dominates). Tap for detail.</p>
        <div className="overflow-x-auto" data-no-swipe-nav>
          <table className="border-separate" style={{ borderSpacing: 3 }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-bg-default" />
                {rows.map((c) => (
                  <th key={c.id} className="p-0 align-bottom">
                    <div className="mx-auto flex h-24 w-11 items-center justify-center overflow-visible">
                      <span className="-rotate-90 whitespace-nowrap text-[11px] font-medium text-text-muted">{c.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th className="sticky left-0 z-10 bg-bg-default pr-2 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(r.id)}
                      className={"block max-w-[120px] truncate text-xs font-medium " + (selected === r.id ? "text-accent" : "text-text-normal hover:text-accent")}
                    >
                      {r.name}
                    </button>
                  </th>
                  {rows.map((c) => {
                    if (r.id === c.id) return <td key={c.id} className="h-11 w-11 rounded bg-bg-card-chip/30" />;
                    const v = cell(r.id, c.id);
                    if (!v) return <td key={c.id} className="h-11 w-11 rounded bg-bg-card-chip/15 text-center text-[10px] text-text-muted">–</td>;
                    return (
                      <td key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(r.id)}
                          title={`${r.name} vs ${c.name}: ${v.w}-${v.d}-${v.l}`}
                          className="grid h-11 w-11 place-items-center rounded text-[10px] font-semibold leading-none text-white"
                          style={{ backgroundColor: h2hTone(v.pct) }}
                        >
                          {cellText(v)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-player detail */}
      <div className="space-y-2">
        <div className="section-head"><span className="section-label">Head-to-head by player</span></div>
        <PlayerPicker players={rows.map((r) => ({ id: r.id, name: r.name }))} selectedId={selected} onSelect={setSelected} />
        {selected == null ? (
          <div className="text-sm text-text-muted">Pick a player.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="card-chip px-3 py-2">
                <div className="inline-flex items-center gap-2 text-text-muted"><i className="fa-solid fa-face-smile" aria-hidden="true" /><span>Favorite</span></div>
                <div className="mt-0.5 font-semibold">{favorite?.opponent.display_name ?? "—"}</div>
                {favorite ? <div className="mt-0.5 text-text-muted">{favorite.wins}-{favorite.draws}-{favorite.losses} · {favorite.pts_per_match.toFixed(2)} ppm</div> : null}
              </div>
              <div className="card-chip px-3 py-2">
                <div className="inline-flex items-center gap-2 text-text-muted"><i className="fa-solid fa-heart-crack" aria-hidden="true" /><span>Nemesis</span></div>
                <div className="mt-0.5 font-semibold">{nemesis?.opponent.display_name ?? "—"}</div>
                {nemesis ? <div className="mt-0.5 text-text-muted">{nemesis.wins}-{nemesis.draws}-{nemesis.losses} · {nemesis.pts_per_match.toFixed(2)} ppm</div> : null}
              </div>
            </div>
            {detailQ.isLoading && !detailQ.data ? (
              <InlineLoading label="Loading…" />
            ) : vs.length ? (
              <div className="list-divided">
                {vs.map((o) => (
                  <button key={o.opponent.id} type="button" onClick={() => setSelected(o.opponent.id)} className="row row-tap">
                    <span className="min-w-0 flex-1 truncate text-sm text-text-normal">{o.opponent.display_name}</span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted">
                      {o.played}P · <span className="text-status-text-green">{o.wins}</span>-<span className="text-amber-300">{o.draws}</span>-<span className="text-[color:rgb(var(--delta-down)/1)]">{o.losses}</span>
                    </span>
                    <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-accent">{o.played ? Math.round(o.win_rate * 100) : 0}%</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-text-muted">No head-to-head matches for {selName}.</div>
            )}
          </>
        )}
      </div>

      {/* Top rivalries */}
      <div className="space-y-2">
        <div className="section-head"><span className="section-label">Top rivalries</span></div>
        <p className="text-[11px] text-text-muted">Most-played and closest matchups — a higher rivalry score means more games and a tighter win balance.</p>
        {topRivalries.map((p) => (
          <button key={`${p.a.id}-${p.b.id}`} type="button" onClick={() => setSelected(p.a.id)}
            className="surface flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-hover-default/30">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text-normal">
                {nameById.get(p.a.id) ?? p.a.display_name} <span className="text-text-muted">vs</span> {nameById.get(p.b.id) ?? p.b.display_name}
              </div>
              <div className="text-[11px] text-text-muted">{p.played} matches · {p.a_wins}-{p.draws}-{p.b_wins}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold tabular-nums text-accent">{Math.round(p.rivalry_score)}</div>
              <div className="text-[10px] text-text-muted">rivalry</div>
            </div>
          </button>
        ))}
        {!topRivalries.length ? <div className="text-sm text-text-muted">No rivalries yet.</div> : null}
      </div>
    </div>
  );
}

// ==========================================================================
//  STREAKS
// ==========================================================================
function fmtShortDate(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" });
}
function streakDateText(r: StatsStreakRun): string {
  const s = fmtShortDate(r.start_ts);
  if (r.ongoing) return s ? `since ${s}` : "ongoing";
  const e = fmtShortDate(r.end_ts);
  if (s && e) return s === e ? s : `${s} – ${e}`;
  return s || e || "";
}

function StreaksView({ mode, scope }: { mode: StatsMode; scope: StatsScope }) {
  const q = useQuery({
    queryKey: ["stats", "streaks", mode, 200, scope],
    queryFn: () => getStatsStreaks({ mode, playerId: null, limit: 200, scope }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  if (q.isLoading && !q.data) return <InlineLoading label="Loading…" />;
  const cats: StatsStreakCategory[] = q.data?.categories ?? [];

  return (
    <div className="grid gap-x-6 gap-y-6 lg:grid-cols-2">
      {cats.map((c) => {
        const records = (c.records ?? []).slice(0, 5);
        const current = (c.current ?? []).filter((r) => r.length > 0).slice(0, 5);
        return (
          <div key={c.key} className="space-y-2">
            <div className="section-head">
              <span className="section-label inline-flex items-center gap-1.5"><Flame size={12} />{c.name}</span>
            </div>
            <p className="-mt-1 text-[11px] text-text-muted">{c.description}</p>
            {records.length ? (
              <div className="list-divided">
                {records.map((r, i) => (
                  <div key={`${r.player.id}-${i}`} className="flex items-center gap-2 py-2">
                    <span className="w-4 text-center text-xs font-bold tabular-nums text-text-muted">{i + 1}</span>
                    <AvatarCircle playerId={r.player.id} name={r.player.display_name} updatedAt={avatarUpdatedAtById.get(r.player.id) ?? null} sizeClass="h-6 w-6" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-normal">{r.player.display_name}</span>
                      {streakDateText(r) ? <span className="block text-[10px] tabular-nums text-text-muted">{streakDateText(r)}</span> : null}
                    </span>
                    {r.ongoing ? <span className="shrink-0 rounded-full bg-status-bg-green/60 px-1.5 text-[10px] text-status-text-green">live</span> : null}
                    <span className="text-sm font-bold tabular-nums text-accent">{r.length}</span>
                  </div>
                ))}
              </div>
            ) : <div className="text-sm text-text-muted">None yet.</div>}
            {current.length ? (
              <div className="pt-1">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">Current</div>
                <div className="flex flex-wrap gap-1.5">
                  {current.map((r) => (
                    <span key={r.player.id} className="inline-flex items-center gap-1 rounded-full bg-bg-card-chip/50 px-2 py-0.5 text-[11px]">
                      {r.player.display_name} <b className="text-text-normal">{r.length}</b>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      {!cats.length ? <div className="text-sm text-text-muted">No streak data yet.</div> : null}
    </div>
  );
}

// ==========================================================================
//  STARS — performance by club star rating
// ==========================================================================
const STAR_LEVELS = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];
function starBuckets(matches: Match[], pid: number, clubs: Club[]) {
  const starByClub = new Map<number, number>();
  for (const c of clubs) if (Number.isFinite(c.star_rating)) starByClub.set(c.id, c.star_rating);
  const by = new Map<number, { played: number; w: number; d: number; l: number; pts: number }>();
  for (const s of STAR_LEVELS) by.set(s, { played: 0, w: 0, d: 0, l: 0, pts: 0 });
  for (const m of matches) {
    const st = matchStats(m, pid);
    if (!st) continue;
    const side = sideOf(m, pid);
    if (!side) continue;
    const club = m.sides.find((x) => x.side === side)?.club_id ?? null;
    if (!club) continue;
    const stars = starByClub.get(club);
    if (stars == null) continue;
    const cur = by.get(Math.round(stars * 2) / 2);
    if (!cur) continue;
    cur.played++; cur.pts += st.pts;
    if (st.res === "W") cur.w++; else if (st.res === "D") cur.d++; else cur.l++;
  }
  return STAR_LEVELS.map((s) => { const v = by.get(s)!; return { stars: s, ...v, ppm: v.played ? v.pts / v.played : 0 }; });
}

function StarsView({ mode, scope, rows, selectedId, onSelect }: { mode: StatsMode; scope: StatsScope; rows: Row[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const matchesQ = useQuery({
    queryKey: ["stats", "playerMatches", selectedId ?? 0, scope],
    queryFn: () => getStatsPlayerMatches({ playerId: selectedId as number, scope }),
    enabled: selectedId != null,
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => listClubs(), staleTime: 60_000 });
  const flat = useMemo(() => {
    const ts = matchesQ.data?.tournaments ?? [];
    return (mode === "overall" ? ts : ts.filter((t) => t.mode === mode)).flatMap((t) => t.matches);
  }, [matchesQ.data, mode]);
  const buckets = useMemo(() => (selectedId ? starBuckets(flat, selectedId, clubsQ.data ?? []) : []), [flat, selectedId, clubsQ.data]);
  const active = buckets.filter((b) => b.played > 0);
  const known = active.reduce((s, b) => s + b.played, 0);

  return (
    <div className="space-y-4">
      <PlayerPicker players={rows.map((r) => ({ id: r.id, name: r.name }))} selectedId={selectedId} onSelect={onSelect} />
      <p className="text-[11px] text-text-muted">Points per match by the star rating of the club played. {known ? `${known} rated matches.` : ""}</p>
      {matchesQ.isLoading && !matchesQ.data ? (
        <InlineLoading label="Loading…" />
      ) : !active.length ? (
        <div className="text-sm text-text-muted">No finished matches with rated clubs for this player.</div>
      ) : (
        <div className="list-divided">
          {active.map((b) => (
            <div key={b.stars} className="relative overflow-hidden">
              <div className="absolute inset-y-1 left-0 rounded-r" style={{ width: `${Math.max(2, Math.min(100, (b.ppm / 3) * 100))}%`, backgroundColor: "rgb(var(--color-accent) / 0.16)" }} aria-hidden="true" />
              <div className="relative z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-1 py-2.5">
                <StarsFA rating={b.stars} className="text-[11px]" textClassName="text-text-normal" />
                <div className="text-center font-mono text-[11px] tabular-nums text-text-muted">
                  {b.played}P · <span className="text-status-text-green">{b.w}</span>-<span className="text-amber-300">{b.d}</span>-<span className="text-[color:rgb(var(--delta-down)/1)]">{b.l}</span>
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-mono text-sm font-bold tabular-nums text-text-normal">{b.ppm.toFixed(2)}</span>
                  <span className="ml-1 text-[10px] text-text-muted">ppm</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================================================
//  PLAYER — radar + stat tiles + history
// ==========================================================================
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface rounded-xl px-2 py-2 text-center">
      <div className="text-base font-bold tabular-nums text-text-normal">{value}</div>
      <div className="text-[10px] text-text-muted">{label}</div>
    </div>
  );
}

function PlayerProfile({ mode, scope, rows, selectedId, onSelect }: { mode: StatsMode; scope: StatsScope; rows: Row[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const row = rows.find((r) => r.id === selectedId) ?? null;

  const radarAxes = useMemo(() => {
    if (!row) return [];
    const maxGfpm = Math.max(0.01, ...rows.map((r) => r.played ? r.gf / r.played : 0));
    const maxGapm = Math.max(0.01, ...rows.map((r) => r.played ? r.ga / r.played : 0));
    const maxPlayed = Math.max(1, ...rows.map((r) => r.played));
    return [
      { label: "Attack", value: (row.played ? row.gf / row.played : 0) / maxGfpm },
      { label: "Defense", value: 1 - (row.played ? row.ga / row.played : 0) / maxGapm },
      { label: "Win %", value: row.played ? row.wins / row.played : 0 },
      { label: "Form", value: row.formAvg / 3 },
      { label: "Activity", value: row.played / maxPlayed },
    ];
  }, [row, rows]);

  const matchesQ = useQuery({
    queryKey: ["stats", "playerMatches", selectedId ?? 0, scope],
    queryFn: () => getStatsPlayerMatches({ playerId: selectedId as number, scope }),
    enabled: selectedId != null,
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => listClubs(), staleTime: 60_000 });
  const tournaments = useMemo(() => (matchesQ.data?.tournaments ?? []).filter((t) => mode === "overall" || t.mode === mode), [matchesQ.data, mode]);
  const nav = useNavigate();

  return (
    <div className="space-y-4">
      <PlayerPicker players={rows.map((r) => ({ id: r.id, name: r.name }))} selectedId={selectedId} onSelect={onSelect} />

      {!row ? <div className="card-outer text-sm text-text-muted">Pick a player above.</div> : (
        <>
          <div className="card-outer flex items-center gap-3">
            <button
              type="button"
              onClick={() => nav(`/profiles/${row.id}`)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-ring"
              title={`Open ${row.name}'s full profile`}
            >
              <AvatarCircle playerId={row.id} name={row.name} updatedAt={avatarUpdatedAtById.get(row.id) ?? null} sizeClass="h-14 w-14" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-lg font-bold text-text-normal">{row.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                </div>
                <div className="text-xs text-text-muted">
                  {Math.round(row.rating)}★ · <span className="text-status-text-green">{row.wins}</span>-<span className="text-amber-300">{row.draws}</span>-<span className="text-[color:rgb(var(--delta-down)/1)]">{row.losses}</span> · {row.pts} pts · view profile
                </div>
              </div>
            </button>
            <div className="flex shrink-0 flex-col items-center" title="Recent form — points per match in the last games">
              <Sparkline values={row.form} />
              <span className="mt-0.5 text-[9px] uppercase tracking-wide text-text-muted">Form (last {row.form.length})</span>
            </div>
          </div>

          <div className="card-outer">
            <h2 className="mb-2 text-sm font-semibold text-text-normal">Key numbers</h2>
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Played" value={String(row.played)} />
              <StatTile label="Win rate" value={row.played ? `${Math.round((row.wins / row.played) * 100)}%` : "—"} />
              <StatTile label="Pts / match" value={row.played ? (row.pts / row.played).toFixed(2) : "—"} />
              <StatTile label="Goals / match" value={row.played ? (row.gf / row.played).toFixed(2) : "—"} />
              <StatTile label="Conceded / match" value={row.played ? (row.ga / row.played).toFixed(2) : "—"} />
              <StatTile label="Goal diff" value={row.gd >= 0 ? `+${row.gd}` : String(row.gd)} />
            </div>
          </div>

          <div className="card-outer flex flex-col items-center">
            <h2 className="self-start text-sm font-semibold text-text-normal">Profile</h2>
            <Radar axes={radarAxes} />
            <div className="text-[11px] text-text-muted">Strengths relative to the field.</div>
          </div>

          <div className="card-outer">
            <h2 className="mb-2 text-sm font-semibold text-text-normal">Match history</h2>
            {matchesQ.isLoading && !matchesQ.data ? <InlineLoading label="Loading…" /> :
              tournaments.length ? <MatchHistoryList tournaments={tournaments} clubs={clubsQ.data ?? []} focusId={row.id} showMeta={false} nameColorByResult hideModePill /> :
                <div className="text-sm text-text-muted">No matches yet.</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ==========================================================================
//  RECORDS & SUPERLATIVES
// ==========================================================================
function teamNames(m: Match, side: "A" | "B"): string {
  const s = m.sides.find((x) => x.side === side);
  return (s?.players ?? []).map((p) => p.display_name).join(" + ") || "—";
}
type RecMatch = { id: number; tName: string; date: string; a: string; b: string; ag: number; bg: number; aIds: number[]; bIds: number[] };

function RecordGroup({ icon, label, matches }: { icon: string; label: string; matches: RecMatch[] }) {
  if (!matches.length) return null;
  const shown = matches.slice(0, 6);
  return (
    <div className="card-chip px-3 py-2.5">
      <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-text-muted">
        <i className={"fa-solid " + icon} aria-hidden="true" />
        {label}
        {matches.length > 1 ? <span className="text-text-muted/70">×{matches.length}</span> : null}
      </div>
      <div className="mt-1.5 space-y-2">
        {shown.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text-normal">{m.a} <span className="text-text-muted">vs</span> {m.b}</div>
              <div className="text-[11px] text-text-muted">{m.tName} · {fmtShortDate(m.date)}</div>
            </div>
            <div className="shrink-0 font-mono text-base font-bold tabular-nums text-accent">{m.ag}:{m.bg}</div>
          </div>
        ))}
        {matches.length > shown.length ? <div className="text-[11px] text-text-muted">+{matches.length - shown.length} more</div> : null}
      </div>
    </div>
  );
}

function RecordsView({ mode, scope, rows }: { mode: StatsMode; scope: StatsScope; rows: Row[] }) {
  const eloById = useMemo(() => new Map(rows.map((r) => [r.id, r.rating])), [rows]);
  const matchesQs = useQueries({
    queries: rows.map((r) => ({
      queryKey: ["stats", "playerMatches", r.id, scope],
      queryFn: () => getStatsPlayerMatches({ playerId: r.id, scope }),
      enabled: rows.length > 0,
      placeholderData: keepPreviousData, staleTime: 30_000,
    })),
  });
  const streaksQ = useQuery({
    queryKey: ["stats", "streaks", mode, 1, scope],
    queryFn: () => getStatsStreaks({ mode, limit: 1, scope }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const loading = matchesQs.some((q) => q.isLoading && !q.data);

  const matches = useMemo(() => {
    const seen = new Set<number>();
    const out: RecMatch[] = [];
    for (const q of matchesQs) {
      const data = q.data as { tournaments: StatsPlayerMatchesTournament[] } | undefined;
      for (const t of data?.tournaments ?? []) {
        if (mode !== "overall" && t.mode !== mode) continue;
        for (const m of t.matches) {
          if (m.state !== "finished" || seen.has(m.id)) continue;
          seen.add(m.id);
          const A = m.sides.find((s) => s.side === "A");
          const B = m.sides.find((s) => s.side === "B");
          out.push({
            id: m.id, tName: t.name, date: t.date,
            a: teamNames(m, "A"), b: teamNames(m, "B"),
            ag: Number(A?.goals ?? 0), bg: Number(B?.goals ?? 0),
            aIds: (A?.players ?? []).map((p) => p.id), bIds: (B?.players ?? []).map((p) => p.id),
          });
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchesQs.map((q) => q.dataUpdatedAt).join("|"), mode]);

  const records = useMemo(() => {
    if (!matches.length) return null;
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 1000);
    const decided = matches.filter((m) => m.ag !== m.bg);
    // Collect ALL matches that tie the record value, not just the first.
    const topBy = (arr: RecMatch[], valOf: (m: RecMatch) => number): RecMatch[] => {
      if (!arr.length) return [];
      const max = Math.max(...arr.map(valOf));
      return arr.filter((m) => valOf(m) === max);
    };
    const biggestWin = topBy(decided, (m) => Math.abs(m.ag - m.bg));
    const highestScoring = topBy(matches, (m) => m.ag + m.bg);
    const mostSide = topBy(matches, (m) => Math.max(m.ag, m.bg));
    const upsetScored = decided.map((m) => {
      const winnerIds = m.ag > m.bg ? m.aIds : m.bIds;
      const loserIds = m.ag > m.bg ? m.bIds : m.aIds;
      return { m, gap: avg(loserIds.map((id) => eloById.get(id) ?? 1000)) - avg(winnerIds.map((id) => eloById.get(id) ?? 1000)) };
    });
    const maxGap = upsetScored.length ? Math.max(...upsetScored.map((u) => u.gap)) : -Infinity;
    const upset = maxGap > 0 ? upsetScored.filter((u) => u.gap === maxGap).map((u) => u.m) : [];
    return { biggestWin, highestScoring, mostSide, upset, total: matches.length };
  }, [matches, eloById]);

  const streakCards = useMemo(() => {
    const cats = streaksQ.data?.categories ?? [];
    return (["win_streak", "unbeaten_streak"] as const)
      .map((k) => cats.find((c) => c.key === k))
      .filter((c): c is StatsStreakCategory => !!c && (c.records?.[0]?.length ?? 0) > 0)
      .map((c) => ({ name: c.name, run: c.records[0] }));
  }, [streaksQ.data]);

  if (loading) return <InlineLoading label="Loading…" />;
  if (!records) return <div className="text-sm text-text-muted">No finished matches yet.</div>;

  return (
    <div className="space-y-4">
      <div>
        <div className="section-head"><span className="section-label">Match superlatives</span></div>
        <div className="space-y-2">
          <RecordGroup icon="fa-bolt" label="Biggest win" matches={records.biggestWin} />
          <RecordGroup icon="fa-futbol" label="Highest-scoring match" matches={records.highestScoring} />
          <RecordGroup icon="fa-fire" label="Most goals by one side" matches={records.mostSide} />
          <RecordGroup icon="fa-arrow-trend-up" label="Biggest upset (by Elo)" matches={records.upset} />
        </div>
      </div>
      {streakCards.length ? (
        <div>
          <div className="section-head"><span className="section-label">Longest runs</span></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {streakCards.map((s) => (
              <div key={s.name} className="card-chip px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-text-muted">{s.name}</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-normal">{s.run.player.display_name}</div>
                    <div className="text-[11px] text-text-muted">{streakDateText(s.run)}</div>
                  </div>
                  <div className="shrink-0 font-mono text-lg font-bold tabular-nums text-accent">{s.run.length}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <p className="text-[11px] text-text-muted">Across {records.total} finished matches.</p>
    </div>
  );
}

// ==========================================================================
//  CUPS — reigns & title history
// ==========================================================================
function CupsView() {
  const defsQ = useQuery({ queryKey: ["cup", "defs"], queryFn: listCupDefs });
  const cups = useMemo(() => {
    const raw = defsQ.data?.cups?.length ? defsQ.data.cups : [{ key: "default", name: "Cup", since_date: null }];
    return raw.filter((c) => c.key !== "default").concat(raw.filter((c) => c.key === "default"));
  }, [defsQ.data]);

  if (defsQ.isLoading && !defsQ.data) return <InlineLoading label="Loading…" />;

  // Reuse the dashboard cup component so both views stay identical.
  return (
    <div className="space-y-6">
      {cups.map((c) => (
        <section key={c.key}>
          <div className="section-head">
            <span className="section-label inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: rgbFromCssVar(cupColorVarForKey(c.key)) }} aria-hidden="true" />
              {c.name}
            </span>
          </div>
          <CupCard cupKey={c.key} />
        </section>
      ))}
    </div>
  );
}

// ==========================================================================
//  MAIN
// ==========================================================================
const TABS: SectionTab<Tab>[] = [
  { key: "trends", label: "Trends", icon: <LineChart size={14} /> },
  { key: "table", label: "Table", icon: <Table2 size={14} /> },
  { key: "positions", label: "Positions", icon: <Medal size={14} /> },
  { key: "h2h", label: "H2H", icon: <Grid3x3 size={14} /> },
  { key: "streaks", label: "Streaks", icon: <Flame size={14} /> },
  { key: "stars", label: "Stars", icon: <Star size={14} /> },
  { key: "player", label: "Player", icon: <UserRound size={14} /> },
  { key: "records", label: "Records", icon: <Award size={14} /> },
  { key: "cups", label: "Cups", icon: <Trophy size={14} /> },
];

export default function StatsInsights({
  mode, scope, onModeChange, onScopeChange, playerId, onSelectPlayer,
}: {
  mode: StatsMode; scope: StatsScope;
  onModeChange: (m: StatsMode) => void; onScopeChange: (s: StatsScope) => void;
  playerId: number | ""; onSelectPlayer: (id: number) => void;
}) {
  const { rows, loading } = useStandings(mode, scope);
  // Deep-link support: dashboard (and others) can pass an initial tab + trends config via nav state.
  const location = useLocation();
  const initState = (location.state as { statsTab?: Tab; trendsMetric?: Metric; trendsView?: ViewMode } | null) ?? null;
  const [tab, setTab] = useState<Tab>(initState?.statsTab ?? (playerId !== "" ? "player" : "trends"));
  const selectedId = playerId === "" ? (rows[0]?.id ?? null) : playerId;
  const goPlayer = (id: number) => { onSelectPlayer(id); setTab("player"); };

  return (
    <div className="space-y-3">
      {/* Slim global filters */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Mode</span>
          <ChipGroup<StatsMode> value={mode} onChange={onModeChange} ariaLabel="Mode"
            options={[{ key: "overall", label: "Overall" }, { key: "1v1", label: "1v1" }, { key: "2v2", label: "2v2" }]} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Source</span>
          <ChipGroup<StatsScope> value={scope} onChange={onScopeChange} ariaLabel="Source"
            options={[{ key: "tournaments", label: "Tournaments" }, { key: "both", label: "Both" }, { key: "friendlies", label: "Friendlies" }]} />
        </div>
      </div>

      <SectionTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "trends" && <TrendsExplorer mode={mode} scope={scope} rows={rows} initialMetric={initState?.trendsMetric} initialView={initState?.trendsView} />}
      {tab === "table" && <StatsTable rows={rows} loading={loading} onSelect={goPlayer} />}
      {tab === "positions" && <PositionsView mode={mode} />}
      {tab === "h2h" && <H2HView mode={mode} scope={scope} rows={rows} />}
      {tab === "streaks" && <StreaksView mode={mode} scope={scope} />}
      {tab === "stars" && <StarsView mode={mode} scope={scope} rows={rows} selectedId={selectedId} onSelect={onSelectPlayer} />}
      {tab === "player" && <PlayerProfile mode={mode} scope={scope} rows={rows} selectedId={selectedId} onSelect={onSelectPlayer} />}
      {tab === "records" && <RecordsView mode={mode} scope={scope} rows={rows} />}
      {tab === "cups" && <CupsView />}
    </div>
  );
}
