import { useMemo, useRef, useState } from "react";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { MetaRow } from "../../ui/primitives/Meta";

import { getStatsPlayerMatches, getStatsPlayers } from "../../api/stats.api";
import type { StatsPlayerMatchesResponse, StatsPlayersResponse, StatsTournamentLite } from "../../api/types";
import { StatsControlLabel, StatsModeSwitch, StatsSegmentedSwitch, type StatsMode } from "./StatsControls";
import { fmtDate } from "../../utils/format";
import { avgLast, colorForIdx, pointsForPlayerInMatch, type SeriesPoint } from "./trendsMath";
import { PanZoomTrendsChart } from "./TrendsChart";

type View = "lastN" | "total";





export default function TrendsCard({
  defaultOpen = false,
  initialView = "lastN",
  embedded = false,
}: {
  defaultOpen?: boolean;
  initialView?: View;
  embedded?: boolean;
} = {}) {
  const [mode, setMode] = useState<StatsMode>("overall");
  const [view, setView] = useState<View>(initialView);
  const [formN, setFormN] = useState(10);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  // lastN irrelevant here, but keep it small (we only use tournaments + positions).
  const statsQ = useQuery<StatsPlayersResponse>({
    queryKey: ["stats", "players", mode, 0],
    queryFn: () => getStatsPlayers({ mode, lastN: 0 }),
    placeholderData: keepPreviousData,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const players = useMemo(() => statsQ.data?.players ?? [], [statsQ.data?.players]);

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
      .filter((t) => t.has_finished && (mode === "overall" || t.mode === mode))
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
        .filter((t) => (mode === "overall" || t.mode === mode) && (t.matches ?? []).some((m) => m.state === "finished"))
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
          const p = pointsForPlayerInMatch(m, pid);
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

  const matchesError = needMatches ? matchesQs.find((q) => q.error)?.error : null;
  const busy = statsQ.isFetching || (needMatches && matchesQs.some((q) => q.isFetching));

  const Filters = (
    <div className="card-inner-flat rounded-2xl space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatsControlLabel icon="fa-filter" text="Filter" />
          <StatsModeSwitch value={mode} onChange={setMode} />
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <StatsControlLabel icon="fa-eye" text="View" />
          <StatsSegmentedSwitch<View>
            value={view}
            onChange={setView}
            options={[
              { key: "lastN", label: "Last N", icon: "fa-bolt" },
              { key: "total", label: "Total", icon: "fa-layer-group" },
            ]}
            ariaLabel="View"
            title="View"
          />
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

  if (embedded) {
    return (
      <div ref={wrapRef}>
        {Body}
      </div>
    );
  }

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
