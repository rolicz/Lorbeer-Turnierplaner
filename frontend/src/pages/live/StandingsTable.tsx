import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { Match, Player } from "../../api/types";
import { sideBy } from "../../helpers";
import Card from "../../ui/primitives/Card";
import AvatarCircle from "../../ui/primitives/AvatarCircle";
import CupOwnerBadge from "../../ui/primitives/CupOwnerBadge";
import { getCup, listCupDefs } from "../../api/cup.api";
import { getStatsStreaks } from "../../api/stats.api";
import type { StatsStreakRow, StatsStreaksResponse } from "../../api/types";
import { StreakPatch, type ActiveStreak } from "../../ui/StreakPatches";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";

type Row = {
  playerId: number;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

function emptyRow(p: Player): Row {
  return {
    playerId: p.id,
    name: p.display_name,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    pts: 0,
  };
}

function computeStandings(matches: Match[], players: Player[], mode: "finished" | "live"): Row[] {
  // ensure EVERY tournament player is present even with 0 matches
  const rows = new Map<number, Row>();
  for (const p of players) rows.set(p.id, emptyRow(p));

  const counted = matches.filter((m) => {
    if (mode === "finished") return m.state === "finished";
    return m.state === "finished" || m.state === "playing";
  });

  for (const m of counted) {
    const a = sideBy(m, "A");
    const b = sideBy(m, "B");
    if (!a || !b) continue;

    const aGoals = Number(a.goals ?? 0);
    const bGoals = Number(b.goals ?? 0);

    const aWin = aGoals > bGoals;
    const bWin = bGoals > aGoals;
    const draw = aGoals === bGoals;

    for (const p of a.players) {
      const r = rows.get(p.id) ?? emptyRow(p);
      rows.set(p.id, r);

      r.played += 1;
      r.gf += aGoals;
      r.ga += bGoals;
      if (aWin) r.wins += 1;
      else if (draw) r.draws += 1;
      else r.losses += 1;
    }

    for (const p of b.players) {
      const r = rows.get(p.id) ?? emptyRow(p);
      rows.set(p.id, r);

      r.played += 1;
      r.gf += bGoals;
      r.ga += aGoals;
      if (bWin) r.wins += 1;
      else if (draw) r.draws += 1;
      else r.losses += 1;
    }
  }

  const out = Array.from(rows.values());
  for (const r of out) {
    r.gd = r.gf - r.ga;
    r.pts = r.wins * 3 + r.draws;
  }

  // Sort: pts desc, then GD desc, then GF desc, then name
  out.sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    if (y.gd !== x.gd) return y.gd - x.gd;
    if (y.gf !== x.gf) return y.gf - x.gf;
    return x.name.localeCompare(y.name);
  });

  return out;
}

function posMap(rows: Row[]): Map<number, number> {
  const m = new Map<number, number>();
  rows.forEach((r, idx) => m.set(r.playerId, idx));
  return m;
}

function Arrow({ delta }: { delta: number | null }) {
  // delta = basePos - livePos (positive => moved up)
  if (delta === null) return <span className="text-text-muted">–</span>;
  if (delta > 0) return <span className="delta-up font-semibold">▲</span>;
  if (delta < 0) return <span className="delta-down font-semibold">▼</span>;
  return <span className="text-text-muted">–</span>;
}

export default function StandingsTable({
  tournamentId,
  tournamentDate,
  tournamentMode: _tournamentMode,
  matches,
  players,
  tournamentStatus,
  wrap = true,
}: {
  tournamentId: number;
  tournamentDate?: string | null;
  tournamentMode: "1v1" | "2v2";
  matches: Match[];
  players: Player[];
  tournamentStatus?: "draft" | "live" | "done";
  /** If false, renders borderless (for embedding inside another Card/Collapsible). */
  wrap?: boolean;
}) {
  const navigate = useNavigate();
  const baseRows = useMemo(() => computeStandings(matches, players, "finished"), [matches, players]);
  const liveRows = useMemo(() => computeStandings(matches, players, "live"), [matches, players]);
  const basePos = useMemo(() => posMap(baseRows), [baseRows]);

  const { avatarUpdatedAtById: avatarUpdatedAtByPlayerId } = usePlayerAvatarMap();

  const cupDefsQ = useQuery({ queryKey: ["cup", "defs"], queryFn: listCupDefs });
  const cups = useMemo(() => {
    const cupsRaw = cupDefsQ.data?.cups?.length ? cupDefsQ.data.cups : [{ key: "default", name: "Cup", since_date: null }];
    // Keep config order, but put the default cup last (consistent with dashboard/players).
    const nonDefault = cupsRaw.filter((c) => c.key !== "default");
    const defaults = cupsRaw.filter((c) => c.key === "default");
    return [...nonDefault, ...defaults];
  }, [cupDefsQ.data]);

  const cupsQ = useQueries({
    queries: cups.map((c) => ({
      queryKey: ["cup", c.key],
      queryFn: () => getCup(c.key),
    })),
  });

  const showStreaks = tournamentStatus !== "done";
  const streaksQ = useQuery<StatsStreaksResponse>({
    queryKey: ["stats", "streaks", "overall", 200],
    queryFn: () => getStatsStreaks({ mode: "overall", playerId: null, limit: 200 }),
    enabled: showStreaks,
    staleTime: 0,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
  });

  const streaksByPlayerId = useMemo(() => {
    const m = new Map<number, ActiveStreak[]>();
    if (!showStreaks) return m;
    const data = streaksQ.data;
    if (!data) return m;

    const cur = (key: string) => data.categories.find((c) => c.key === key)?.current ?? [];
    const rec = (key: string) => data.categories.find((c) => c.key === key)?.records ?? [];

    // Only show "real" streaks.
    const MIN_LEN = 2;
    const wins = cur("win_streak");
    const unbeaten = cur("unbeaten_streak");
    const scoring = cur("scoring_streak");
    const clean = cur("clean_sheet_streak");

    const recordsWins = rec("win_streak");
    const recordsUnbeaten = rec("unbeaten_streak");
    const recordsScoring = rec("scoring_streak");
    const recordsClean = rec("clean_sheet_streak");

    const bestRecBy = (rows: StatsStreakRow[]) => {
      const best = new Map<number, { length: number; start_ts: string | null; end_ts: string | null }>();
      for (const r of rows ?? []) {
        const pid = r.player?.id;
        const len = Number(r.length ?? 0);
        if (!pid || len <= 0) continue;
        const prev = best.get(pid);
        if (!prev || len > prev.length) best.set(pid, { length: len, start_ts: r.start_ts ?? null, end_ts: r.end_ts ?? null });
      }
      return best;
    };

    const bestWin = bestRecBy(recordsWins);
    const bestUnbeaten = bestRecBy(recordsUnbeaten);
    const bestScoring = bestRecBy(recordsScoring);
    const bestClean = bestRecBy(recordsClean);

    const add = (pid: number, s: ActiveStreak) => {
      const arr = m.get(pid) ?? [];
      arr.push(s);
      m.set(pid, arr);
    };

    const winLenByPid = new Map<number, number>();
    for (const r of wins) {
      if ((r.length ?? 0) < MIN_LEN) continue;
      const pid = r.player.id;
      winLenByPid.set(pid, Number(r.length) || 0);
      const best = bestWin.get(pid);
      const highlight = !!best && best.length === r.length && (best.start_ts ?? null) === (r.start_ts ?? null) && (best.end_ts ?? null) === (r.end_ts ?? null);
      add(pid, { key: "win_streak", length: r.length, highlight });
    }
    for (const r of unbeaten) {
      if ((r.length ?? 0) < MIN_LEN) continue;
      const pid = r.player.id;
      const winLen = winLenByPid.get(pid) ?? 0;
      // If the unbeaten run is longer than the current win streak (i.e. contains draws),
      // show both. Otherwise, the unbeaten badge would be redundant.
      if (winLen > 0 && Number(r.length || 0) <= winLen) continue;
      const best = bestUnbeaten.get(pid);
      const highlight = !!best && best.length === r.length && (best.start_ts ?? null) === (r.start_ts ?? null) && (best.end_ts ?? null) === (r.end_ts ?? null);
      add(pid, { key: "unbeaten_streak", length: r.length, highlight });
    }
    for (const r of scoring) {
      if ((r.length ?? 0) < MIN_LEN) continue;
      const pid = r.player.id;
      const best = bestScoring.get(pid);
      const highlight = !!best && best.length === r.length && (best.start_ts ?? null) === (r.start_ts ?? null) && (best.end_ts ?? null) === (r.end_ts ?? null);
      add(pid, { key: "scoring_streak", length: r.length, highlight });
    }
    for (const r of clean) {
      if ((r.length ?? 0) < MIN_LEN) continue;
      const pid = r.player.id;
      const best = bestClean.get(pid);
      const highlight = !!best && best.length === r.length && (best.start_ts ?? null) === (r.start_ts ?? null) && (best.end_ts ?? null) === (r.end_ts ?? null);
      add(pid, { key: "clean_sheet_streak", length: r.length, highlight });
    }

    for (const [, arr] of m.entries()) {
      // stable display order
      arr.sort((a, b) => {
        const order = (k: ActiveStreak["key"]) =>
          k === "win_streak"
            ? 0
            : k === "unbeaten_streak"
              ? 1
              : k === "scoring_streak"
                ? 2
                : 3;
        const oa = order(a.key);
        const ob = order(b.key);
        if (oa !== ob) return oa - ob;
        return b.length - a.length;
      });
    }

    return m;
  }, [showStreaks, streaksQ.data]);

  const cupMarksByPlayerId = useMemo(() => {
    const m = new Map<number, { key: string; name: string }[]>();
    const tDateMs = tournamentDate ? Date.parse(tournamentDate) : NaN;

    const add = (playerId: number | null, key: string, name: string) => {
      if (playerId == null || playerId <= 0) return;
      const arr = m.get(playerId) ?? [];
      arr.push({ key, name });
      m.set(playerId, arr);
    };

    for (let i = 0; i < cups.length; i++) {
      const def = cups[i];
      const q = cupsQ[i];
      const data = q?.data;
      if (!data) continue;

      const hist = (data.history ?? []).slice().sort((a, b) => {
        const da = Date.parse(a.date);
        const db = Date.parse(b.date);
        if (da !== db) return da - db;
        return a.tournament_id - b.tournament_id;
      });

      const direct = hist.find((h) => h.tournament_id === tournamentId);
      if (direct) {
        add(direct.from?.id ?? null, def.key, data.cup?.name ?? def.name ?? def.key);
        continue;
      }

      // If we cannot locate the tournament on the timeline, fallback to "current owner"
      // (still useful for live tournaments, and harmless for cups with no history).
      if (!Number.isFinite(tDateMs)) {
        add(data.owner?.id ?? null, def.key, data.cup?.name ?? def.name ?? def.key);
        continue;
      }

      // Owner before the tournament = owner after the last transfer strictly before it.
      let ownerId: number | null = hist.length ? (hist[0].from?.id ?? null) : (data.owner?.id ?? null);
      if (ownerId != null && ownerId <= 0) ownerId = null;

      for (const h of hist) {
        const hDateMs = Date.parse(h.date);
        const before = hDateMs < tDateMs || (hDateMs === tDateMs && h.tournament_id < tournamentId);
        if (!before) continue;
        const next = h.to?.id ?? null;
        ownerId = next != null && next > 0 ? next : null;
      }

      add(ownerId, def.key, data.cup?.name ?? def.name ?? def.key);
    }

    return m;
  }, [cups, cupsQ, tournamentDate, tournamentId]);

  const title = tournamentStatus === "done" ? "Results" : "Standings (live)";

  const content = (
    <div className="overflow-x-auto" data-no-swipe-nav>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-card-chip/50 text-[11px] uppercase tracking-wide text-text-muted">
            <th className="sticky left-0 z-10 bg-bg-default py-2 pl-1 pr-2 text-left font-medium">Player</th>
            <th className="px-2 py-2 text-right font-medium">P</th>
            <th className="px-2 py-2 text-right font-medium">W</th>
            <th className="px-2 py-2 text-right font-medium">D</th>
            <th className="px-2 py-2 text-right font-medium">L</th>
            <th className="px-2 py-2 text-right font-medium">GF</th>
            <th className="px-2 py-2 text-right font-medium">GA</th>
            <th className="px-2 py-2 text-right font-medium">GD</th>
            <th className="px-2 py-2 pl-2 pr-1 text-right font-medium">Pts</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {liveRows.map((r, idx) => {
            const baseIdx = basePos.get(r.playerId);
            const delta = baseIdx === undefined ? null : baseIdx - idx;
            const isLeader = idx === 0;
            const cupMarks = cupMarksByPlayerId.get(r.playerId) ?? [];
            const streaks = streaksByPlayerId.get(r.playerId) ?? [];
            return (
              <tr
                key={r.playerId}
                className="cursor-pointer border-b border-border-card-inner/40 transition hover:bg-hover-default/30"
                title={`Open profile: ${r.name}`}
                onClick={() => navigate(`/profiles/${r.playerId}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/profiles/${r.playerId}`);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <td className="sticky left-0 z-10 bg-bg-default py-2 pl-1 pr-2">
                  <div className="relative flex items-center gap-2">
                    {isLeader ? <span className="absolute inset-y-0 -left-1 w-0.5 rounded bg-status-bar-green" aria-hidden="true" /> : null}
                    <span className="w-4 text-right text-xs tabular-nums text-text-muted">{idx + 1}</span>
                    <span className="w-3 shrink-0 text-center text-[10px] leading-none"><Arrow delta={delta} /></span>
                    <AvatarCircle playerId={r.playerId} name={r.name} updatedAt={avatarUpdatedAtByPlayerId.get(r.playerId) ?? null} sizeClass="h-7 w-7" />
                    <span className="max-w-[110px] truncate font-medium text-text-normal sm:max-w-[260px]">{r.name}</span>
                    {cupMarks.length || streaks.length ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        {cupMarks.slice(0, 2).map((c) => (
                          <CupOwnerBadge key={c.key} cupKey={c.key} cupName={c.name} title={`${c.name} owner (before tournament)`} />
                        ))}
                        {streaks.slice(0, 2).map((s, i) => (
                          <StreakPatch key={s.key + "-" + i} streak={s} className="streak-compact" />
                        ))}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-2 text-right text-text-muted">{r.played}</td>
                <td className="px-2 text-right text-status-text-green">{r.wins}</td>
                <td className="px-2 text-right text-amber-300">{r.draws}</td>
                <td className="px-2 text-right text-[color:rgb(var(--delta-down)/1)]">{r.losses}</td>
                <td className="px-2 text-right">{r.gf}</td>
                <td className="px-2 text-right">{r.ga}</td>
                <td className="px-2 text-right">{r.gd >= 0 ? `+${r.gd}` : r.gd}</td>
                <td className="px-2 pl-2 pr-1 text-right font-bold">{r.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (!wrap) return content;

  return <Card title={title} variant="inner">{content}</Card>;
}
