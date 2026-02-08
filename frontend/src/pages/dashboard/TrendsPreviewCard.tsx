import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";

import { getStatsPlayerMatches, getStatsPlayers } from "../../api/stats.api";
import type { Match, StatsPlayerMatchesResponse, StatsPlayersResponse, StatsTournamentLite } from "../../api/types";
import { sideBy } from "../../helpers";
import { colorForIdx, MultiLineChart } from "../stats/TrendsCard";

type View = "lastN" | "total";

function addMonths(d: Date, months: number) {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
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

function ViewSwitch({ value, onChange }: { value: View; onChange: (m: View) => void }) {
  const idx = value === "lastN" ? 0 : 1;
  const wCls = "w-16 sm:w-24";
  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label="Trends view"
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
          { k: "lastN" as const, label: "Last 10", icon: "fa-bolt" },
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

export default function TrendsPreviewCard() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("lastN");
  const formN = 10;
  const windowMonths = 6 as const;

  const statsQ = useQuery<StatsPlayersResponse>({
    queryKey: ["stats", "players", "overall", 0],
    queryFn: () => getStatsPlayers({ mode: "overall", lastN: 0 }),
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const players = statsQ.data?.players ?? [];

  const matchesQs = useQueries({
    queries: players.map((p) => ({
      queryKey: ["stats", "playerMatches", "overall", p.player_id],
      queryFn: () => getStatsPlayerMatches({ playerId: p.player_id }),
      enabled: players.length > 0,
      staleTime: 0,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    })),
  });

  const tournamentsDoneSorted = useMemo(() => {
    const byId = new Map<number, { id: number; name: string; date: string; mode: "1v1" | "2v2"; status: string }>();
    for (const q of matchesQs as Array<{ data?: StatsPlayerMatchesResponse }>) {
      const ts = q.data?.tournaments ?? [];
      for (const t of ts) {
        if (!byId.has(t.id)) byId.set(t.id, { id: t.id, name: t.name, date: t.date, mode: t.mode, status: t.status });
      }
    }
    return Array.from(byId.values())
      .filter((t) => String(t.status) === "done")
      .sort((a, b) => {
        const da = new Date(a.date ?? 0).getTime();
        const db = new Date(b.date ?? 0).getTime();
        if (da !== db) return da - db;
        return a.id - b.id;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchesQs.map((q) => q.dataUpdatedAt).join("|")]);

  const { tournaments, tids, windowStartTs, windowEndTs, xHintLeft, xHintRight } = useMemo(() => {
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
        .filter((t) => t.status === "done")
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
        tForm.set(t.id, avgLast(matchPtsTimeline, Math.max(1, formN)));
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
    const series = players.map((p, idx) => {
      const pp = perPlayer.get(p.player_id);
      const tPoints = pp?.tPoints ?? new Map<number, number>();
      const tForm = pp?.tForm ?? new Map<number, number>();
      const tPlayed = pp?.tPlayed ?? new Set<number>();
      let cum = 0;
      let lastForm = 0;
      let sawAny = false;
      const c = colorForIdx(idx, players.length);
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
  }, [formN, perPlayer, players, tids, tournaments, view]);

  const matchesLoading = matchesQs.some((q) => q.isLoading);
  const matchesError = matchesQs.find((q) => q.error)?.error;

  return (
    <CollapsibleCard
      title={
        <span className="inline-flex items-center gap-2">
          <i className="fa-solid fa-chart-area text-text-muted" aria-hidden="true" />
          Trends
        </span>
      }
      defaultOpen={true}
      variant="outer"
      bodyVariant="none"
    >
      <div className="card-inner space-y-2">
        <div className="grid grid-cols-[auto,1fr] items-start gap-3">
          <div className="shrink-0">
            <ViewSwitch value={view} onChange={setView} />
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

        {statsQ.isLoading ? <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Loading…</div> : null}
        {statsQ.error ? <div className="card-inner-flat rounded-2xl text-sm text-red-400">{String(statsQ.error)}</div> : null}
        {matchesLoading ? <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Loading match trends…</div> : null}
        {matchesError ? <div className="card-inner-flat rounded-2xl text-sm text-red-400">{String(matchesError)}</div> : null}

        {players.length && tournaments.length ? (
          <button
            type="button"
            className="block w-full text-left"
            onClick={() => navigate("/stats#trends", { state: { focus: "trends", trendsView: view } })}
            aria-label="Open full trends"
          >
            <MultiLineChart
              title={chart.title}
              tournamentTs={chart.tournamentTs}
              windowStartTs={windowStartTs}
              windowEndTs={windowEndTs}
              tournamentTitles={chart.tournamentTitles ?? []}
              xLabelEvery={1}
              xHintLeft={xHintLeft}
              xHintRight={xHintRight}
              yMax={chart.yMax}
              yTicks={chart.yTicks}
              ySuffix={chart.ySuffix}
              series={chart.series}
              size="mini"
              showTournamentTitles={true}
              showLegend={false}
              showHeader={false}
              frame="none"
            />
          </button>
        ) : null}
      </div>
    </CollapsibleCard>
  );
}
