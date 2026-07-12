/** Trends chart data computation — the elo/form/metric series builder. */
import { useMemo } from "react";

import type { StatsPlayerMatchesTournament } from "../../../api/types";
import type { StatsRatingsHistoryResponse } from "../../../api/stats.api";
import type { StatsMode } from "../StatsControls";
import { type Row, matchStats } from "../standings";
import { pooledPpm, type PlayerColor } from "../trendsMath";

export type Metric = "points" | "goals" | "conceded" | "gd" | "winrate" | "elo" | "form";
export type ViewMode = "per" | "cumulative" | "rolling";

export type ChartEvent = { ts: number; label: string };
export type ChartSeries = { id: number; name: string; color: string; points: (number | null)[] };

type ChartData = { events: ChartEvent[]; series: ChartSeries[] };

type MatchesData = ReadonlyArray<{ tournaments: StatsPlayerMatchesTournament[] } | undefined>;

/**
 * Pure series builder for the Trends chart. Computes the per-tournament `events`
 * (x-axis) and one `series` per row, branching on the metric:
 *  - Elo: running rating (cumulative) or per-event delta.
 *  - Form: mean of the last-N match points (÷N), as on profiles.
 *  - Standard metrics: points/goals/conceded/gd/winrate, with per-event,
 *    cumulative and rolling (Last-N) views and an optional per-match modifier.
 * Kept hook-free so it can be unit-tested directly.
 */
export function computeChartData(params: {
  rows: Row[];
  matchesData: MatchesData;
  eloData: StatsRatingsHistoryResponse | undefined;
  metric: Metric;
  effView: ViewMode;
  rollN: number;
  hidden: ReadonlySet<number>;
  mode: StatsMode;
  applyPM: boolean;
  colorOf: (id: number) => PlayerColor;
}): ChartData {
  const { rows, matchesData, eloData, metric, effView, rollN, hidden, mode, applyPM, colorOf } = params;
  const isElo = metric === "elo";
  const isForm = metric === "form";

  // --- ELO branch ---
  if (isElo) {
    const histData = eloData;
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

  // --- FORM branch (profile definition: mean of the last N MATCH points ÷ N,
  //     plotted per tournament; value view or per-event delta) ---
  if (isForm) {
    const N = Math.max(1, rollN);
    const tInfo = new Map<number, { date: string; name: string }>();
    const matchPtsByPlayer = new Map<number, number[]>();          // chronological per-match points
    const endIdxByPlayer = new Map<number, Map<number, number>>(); // tid -> index of player's last match
    rows.forEach((r, i) => {
      const data = matchesData[i];
      const tours = (data?.tournaments ?? [])
        .filter((t) => mode === "overall" || t.mode === mode)
        .slice()
        .sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime() || a.id - b.id);
      const pts: number[] = [];
      const endIdx = new Map<number, number>();
      for (const t of tours) {
        const ms = t.matches.slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0) || (a.id ?? 0) - (b.id ?? 0));
        let played = false;
        for (const m of ms) {
          const s = matchStats(m, r.id);
          if (!s) continue;
          pts.push(s.pts);
          played = true;
        }
        if (played) {
          tInfo.set(t.id, { date: t.date, name: t.name });
          endIdx.set(t.id, pts.length - 1);
        }
      }
      matchPtsByPlayer.set(r.id, pts);
      endIdxByPlayer.set(r.id, endIdx);
    });
    const tsOf = (tid: number) => new Date(tInfo.get(tid)?.date ?? 0).getTime();
    const allTids = [...tInfo.keys()].sort((a, b) => tsOf(a) - tsOf(b) || a - b);
    const events = allTids.map((tid) => ({ ts: tsOf(tid), label: tInfo.get(tid)?.name ?? "" }));
    const series = rows.map((r) => {
      const pts = matchPtsByPlayer.get(r.id) ?? [];
      const endIdx = endIdxByPlayer.get(r.id) ?? new Map<number, number>();
      const formAt = (tid: number): number | null => {
        const e = endIdx.get(tid);
        if (e == null) return null;
        let sum = 0;
        for (let k = Math.max(0, e - N + 1); k <= e; k++) sum += pts[k] ?? 0;
        return sum / N; // profile semantics: divide by N even with fewer than N matches
      };
      const formVals = allTids.map((tid) => formAt(tid));
      const points = allTids.map((_, idx) => {
        const f = formVals[idx];
        if (f == null) return null;
        if (effView === "per") {
          let prev: number | null = null;
          for (let j = idx - 1; j >= 0; j--) { if (formVals[j] != null) { prev = formVals[j]; break; } }
          return prev == null ? null : f - prev;
        }
        return f;
      });
      const c = colorOf(r.id);
      return { id: r.id, name: r.name, color: c.solid, points: hidden.has(r.id) ? points.map(() => null) : points };
    });
    return { events, series };
  }

  // --- Standard metrics branch ---
  const perPlayer = new Map<number, Map<number, { v: number; played: number }>>();
  const tInfo = new Map<number, { date: string; name: string }>();
  rows.forEach((r, i) => {
    const data = matchesData[i];
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
}

/**
 * Memoised wrapper around {@link computeChartData}. Pulls `.data` off the query
 * objects inside the memo so the recompute triggers (the `matchesQs` array ref
 * and `eloQ.data`) match the original inline `useMemo`.
 */
export function useChartData(params: {
  rows: Row[];
  matchesQs: ReadonlyArray<{ data: unknown }>;
  eloQ: { data: unknown };
  metric: Metric;
  effView: ViewMode;
  rollN: number;
  hidden: ReadonlySet<number>;
  mode: StatsMode;
  applyPM: boolean;
  colorOf: (id: number) => PlayerColor;
}): ChartData {
  const { rows, matchesQs, eloQ, metric, effView, rollN, hidden, mode, applyPM, colorOf } = params;
  return useMemo(
    () => computeChartData({
      rows,
      matchesData: matchesQs.map((q) => q.data as { tournaments: StatsPlayerMatchesTournament[] } | undefined),
      eloData: eloQ.data as StatsRatingsHistoryResponse | undefined,
      metric, effView, rollN, hidden, mode, applyPM, colorOf,
    }),
    [rows, matchesQs, eloQ.data, metric, effView, rollN, hidden, mode, applyPM, colorOf],
  );
}
