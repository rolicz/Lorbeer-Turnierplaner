import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import InlineLoading from "../../ui/primitives/InlineLoading";

import { getStatsPlayerMatches, getStatsPlayers } from "../../api/stats.api";
import type { Match, StatsPlayerMatchesResponse, StatsPlayersResponse, StatsTournamentLite } from "../../api/types";
import { sideBy } from "../../helpers";
import { usePlayerColors } from "../stats/usePlayerColors";
import { pooledPpm } from "../stats/trendsMath";
import { TrendChart } from "../stats/charts";
import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";
import { fmtDate } from "../../utils/format";

type View = "lastN" | "total";

function addMonths(d: Date, months: number) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
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

export default function TrendsPreviewCard() {
  const navigate = useNavigate();
  const { colorOf } = usePlayerColors();
  const [view, setView] = useState<View>("lastN");
  const formN = 3;
  const windowMonths = 6 as const;

  // The chart mounts conditionally (after data loads), so use a callback ref to
  // (re)attach the observer whenever the node appears — a plain mount-time effect
  // would measure null and leave the width stuck at the initial value.
  const [previewW, setPreviewW] = useState(320);
  const roRef = useRef<ResizeObserver | null>(null);
  const setPreviewNode = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const measure = () => setPreviewW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    roRef.current = ro;
  }, []);
  useEffect(() => () => roRef.current?.disconnect(), []);

  const statsQ = useQuery<StatsPlayersResponse>({
    queryKey: ["stats", "players", "overall", 0],
    queryFn: () => getStatsPlayers({ mode: "overall", lastN: 0 }),
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const players = useMemo(() => statsQ.data?.players ?? [], [statsQ.data?.players]);

  const matchesQs = useQueries({
    queries: players.map((p) => ({
      queryKey: ["stats", "playerMatches", p.player_id],
      queryFn: () => getStatsPlayerMatches({ playerId: p.player_id }),
      enabled: players.length > 0,
      staleTime: 0,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    })),
  });

  const tournamentsDoneSorted = useMemo(() => {
    const byId = new Map<number, { id: number; name: string; date: string; mode: "1v1" | "2v2"; status: string; has_finished: boolean }>();
    for (const q of matchesQs as Array<{ data?: StatsPlayerMatchesResponse }>) {
      const ts = q.data?.tournaments ?? [];
      for (const t of ts) {
        const hasFinished = (t.matches ?? []).some((m) => m.state === "finished");
        const prev = byId.get(t.id);
        if (!prev) {
          byId.set(t.id, {
            id: t.id,
            name: t.name,
            date: t.date,
            mode: t.mode,
            status: t.status,
            has_finished: hasFinished,
          });
        } else if (hasFinished && !prev.has_finished) {
          byId.set(t.id, { ...prev, has_finished: true });
        }
      }
    }
    return Array.from(byId.values())
      .filter((t) => t.has_finished)
      .sort((a, b) => {
        const da = new Date(a.date ?? 0).getTime();
        const db = new Date(b.date ?? 0).getTime();
        if (da !== db) return da - db;
        return a.id - b.id;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchesQs.map((q) => q.dataUpdatedAt).join("|")]);

  const { tournaments, tids } = useMemo(() => {
    const all = tournamentsDoneSorted;
    if (!all.length) {
      return {
        tournaments: [] as StatsTournamentLite[],
        tids: [] as number[],
        windowStartTs: 0,
        windowEndTs: 0,
        xHintLeft: "",
        xHintRight: "",
      };
    }
    const last = all[all.length - 1];
    const lastTs = new Date(last?.date ?? 0).getTime();
    const nowTs = Date.now();
    const endTs = Math.max(nowTs, lastTs);
    const endD = new Date(endTs);
    const startD = addMonths(endD, -windowMonths);
    const window = all.filter((t) => {
      const d = new Date(t.date ?? 0);
      return d >= startD && d <= endD;
    });
    const lite: StatsTournamentLite[] = window.map((t) => ({ id: t.id, name: t.name, date: t.date, players_count: 0 }));
    return {
      tournaments: lite,
      tids: lite.map((t) => t.id),
      windowStartTs: startD.getTime(),
      windowEndTs: endD.getTime(),
      xHintLeft: fmtDate(lite[0]?.date),
      xHintRight: fmtDate(lite[lite.length - 1]?.date),
    };
  }, [tournamentsDoneSorted, windowMonths]);

  const perPlayer = useMemo(() => {
    const out = new Map<
      number,
      {
        tPoints: Map<number, number>;
        tForm: Map<number, number>;
        tPlayed: Set<number>;
      }
    >();
    for (let i = 0; i < players.length; i++) {
      const pid = players[i].player_id;
      const q = matchesQs[i] as { data?: StatsPlayerMatchesResponse } | undefined;
      const resp = q?.data;
      const tPoints = new Map<number, number>();
      const tForm = new Map<number, number>();
      const tPlayed = new Set<number>();

      const tournamentsChrono = (resp?.tournaments ?? [])
        .filter((t) => (t.matches ?? []).some((m) => m.state === "finished"))
        .slice()
        .sort((a, b) => {
          const da = new Date(a.date ?? 0).getTime();
          const db = new Date(b.date ?? 0).getTime();
          if (da !== db) return da - db;
          return a.id - b.id;
        });

      const tStatTimeline: Array<{ pts: number; played: number }> = []; // per-tournament points/matches
      for (const t of tournamentsChrono) {
        let sum = 0;
        let matchCount = 0;
        const matches = (t.matches ?? []).slice().sort((m1, m2) => (m1.order_index ?? 0) - (m2.order_index ?? 0));
        for (const m of matches) {
          const p = pointsForPlayerInMatch(m, pid);
          if (p == null) continue;
          sum += p;
          matchCount++;
        }
        if (matchCount > 0) {
          tStatTimeline.push({ pts: sum, played: matchCount });
          tPlayed.add(t.id);
          tPoints.set(t.id, sum);
          // Pooled PPM over the last formN played tournaments (Σpoints / Σmatches) — same as
          // the stats Trends rolling+per-match value, and equal to the cumulative PPM once the
          // window covers every tournament (a mean of per-tournament ratios would not be).
          tForm.set(t.id, pooledPpm(tStatTimeline.slice(-formN)) ?? 0);
        }
      }

      out.set(pid, { tPoints, tForm, tPlayed });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formN, players, matchesQs.map((q) => q.dataUpdatedAt).join("|")]);

  const chart = useMemo(() => {
    const tournamentTs = tournaments.map((t) => new Date(t.date ?? 0).getTime());
    const tournamentTitles = tournaments.map((t) => t.name);

    let maxCum = 0;
    const series = players.map((p) => {
      const pp = perPlayer.get(p.player_id);
      const tPoints = pp?.tPoints ?? new Map<number, number>();
      const tForm = pp?.tForm ?? new Map<number, number>();
      const tPlayed = pp?.tPlayed ?? new Set<number>();
      let cum = 0;
      let lastForm = 0;
      let sawAny = false;
      const c = colorOf(p.player_id);
      const pts = tids.map((tid) => {
        const played = tPlayed.has(tid);
        const pointsThisT = tPoints.get(tid);
        if (!played || pointsThisT == null) {
          if (view === "total") {
            maxCum = Math.max(maxCum, cum);
            return { y: cum, present: false };
          }
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
        const v = tForm.get(tid) ?? 0;
        sawAny = true;
        lastForm = v;
        return { y: v, present: true };
      });
      return { id: p.player_id, name: p.display_name, color: c.solid, colorMuted: c.muted, outline: c.outline, points: pts };
    });

    if (view === "lastN") {
      return { title: `Trends (Form, last ${formN})`, yMax: 3, yTicks: [0, 1, 2, 3], ySuffix: "", series, tournamentTs, tournamentTitles };
    }

    const yMax = Math.max(1, Math.ceil(maxCum / 10) * 10);
    return { title: "Trends (Total Points)", yMax, yTicks: [0, Math.floor(yMax / 2), yMax], ySuffix: "", series, tournamentTs, tournamentTitles };
  }, [formN, perPlayer, players, tids, tournaments, view, colorOf]);

  const matchesLoading = matchesQs.some((q) => q.isLoading);
  const matchesError = matchesQs.find((q) => q.error)?.error;

  return (
    <div>
      <div className="section-head">
        <span className="section-label">Trends</span>
      </div>
      <div className="space-y-2">
        <ErrorToastOnError error={statsQ.error} title="Trends loading failed" />
        <ErrorToastOnError error={matchesError} title="Trends loading failed" />
        <div className="grid grid-cols-[auto,1fr] items-start gap-3">
          <div className="shrink-0">
            <SegmentedSwitch<View>
              value={view}
              onChange={setView}
              options={[
                { key: "lastN", label: `Last ${formN}`, icon: "fa-bolt" },
                { key: "total", label: "Total", icon: "fa-layer-group" },
              ]}
              ariaLabel="Trends view"
              title="View"
            />
          </div>
          {players.length ? (
            <div className="min-w-0 pt-1">
              <div className="grid grid-cols-3 gap-x-3 gap-y-1">
                {chart.series.map((s) => (
                  <div key={s.id} className="flex min-w-0 items-center gap-2 text-[11px] text-text-muted">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                    <span className="min-w-0 truncate">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {statsQ.isLoading ? <InlineLoading label="Loading…" /> : null}
        {matchesLoading ? <InlineLoading label="Loading match trends…" /> : null}

        {players.length && tournaments.length ? (
          <button
            type="button"
            className="block w-full text-left"
            onClick={() =>
              navigate("/stats#stats-trends", {
                state: {
                  focus: "trends",
                  statsTab: "trends",
                  trendsMetric: "points",
                  trendsView: view === "total" ? "cumulative" : "rolling",
                  trendsPerMatch: view === "lastN",
                },
              })
            }
            aria-label="Open full trends"
          >
            <div className="rounded-2xl border border-border-card-chip/40 bg-bg-card-inner/40 p-2">
              <div ref={setPreviewNode} data-no-swipe-nav>
                <TrendChart
                  events={chart.tournamentTs.map((ts, i) => ({ ts, label: chart.tournamentTitles[i] ?? "" }))}
                  series={chart.series.map((s) => ({
                    id: s.id,
                    name: s.name,
                    color: s.color,
                    points: s.points.map((p) => (view === "total" ? p.y : p.present ? p.y : null)),
                  }))}
                  yMax={chart.yMax}
                  yMin={0}
                  yTicks={chart.yTicks}
                  showLabels
                  height={240}
                  width={previewW}
                  viewT0={chart.tournamentTs[0] ?? Date.now() - 365 * 864e5}
                  viewT1={chart.tournamentTs[chart.tournamentTs.length - 1] ?? Date.now()}
                />
              </div>
            </div>
          </button>
        ) : null}

      </div>
    </div>
  );
}
