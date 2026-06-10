import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { LineChart, Table2, Grid3x3, UserRound, Flame, Star, Medal, Award, Trophy, ChevronRight } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import { StarsFA } from "../../ui/primitives/StarsFA";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";
import { getStatsPlayers, getStatsPlayerMatches, getStatsH2H, getStatsStreaks, getStatsRatingsHistory } from "../../api/stats.api";
import type { StatsRatingsHistoryResponse } from "../../api/stats.api";
import { getCup, listCupDefs } from "../../api/cup.api";
import { cupColorVarForKey, rgbFromCssVar } from "../../cupColors";
import { listClubs } from "../../api/clubs.api";
import type { Club, Match, StatsScope, StatsH2HPair, StatsH2HOpponentRow, StatsPlayerMatchesTournament, StatsStreakCategory, StatsStreakRun } from "../../api/types";
import type { StatsMode } from "./StatsControls";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { usePlayerColors } from "./usePlayerColors";
import { Sparkline, Radar, TrendChart, ChipGroup } from "./charts";
import { pooledPpm } from "./trendsMath";
import { MatchHistoryList } from "./MatchHistoryList";
import { PlayerPicker } from "./PlayerPicker";
import CupCard from "../dashboard/CupCard";
import StatsTable from "./StatsTable";
import { type Row, useStandings, sideOf, matchStats } from "./standings";
import { Slider, ToggleChip } from "./controls";

type Tab = "trends" | "table" | "positions" | "h2h" | "streaks" | "stars" | "player" | "records" | "cups";

// ---- small controls -------------------------------------------------------
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
type Metric = "points" | "goals" | "conceded" | "gd" | "winrate" | "elo";
type ViewMode = "per" | "cumulative" | "rolling";

const METRIC_OPTS: { key: Metric; label: string }[] = [
  { key: "points", label: "Points" },
  { key: "goals", label: "Goals" },
  { key: "conceded", label: "Conceded" },
  { key: "gd", label: "Goal diff" },
  { key: "winrate", label: "Win %" },
  { key: "elo", label: "Elo" },
];

type RangeKey = "1y" | "2y" | "all";

function TrendsExplorer({ mode, scope, rows, initialMetric, initialView, initialPerMatch }: { mode: StatsMode; scope: StatsScope; rows: Row[]; initialMetric?: Metric; initialView?: ViewMode; initialPerMatch?: boolean }) {
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
      queryKey: ["stats", "playerMatches", r.id, scope],
      queryFn: () => getStatsPlayerMatches({ playerId: r.id, scope }),
      enabled: rows.length > 0 && metric !== "elo",
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    })),
  });

  const eloQ = useQuery({
    queryKey: ["stats", "ratingsHistory", mode, scope],
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
  // Win % is already a rate; cumulative + the per-match modifier only apply to absolute metrics.
  const allowsCumulative = !isElo && metric !== "winrate";
  // Elo always uses "cumulative" for running rating and "per" for delta; Last-N hidden.
  const effView: ViewMode = isElo
    ? (view === "per" ? "per" : "cumulative")
    : (!allowsCumulative && view === "cumulative" ? "rolling" : view);
  const applyPM = perMatch && !isElo && metric !== "winrate";

  // Series computed over ALL events; the visible date window (below) pans/zooms the view.
  const { events, series } = useMemo(() => {
    // --- ELO branch ---
    if (isElo) {
      const histData = eloQ.data as StatsRatingsHistoryResponse | undefined;
      if (!histData) return { events: [], series: [] };

      // Build a union of all tournament ids/dates from all players' histories.
      const tInfo = new Map<number, { date: string; name: string }>();
      for (const entry of histData.players) {
        for (const snap of entry.history) {
          if (!tInfo.has(snap.tournament_id)) {
            tInfo.set(snap.tournament_id, { date: snap.date, name: snap.tournament_name });
          }
        }
      }
      const tsOf = (tid: number) => new Date(tInfo.get(tid)?.date ?? 0).getTime();
      const allTids = [...tInfo.keys()].sort((a, b) => tsOf(a) - tsOf(b) || a - b);
      const events = allTids.map((tid) => ({ ts: tsOf(tid), label: tInfo.get(tid)?.name ?? "" }));

      // Per-player: map tid → {rating_after, delta}
      const rowIds = new Set(rows.map((r) => r.id));
      const series = histData.players
        .filter((e) => rowIds.has(e.player.id))
        .map((entry) => {
          const snapByTid = new Map(entry.history.map((s) => [s.tournament_id, s]));
          const points = allTids.map((tid) => {
            const snap = snapByTid.get(tid);
            if (!snap) return null;
            return effView === "per" ? snap.delta : snap.rating_after;
          });
          const c = colorOf(entry.player.id);
          return { id: entry.player.id, name: entry.player.display_name, color: c.solid, points: hidden.has(entry.player.id) ? points.map(() => null) : points };
        });
      return { events, series };
    }

    // --- Standard metrics branch ---
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
        // rolling: only emit at tournaments the player actually played, so
        // non-participation renders as a greyed/dashed gap (like the dashboard).
        if (c == null) return null;
        if (applyPM) {
          // Per-match (PPM): pool points/matches across the last rollN played
          // tournaments (Σpoints / Σmatches), NOT the mean of per-tournament
          // ratios — so Last-N matches the cumulative value once the window
          // covers every tournament.
          const wnd: Array<{ pts: number; played: number }> = [];
          for (let j = i; j >= 0 && wnd.length < rollN; j--) {
            const cj = full[j];
            if (!cj) continue;
            wnd.push({ pts: cj.v, played: cj.played });
          }
          return pooledPpm(wnd);
        }
        const wv: number[] = [];
        for (let j = i; j >= 0 && wv.length < rollN; j--) { const b = base(j); if (b != null) wv.push(b); }
        return wv.length ? wv.reduce((a, b) => a + b, 0) / wv.length : null;
      });
      const c = colorOf(r.id);
      return { id: r.id, name: r.name, color: c.solid, points: hidden.has(r.id) ? points.map(() => null) : points };
    });
    return { events, series };
  }, [rows, matchesQs, eloQ.data, metric, isElo, effView, rollN, hidden, mode, applyPM, colorOf]);

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
  // Always show tournament labels; allow panning slightly left of the first event
  // so its (down-left) label can be read fully — without shifting the y-axis.
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
      // Extra scroll room on the left (in time) for the first tournament label.
      const innerWpx = Math.max(60, (el.clientWidth - 16) - 32 - 12);
      const leadTime = (90 / innerWpx) * w;
      const loEff = lo - leadTime;
      let nt0 = t0;
      let nt1 = t0 + w;
      if (nt1 > hi) { nt1 = hi; nt0 = hi - w; }
      if (nt0 < loEff) { nt0 = loEff; nt1 = loEff + w; }
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

  const isPpm = metric === "points" && applyPM;
  const allY = series.flatMap((s) => s.points.filter((p): p is number => p != null));
  let yMax: number;
  let yMin: number;
  let yTicks: number[] | undefined;
  if (isPpm) {
    yMin = 0; yMax = 3; yTicks = [0, 1, 2, 3];
  } else if (isElo && effView === "per") {
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
            {!isElo && metric !== "winrate" ? <ToggleChip on={perMatch} onClick={() => setPerMatch((v) => !v)}>Per match</ToggleChip> : null}
          </div>
        </Field>
        <Field label="View">
          {isElo ? (
            <ChipGroup<"cumulative" | "per"> value={effView === "per" ? "per" : "cumulative"} onChange={(v) => setView(v)} ariaLabel="View"
              options={[{ key: "cumulative", label: "Rating" }, { key: "per", label: "Δ per event" }]} />
          ) : (
            <ChipGroup<ViewMode> value={effView} onChange={setView} ariaLabel="View"
              options={[
                ...(allowsCumulative ? [{ key: "cumulative" as ViewMode, label: "Cumulative" }] : []),
                { key: "per", label: "Per event" },
                { key: "rolling", label: "Last N" },
              ]} />
          )}
        </Field>
        {effView === "rolling" ? (
          <div className="space-y-1">
            <Slider label="Last N" value={rollN} min={2} max={Math.max(3, Math.min(20, events.length || 10))} onChange={setRollN} />
            <div className="text-[10px] text-text-muted">Rolling average over the last {rollN} tournaments.</div>
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

  // Custom (drag-reorderable) column order; null = default (pts desc). Reset on mode.
  const baseOrder = useMemo(() => players.map((p) => p.player_id), [players]);
  const [order, setOrder] = useState<number[] | null>(null);
  useEffect(() => { setOrder(null); }, [mode]);
  const orderedPlayers = useMemo(() => {
    const byId = new Map(players.map((p) => [p.player_id, p]));
    const ids = order ?? baseOrder;
    const out = ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
    for (const p of players) if (!ids.includes(p.player_id)) out.push(p); // any new players
    return out;
  }, [order, baseOrder, players]);
  const colByPlayer = useMemo(() => new Map(orderedPlayers.map((p, j) => [p.player_id, j])), [orderedPlayers]);
  const cupColor = (key: string) => rgbFromCssVar(cupColorVarForKey(key));

  // Pointer-based column drag (works on touch).
  const dragRef = useRef<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const onColDown = (e: React.PointerEvent, pid: number) => {
    dragRef.current = pid; setDragId(pid); setOverId(pid);
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onColMove = (e: React.PointerEvent) => {
    if (dragRef.current == null) return;
    const cell = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-col-pid]");
    const pid = cell?.getAttribute("data-col-pid");
    if (pid) setOverId(Number(pid));
  };
  const onColUp = () => {
    const src = dragRef.current;
    const dst = overId;
    dragRef.current = null; setDragId(null); setOverId(null);
    if (src == null || dst == null || src === dst) return;
    const ids = (order ?? baseOrder).slice();
    const from = ids.indexOf(src);
    const to = ids.indexOf(dst);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, src);
    setOrder(ids);
  };

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
      <div className="mb-1.5 text-[11px] text-text-muted">Drag a player's icon to reorder the columns.</div>
      <div className="overflow-x-auto" data-no-swipe-nav>
        <div className="relative" style={{ width: gridW }}>
          <div
            className="relative"
            style={{ display: "grid", gridTemplateColumns: `${nameW}px repeat(${orderedPlayers.length}, ${cellW}px)`, columnGap: gap, rowGap: gap }}
          >
            <div style={{ height: headerH }} className="sticky top-0 z-30 bg-bg-default" />
            {orderedPlayers.map((p) => {
              const isDragging = dragId === p.player_id;
              const isOver = dragId != null && overId === p.player_id && !isDragging;
              return (
                <div
                  key={p.player_id}
                  data-col-pid={p.player_id}
                  onPointerDown={(e) => onColDown(e, p.player_id)}
                  onPointerMove={onColMove}
                  onPointerUp={onColUp}
                  style={{ height: headerH }}
                  className={
                    "sticky top-0 z-30 flex cursor-grab touch-none select-none flex-col items-center justify-end gap-1 rounded-t pb-1 bg-bg-default " +
                    (isDragging ? "opacity-40" : isOver ? "ring-2 ring-accent ring-inset" : "")
                  }
                  title="Drag to reorder"
                >
                  <AvatarCircle playerId={p.player_id} name={p.display_name} updatedAt={avatarUpdatedAtById.get(p.player_id) ?? null} sizeClass="h-6 w-6" />
                  <span className="w-full truncate text-center text-[9px] text-text-muted">{p.display_name}</span>
                </div>
              );
            })}
            {tournaments.map((t) => (
              <Fragment key={t.id}>
                <div style={{ height: cellH }} className="flex items-center pr-1.5">
                  <Link
                    to={`/live/${t.id}`}
                    title={`${t.name} — open tournament`}
                    className="block w-full text-[10px] leading-tight text-text-normal no-underline transition hover:text-accent"
                    style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                  >
                    {t.name}
                  </Link>
                </div>
                {orderedPlayers.map((p) => {
                  const pos = p.positions_by_tournament?.[String(t.id)];
                  if (pos == null)
                    return <div key={p.player_id} style={{ height: cellH }} className="grid place-items-center rounded bg-bg-card-chip/15 text-[10px] text-text-muted">·</div>;
                  const total = t.players_count || 1;
                  const frac = total > 1 ? (pos - 1) / (total - 1) : 0;
                  const stakes = t.cup_stakes ?? [];
                  const isWinner = pos === 1 && stakes.length > 0;
                  return (
                    <Link
                      key={p.player_id}
                      to={`/live/${t.id}`}
                      style={{ height: cellH, ["--pos-p"]: frac } as React.CSSProperties}
                      className="pos-tile relative grid place-items-center rounded border text-[11px] font-semibold tabular-nums no-underline transition hover:z-10 hover:ring-2 hover:ring-inset hover:ring-accent/70"
                      title={`${p.display_name} · ${t.name}: #${pos}/${total}${isWinner ? ` · won ${stakes.map((s) => s.name).join(", ")}` : ""} — open tournament`}
                    >
                      {isWinner ? (
                        <span className="absolute right-0.5 top-0.5 inline-flex gap-px">
                          {stakes.map((s) => (
                            <i key={s.key} className="fa-solid fa-crown text-[8px]" style={{ color: cupColor(s.key) }} aria-hidden="true" />
                          ))}
                        </span>
                      ) : null}
                      {pos}
                    </Link>
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

function h2hSequential(t: number): string {
  return `hsl(210 60% ${48 - t * 22}% / ${0.55 + t * 0.3})`;
}

function h2hDiverging(gd: number, maxAbs: number): string {
  if (maxAbs === 0) return `hsl(0 0% 40% / 0.55)`;
  const t = Math.max(-1, Math.min(1, gd / maxAbs));
  if (t >= 0) return `hsl(130 55% ${46 - t * 18}% / ${0.55 + t * 0.3})`;
  return `hsl(0 55% ${46 + t * 18}% / ${0.55 - t * 0.3})`;
}

function H2HView({ mode, scope, rows, myId }: { mode: StatsMode; scope: StatsScope; rows: Row[]; myId?: number | null }) {
  const q = useQuery({
    queryKey: ["stats", "h2h", "all", 200, "rivalry", scope],
    queryFn: () => getStatsH2H({ playerId: null, limit: 200, order: "rivalry", scope }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const defaultSelected = (myId != null && rows.some((r) => r.id === myId)) ? myId : (rows[0]?.id ?? null);
  const [selected, setSelected] = useState<number | null>(defaultSelected);
  const [matrixMetric, setMatrixMetric] = useState<"winrate" | "played" | "gd" | "wdl" | "ppm" | "rivalry">("winrate");
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
    const ppm = (3 * rowWins + p.draws) / p.played;
    return { pct: (rowWins / p.played) * 100, w: rowWins, d: p.draws, l: colWins, played: p.played, gd: rowGf - rowGa, ppm, rivalry: p.rivalry_score };
  };
  const cellText = (v: { pct: number; played: number; gd: number; w: number; d: number; l: number; ppm: number; rivalry: number }) =>
    matrixMetric === "played" ? String(v.played)
      : matrixMetric === "gd" ? (v.gd >= 0 ? `+${v.gd}` : String(v.gd))
        : matrixMetric === "wdl" ? `${v.w}-${v.d}-${v.l}`
          : matrixMetric === "ppm" ? v.ppm.toFixed(2)
            : matrixMetric === "rivalry" ? String(Math.round(v.rivalry))
              : String(Math.round(v.pct));
  const topRivalries = pairs.slice().sort((a, b) => b.rivalry_score - a.rivalry_score).slice(0, 8);

  // Precompute normalization ranges for per-metric coloring.
  const matrixRanges = useMemo(() => {
    let maxPlayed = 1, maxRivalry = 1, maxAbsGd = 1;
    for (const r of rows) {
      for (const c of rows) {
        if (r.id === c.id) continue;
        const v = cell(r.id, c.id);
        if (!v) continue;
        maxPlayed = Math.max(maxPlayed, v.played);
        maxRivalry = Math.max(maxRivalry, v.rivalry);
        maxAbsGd = Math.max(maxAbsGd, Math.abs(v.gd));
      }
    }
    return { maxPlayed, maxRivalry, maxAbsGd };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs, rows]);

  const cellColor = (v: ReturnType<typeof cell>): string => {
    if (!v) return "";
    switch (matrixMetric) {
      case "played": return h2hSequential(v.played / matrixRanges.maxPlayed);
      case "rivalry": return h2hSequential(v.rivalry / matrixRanges.maxRivalry);
      case "gd": return h2hDiverging(v.gd, matrixRanges.maxAbsGd);
      default: return h2hTone(v.pct);
    }
  };

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

  // 2v2 teammate synergy — how the selected player does *with* each partner.
  const teammateQ = useQuery({
    queryKey: ["stats", "playerMatches", selected ?? 0, scope],
    queryFn: () => getStatsPlayerMatches({ playerId: selected as number, scope }),
    enabled: mode === "2v2" && selected != null,
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const teammates = useMemo(() => {
    if (mode !== "2v2" || selected == null) return [];
    const data = teammateQ.data as { tournaments: StatsPlayerMatchesTournament[] } | undefined;
    type TM = { id: number; name: string; played: number; w: number; d: number; l: number; gf: number; ga: number; pts: number };
    const acc = new Map<number, TM>();
    for (const t of data?.tournaments ?? []) {
      if (t.mode !== "2v2") continue;
      for (const m of t.matches) {
        if (m.state !== "finished") continue;
        const sideA = m.sides.find((s) => s.side === "A");
        const sideB = m.sides.find((s) => s.side === "B");
        const mySide = (sideA?.players ?? []).some((p) => p.id === selected) ? sideA
          : (sideB?.players ?? []).some((p) => p.id === selected) ? sideB : null;
        if (!mySide) continue;
        const st = matchStats(m, selected);
        if (!st) continue;
        for (const partner of (mySide.players ?? []).filter((p) => p.id !== selected)) {
          const e = acc.get(partner.id) ?? { id: partner.id, name: partner.display_name, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
          e.played++; e.gf += st.gf; e.ga += st.ga; e.pts += st.pts;
          if (st.res === "W") e.w++; else if (st.res === "D") e.d++; else e.l++;
          acc.set(partner.id, e);
        }
      }
    }
    return Array.from(acc.values()).sort(
      (a, b) => b.pts / Math.max(1, b.played) - a.pts / Math.max(1, a.played) || b.played - a.played,
    );
  }, [teammateQ.data, mode, selected]);
  const bestPartner = teammates.length >= 2 ? teammates[0] : null;
  const worstPartner = teammates.length >= 2 ? teammates[teammates.length - 1] : null;

  if (q.isLoading && !q.data) return <InlineLoading label="Loading…" />;

  return (
    <div className="space-y-5">
      {/* Full-name square matrix */}
      <div>
        <div className="section-head"><span className="section-label">Matrix</span></div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ChipGroup<"winrate" | "played" | "gd" | "wdl" | "ppm" | "rivalry">
            value={matrixMetric}
            onChange={setMatrixMetric}
            ariaLabel="Matrix metric"
            options={[{ key: "winrate", label: "Win %" }, { key: "wdl", label: "W-D-L" }, { key: "ppm", label: "PPM" }, { key: "played", label: "Played" }, { key: "gd", label: "Goal diff" }, { key: "rivalry", label: "Rivalry" }]}
          />
        </div>
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
                          style={{ backgroundColor: cellColor(v) }}
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

      {/* Teammate synergy (2v2) */}
      {mode === "2v2" && selected != null ? (
        <div className="space-y-2">
          <div className="section-head"><span className="section-label">Teammate synergy</span></div>
          {teammateQ.isLoading && !teammateQ.data ? (
            <InlineLoading label="Loading…" />
          ) : teammates.length ? (
            <>
              <p className="text-[11px] text-text-muted">How {selName} performs with each partner (points per match as a duo).</p>
              {bestPartner && worstPartner && bestPartner.id !== worstPartner.id ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="card-chip px-3 py-2">
                    <div className="inline-flex items-center gap-2 text-text-muted"><i className="fa-solid fa-handshake-angle" aria-hidden="true" /><span>Best partner</span></div>
                    <div className="mt-0.5 font-semibold">{bestPartner.name}</div>
                    <div className="mt-0.5 text-text-muted">{bestPartner.w}-{bestPartner.d}-{bestPartner.l} · {(bestPartner.pts / Math.max(1, bestPartner.played)).toFixed(2)} ppm</div>
                  </div>
                  <div className="card-chip px-3 py-2">
                    <div className="inline-flex items-center gap-2 text-text-muted"><i className="fa-solid fa-user-slash" aria-hidden="true" /><span>Toughest pairing</span></div>
                    <div className="mt-0.5 font-semibold">{worstPartner.name}</div>
                    <div className="mt-0.5 text-text-muted">{worstPartner.w}-{worstPartner.d}-{worstPartner.l} · {(worstPartner.pts / Math.max(1, worstPartner.played)).toFixed(2)} ppm</div>
                  </div>
                </div>
              ) : null}
              <div className="list-divided">
                {teammates.map((tm) => (
                  <button key={tm.id} type="button" onClick={() => setSelected(tm.id)} className="row row-tap">
                    <span className="min-w-0 flex-1 truncate text-sm text-text-normal">{tm.name}</span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted">
                      {tm.played}P · <span className="text-status-text-green">{tm.w}</span>-<span className="text-amber-300">{tm.d}</span>-<span className="text-[color:rgb(var(--delta-down)/1)]">{tm.l}</span>
                    </span>
                    <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-accent">{(tm.pts / Math.max(1, tm.played)).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="text-sm text-text-muted">No 2v2 matches with a partner yet.</div>
          )}
        </div>
      ) : null}

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
  const { colorOf } = usePlayerColors();
  const row = rows.find((r) => r.id === selectedId) ?? null;

  // Field maxes → normalise each axis to 0..1, so any player's radar is comparable.
  const fieldMax = useMemo(() => ({
    gfpm: Math.max(0.01, ...rows.map((r) => (r.played ? r.gf / r.played : 0))),
    gapm: Math.max(0.01, ...rows.map((r) => (r.played ? r.ga / r.played : 0))),
    played: Math.max(1, ...rows.map((r) => r.played)),
  }), [rows]);
  const axesFor = useCallback((r: Row) => [
    { label: "Attack", value: (r.played ? r.gf / r.played : 0) / fieldMax.gfpm },
    { label: "Defense", value: 1 - (r.played ? r.ga / r.played : 0) / fieldMax.gapm },
    { label: "Win %", value: r.played ? r.wins / r.played : 0 },
    { label: "Form", value: r.formAvg / 3 },
    { label: "Activity", value: r.played / fieldMax.played },
  ], [fieldMax]);

  // Overlay other players' radars (each in its consistent colour).
  const [overlayIds, setOverlayIds] = useState<Set<number>>(new Set());
  const radarSeries = useMemo(() => {
    if (!row) return [];
    const ids = [row.id, ...rows.filter((r) => r.id !== row.id && overlayIds.has(r.id)).map((r) => r.id)];
    return ids
      .map((id) => rows.find((r) => r.id === id))
      .filter((r): r is Row => !!r)
      .map((r) => ({ name: r.name, color: colorOf(r.id).solid, axes: axesFor(r) }));
  }, [row, rows, overlayIds, axesFor, colorOf]);

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

          <div className="card-outer">
            <h2 className="text-sm font-semibold text-text-normal">Profile net</h2>
            <div className="flex flex-col items-center">
              <Radar series={radarSeries} />
              <div className="text-[11px] text-text-muted">Strengths relative to the field.</div>
            </div>
            {/* Overlay other players, each in their consistent colour. */}
            <div className="mt-2">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">Compare with</div>
              <div className="flex flex-wrap gap-1.5">
                {rows.filter((r) => r.id !== row.id).map((r) => {
                  const on = overlayIds.has(r.id);
                  const c = colorOf(r.id).solid;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setOverlayIds((prev) => { const s = new Set(prev); if (s.has(r.id)) s.delete(r.id); else s.add(r.id); return s; })}
                      className={
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition focus-ring " +
                        (on ? "bg-bg-card-chip/70 text-text-normal ring-1 ring-inset ring-border-card-chip" : "bg-bg-card-chip/30 text-text-muted hover:text-text-normal")
                      }
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c, opacity: on ? 1 : 0.45 }} />
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
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
type RecMatch = { id: number; tId: number; tName: string; date: string; a: string; b: string; ag: number; bg: number; aIds: number[]; bIds: number[] };

function RecordGroup({ icon, label, matches }: { icon: string; label: string; matches: RecMatch[] }) {
  if (!matches.length) return null;
  const shown = matches.slice(0, 6);
  return (
    <div className="surface rounded-xl px-3 py-2.5">
      <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-text-muted">
        <i className={"fa-solid " + icon} aria-hidden="true" />
        {label}
        {matches.length > 1 ? <span className="text-text-muted/70">×{matches.length}</span> : null}
      </div>
      <div className="mt-1.5 space-y-2">
        {shown.map((m) => (
          <Link
            key={m.id}
            to={`/live/${m.tId}?match=${m.id}`}
            title={`${m.tName} — open tournament`}
            className="flex items-center justify-between gap-3 rounded-lg px-1.5 py-1 -mx-1.5 no-underline transition hover:bg-hover-default/30"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text-normal">{m.a} <span className="text-text-muted">vs</span> {m.b}</div>
              <div className="text-[11px] text-text-muted">{m.tName} · {fmtShortDate(m.date)}</div>
            </div>
            <div className="shrink-0 font-mono text-base font-bold tabular-nums text-accent">{m.ag}:{m.bg}</div>
          </Link>
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
    queryKey: ["stats", "streaks", mode, 20, scope],
    queryFn: () => getStatsStreaks({ mode, limit: 20, scope }),
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
            id: m.id, tId: t.id, tName: t.name, date: t.date,
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
      .map((c) => {
        const maxLen = Math.max(...c.records.map((r) => r.length ?? 0));
        // Show every player tied at the record length, not just the first.
        const runs = c.records.filter((r) => (r.length ?? 0) === maxLen);
        return { name: c.name, length: maxLen, runs };
      })
      .filter((c) => c.length > 0);
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
              <div key={s.name} className="surface rounded-xl px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-text-muted">
                    {s.name}
                    {s.runs.length > 1 ? <span className="text-text-muted/70">×{s.runs.length}</span> : null}
                  </div>
                  <div className="shrink-0 font-mono text-lg font-bold tabular-nums text-accent">{s.length}</div>
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {s.runs.slice(0, 6).map((run, i) => (
                    <div key={(run.player?.id ?? i) + "-" + i} className="min-w-0">
                      <div className="truncate text-sm font-medium text-text-normal">{run.player.display_name}</div>
                      <div className="text-[11px] text-text-muted">{streakDateText(run)}</div>
                    </div>
                  ))}
                  {s.runs.length > 6 ? <div className="text-[11px] text-text-muted">+{s.runs.length - 6} more</div> : null}
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
const TAB_KEYS = TABS.map((t) => t.key);

export default function StatsInsights({
  mode, scope, onModeChange, onScopeChange, playerId, onSelectPlayer,
}: {
  mode: StatsMode; scope: StatsScope;
  onModeChange: (m: StatsMode) => void; onScopeChange: (s: StatsScope) => void;
  playerId: number | ""; onSelectPlayer: (id: number) => void;
}) {
  const { rows, loading } = useStandings(mode, scope);
  const { playerId: selfId } = useAuth();
  const myId = selfId != null ? Number(selfId) : null;
  // Deep-link support: dashboard (and others) can pass an initial tab + trends config via nav state.
  const location = useLocation();
  const initState = (location.state as { statsTab?: Tab; trendsMetric?: Metric; trendsView?: ViewMode; trendsPerMatch?: boolean } | null) ?? null;
  // The active sub-tab is persisted in the URL (`?view=`) so leaving for a tournament
  // and pressing Back restores the same tab (e.g. Positions / Records).
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const tab: Tab =
    viewParam && (TAB_KEYS as readonly string[]).includes(viewParam)
      ? (viewParam as Tab)
      : (initState?.statsTab ?? (playerId !== "" ? "player" : "trends"));
  const setTab = (t: Tab) => {
    const n = new URLSearchParams(searchParams);
    n.set("view", t);
    setSearchParams(n, { replace: true });
  };
  // Default selected player: the passed-in playerId, then self (if in the roster), then first row.
  const selfInRows = myId != null && rows.some((r) => r.id === myId);
  const selectedId = playerId !== "" ? playerId : selfInRows ? myId : (rows[0]?.id ?? null);
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

      {tab === "trends" && <TrendsExplorer mode={mode} scope={scope} rows={rows} initialMetric={initState?.trendsMetric} initialView={initState?.trendsView} initialPerMatch={initState?.trendsPerMatch} />}
      {tab === "table" && <StatsTable rows={rows} loading={loading} onSelect={goPlayer} mode={mode} scope={scope} />}
      {tab === "positions" && <PositionsView mode={mode} />}
      {tab === "h2h" && <H2HView mode={mode} scope={scope} rows={rows} myId={myId} />}
      {tab === "streaks" && <StreaksView mode={mode} scope={scope} />}
      {tab === "stars" && <StarsView mode={mode} scope={scope} rows={rows} selectedId={selectedId} onSelect={onSelectPlayer} />}
      {tab === "player" && <PlayerProfile mode={mode} scope={scope} rows={rows} selectedId={selectedId} onSelect={onSelectPlayer} />}
      {tab === "records" && <RecordsView mode={mode} scope={scope} rows={rows} />}
      {tab === "cups" && <CupsView />}
    </div>
  );
}
