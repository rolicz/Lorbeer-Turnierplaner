/** Records tab — match superlatives and longest streak runs. */
import { Flame, Goal, TrendingUp, Trophy, Zap } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";

import InlineLoading from "../../ui/primitives/InlineLoading";
import PlayerLink from "../../ui/primitives/PlayerLink";
import ScoreLine from "../../ui/primitives/ScoreLine";
import { getStatsPlayerMatches, getStatsPlayers, getStatsStreaks } from "../../api/stats.api";
import { qk } from "../../api/queryKeys";
import { teamName } from "../../utils/matchDisplay";
import { fmtShortDate } from "../../utils/format";
import type { Row } from "./standings";
import type { StatsMode } from "./statsMode";
import type { StatsScope, StatsMatch, StatsPlayerMatchesTournament, StatsStreakCategory, StatsTournamentLite } from "../../api/types";
import { streakDateText } from "./streakDisplay";

function teamNames(m: StatsMatch, side: "A" | "B"): string {
  return teamName(m.sides.find((x) => x.side === side));
}
type RecMatch = { id: number; tId: number; tName: string; date: string; a: string; b: string; ag: number; bg: number; aIds: number[]; bIds: number[] };

function RecordGroup({ icon, label, matches }: { icon: ReactNode; label: string; matches: RecMatch[] }) {
  if (!matches.length) return null;
  const shown = matches.slice(0, 6);
  return (
    <div className="inset px-3 py-2.5">
      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-text-muted">
        {icon}
        {label}
        {matches.length > 1 ? <span className="text-text-muted/70">×{matches.length}</span> : null}
      </div>
      <div className="mt-1.5 space-y-2">
        {shown.map((m) => (
          <Link
            key={m.id}
            to={`/live/${m.tId}?match=${m.id}`}
            title={`${m.tName} — open tournament`}
            className="block rounded-xl px-1.5 py-1 -mx-1.5 no-underline transition hover:bg-hover-default/30"
          >
            <ScoreLine size="sm" leftNames={m.a} rightNames={m.b} leftGoals={m.ag} rightGoals={m.bg} />
            <div className="mt-0.5 truncate text-center text-xs text-text-muted">{m.tName} · {fmtShortDate(m.date)}</div>
          </Link>
        ))}
        {matches.length > shown.length ? <div className="text-xs text-text-muted">+{matches.length - shown.length} more</div> : null}
      </div>
    </div>
  );
}

type WinLeader = { id: number; name: string; count: number; rank: number; latest: StatsTournamentLite | null };

function TitlesGroup({ leaders, onSelect }: { leaders: WinLeader[]; onSelect: (id: number) => void }) {
  if (!leaders.length) return null;
  const shown = leaders.slice(0, 6);
  const topTies = leaders.filter((l) => l.rank === 1).length;
  return (
    <div className="inset px-3 py-2.5">
      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-text-muted">
        <Trophy size={14} aria-hidden="true" />
        Most tournament wins
        {topTies > 1 ? <span className="text-text-muted/70">×{topTies}</span> : null}
      </div>
      <div className="mt-1.5 space-y-1.5">
        {shown.map((l) => (
          /* The row opens this player in Stats (stretched button), the name their profile. */
          <div key={l.id} className="relative flex w-full items-center justify-between gap-3 rounded-xl px-1.5 py-1 -mx-1.5 text-left transition hover:bg-hover-default/30">
            <button
              type="button"
              onClick={() => onSelect(l.id)}
              aria-label={`Open ${l.name} in Stats`}
              className="absolute inset-0 z-0 rounded-xl focus-ring"
            />
            <div className="pointer-events-none relative z-10 flex min-w-0 items-center gap-2">
              <span className="w-4 shrink-0 text-right text-xs tabular-nums text-text-muted">{l.rank}.</span>
              <div className="min-w-0">
                {/* The link hugs the name; the rest of the row opens the player in Stats. */}
                <PlayerLink playerId={l.id} name={l.name} className="pointer-events-auto inline-block max-w-full">
                  <span className="block truncate text-sm font-medium text-text-normal">{l.name}</span>
                </PlayerLink>
                {l.latest ? (
                  <div className="truncate text-xs text-text-muted">{l.latest.name} · {fmtShortDate(l.latest.date)}</div>
                ) : null}
              </div>
            </div>
            <div className="pointer-events-none relative z-10 shrink-0 font-mono text-base font-bold tabular-nums text-accent">{l.count}</div>
          </div>
        ))}
        {leaders.length > shown.length ? <div className="text-xs text-text-muted">+{leaders.length - shown.length} more</div> : null}
      </div>
    </div>
  );
}

export default function RecordsView({
  mode, scope, rows, onSelect,
}: { mode: StatsMode; scope: StatsScope; rows: Row[]; onSelect: (id: number) => void }) {
  const eloById = useMemo(() => new Map(rows.map((r) => [r.id, r.rating])), [rows]);
  const matchesQs = useQueries({
    queries: rows.map((r) => ({
      queryKey: qk.stats.playerMatches(r.id, scope),
      queryFn: () => getStatsPlayerMatches({ playerId: r.id, scope }),
      enabled: rows.length > 0,
      placeholderData: keepPreviousData, staleTime: 30_000,
    })),
  });
  const streaksQ = useQuery({
    queryKey: qk.stats.streaks(mode, 20, scope),
    queryFn: () => getStatsStreaks({ mode, limit: 20, scope }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  // Titles: wins per player, from the same tournament-winner data PositionsView uses.
  const playersQ = useQuery({
    queryKey: qk.stats.players(mode, "records"),
    queryFn: () => getStatsPlayers({ mode }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const loading = matchesQs.some((q) => q.isLoading && !q.data) || (playersQ.isLoading && !playersQ.data);

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

  const winLeaders = useMemo<WinLeader[]>(() => {
    const players = playersQ.data?.players ?? [];
    const tournaments = playersQ.data?.tournaments ?? [];
    if (!players.length || !tournaments.length) return [];
    const nameById = new Map(players.map((p) => [p.player_id, p.display_name]));
    // Most recent won tournament first, so the first hit per player is the latest.
    const chrono = tournaments
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
    const byPlayer = new Map<number, { count: number; latest: StatsTournamentLite | null }>();
    for (const t of chrono) {
      // Only finished tournaments have a winner (backend also guards this).
      if (t.status !== "done" || t.winner_player_id == null) continue;
      const cur = byPlayer.get(t.winner_player_id) ?? { count: 0, latest: null };
      cur.count += 1;
      if (!cur.latest) cur.latest = t;
      byPlayer.set(t.winner_player_id, cur);
    }
    const list = Array.from(byPlayer.entries())
      .map(([id, v]) => ({ id, name: nameById.get(id) ?? `#${id}`, count: v.count, latest: v.latest }))
      .sort((a, b) => b.count - a.count);
    let rank = 0, prevCount = -1;
    return list.map((x, i) => {
      if (x.count !== prevCount) { rank = i + 1; prevCount = x.count; }
      return { ...x, rank };
    });
  }, [playersQ.data]);

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
      {winLeaders.length ? (
        <div>
          <div className="section-head"><span className="section-label">Titles</span></div>
          <TitlesGroup leaders={winLeaders} onSelect={onSelect} />
        </div>
      ) : null}
      <div>
        <div className="section-head"><span className="section-label">Match superlatives</span></div>
        <div className="space-y-2">
          <RecordGroup icon={<Zap size={14} aria-hidden="true" />} label="Biggest win" matches={records.biggestWin} />
          <RecordGroup icon={<Goal size={14} aria-hidden="true" />} label="Highest-scoring match" matches={records.highestScoring} />
          <RecordGroup icon={<Flame size={14} aria-hidden="true" />} label="Most goals by one side" matches={records.mostSide} />
          <RecordGroup icon={<TrendingUp size={14} aria-hidden="true" />} label="Biggest upset (by Elo)" matches={records.upset} />
        </div>
      </div>
      {streakCards.length ? (
        <div>
          <div className="section-head"><span className="section-label">Longest runs</span></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {streakCards.map((s) => (
              <div key={s.name} className="inset px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-text-muted">
                    {s.name}
                    {s.runs.length > 1 ? <span className="text-text-muted/70">×{s.runs.length}</span> : null}
                  </div>
                  <div className="shrink-0 font-mono text-lg font-bold tabular-nums text-accent">{s.length}</div>
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {s.runs.slice(0, 6).map((run, i) => (
                    <div key={(run.player?.id ?? i) + "-" + i} className="min-w-0">
                      {run.player?.id ? (
                        <PlayerLink playerId={run.player.id} name={run.player.display_name} className="inline-block max-w-full">
                          <span className="block truncate text-sm font-medium text-text-normal">{run.player.display_name}</span>
                        </PlayerLink>
                      ) : (
                        <div className="truncate text-sm font-medium text-text-normal">{run.player.display_name}</div>
                      )}
                      <div className="text-xs text-text-muted">{streakDateText(run)}</div>
                    </div>
                  ))}
                  {s.runs.length > 6 ? <div className="text-xs text-text-muted">+{s.runs.length - 6} more</div> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <p className="text-xs text-text-muted">Across {records.total} finished matches.</p>
    </div>
  );
}
