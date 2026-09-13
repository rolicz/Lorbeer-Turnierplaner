/**
 * Records tab — titles, match superlatives and the longest runs.
 *
 * Built from the same block as every other stats sub-view (`DESIGN.md` §6 "Stats
 * sub-view skeleton"): one `StatsSection` per category — icon, title, one-line
 * explainer, then rows — and every match row is a `ScoreLine` (§8), never a local
 * score rendering.
 */
import { Flame, Goal, Shield, TrendingUp, Trophy, Zap } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import EmptyState from "../../ui/primitives/EmptyState";
import InlineLoading from "../../ui/primitives/InlineLoading";
import PlayerLink from "../../ui/primitives/PlayerLink";
import ScoreLine from "../../ui/primitives/ScoreLine";
import { getStatsPlayerMatches, getStatsPlayers, getStatsStreaks } from "../../api/stats.api";
import { qk } from "../../api/queryKeys";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { teamName } from "../../utils/matchDisplay";
import { fmtShortDate } from "../../utils/format";
import { tournamentMatchHref } from "./MatchHistoryList";
import StatsSection from "./StatsSection";
import type { Row } from "./standings";
import type { StatsMode } from "./statsMode";
import type { StatsScope, StatsMatch, StatsPlayerMatchesTournament, StatsStreakCategory, StatsStreakRun, StatsTournamentLite } from "../../api/types";
import { streakDateText } from "./streakDisplay";

/** How many rows a category shows before the "+N more" line (`DESIGN.md` §6). */
const SHOWN = 6;

function teamNames(m: StatsMatch, side: "A" | "B"): string {
  return teamName(m.sides.find((x) => x.side === side));
}
type RecMatch = {
  id: number; tName: string; date: string;
  a: string; b: string; ag: number; bg: number;
  aIds: number[]; bIds: number[];
  /** Match detail page, or null for a friendly (no detail page). */
  href: string | null;
};

/** Tie count next to a category title ("×4 matches share this record"). */
function TieCount({ n }: { n: number }) {
  if (n <= 1) return null;
  return <span className="text-xs font-normal text-text-muted">×{n}</span>;
}

/** "+N more" — the one way a truncated stats list says it is truncated. */
function MoreLine({ total, shown }: { total: number; shown: number }) {
  if (total <= shown) return null;
  return <div className="text-xs text-text-muted">+{total - shown} more</div>;
}

/** A match superlative: every match tied at the record, each as a `ScoreLine` row. */
function RecordGroup({ icon, label, explainer, matches }: { icon: ReactNode; label: string; explainer: string; matches: RecMatch[] }) {
  const shown = matches.slice(0, SHOWN);
  return (
    <StatsSection label={label} icon={icon} explainer={explainer} action={<TieCount n={matches.length} />}>
      {shown.length ? (
        <div className="list-divided">
          {shown.map((m) => {
            const body = (
              <>
                <ScoreLine size="sm" leftNames={m.a} rightNames={m.b} leftGoals={m.ag} rightGoals={m.bg} />
                <div className="mt-0.5 truncate text-center text-xs text-text-muted">{m.tName} · {fmtShortDate(m.date)}</div>
              </>
            );
            return m.href ? (
              <Link key={m.id} to={m.href} state={{ fromTab: "matches" }} aria-label="Open match" className="row-tap focus-ring block py-2 no-underline">
                {body}
              </Link>
            ) : (
              <div key={m.id} className="py-2">{body}</div>
            );
          })}
        </div>
      ) : <EmptyState title="None yet." className="py-2" />}
      <MoreLine total={matches.length} shown={shown.length} />
    </StatsSection>
  );
}

type WinLeader = { id: number; name: string; count: number; rank: number; latest: StatsTournamentLite | null };

/** Most tournament wins — a ranked identity list, the same row shape as Streaks'. */
function TitlesGroup({ leaders, onSelect }: { leaders: WinLeader[]; onSelect: (id: number) => void }) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const shown = leaders.slice(0, SHOWN);
  // "×N" here means N players share the top count — the same meaning it had before.
  const topTies = leaders.filter((l) => l.rank === 1).length;
  return (
    <StatsSection
      label="Most tournament wins"
      icon={<Trophy size={12} aria-hidden="true" />}
      explainer="Tournaments won, with each player's most recent title."
      action={<TieCount n={topTies} />}
    >
      {shown.length ? (
        <div className="list-divided">
          {shown.map((l) => (
            /* The row opens this player in Stats (stretched button), the name their profile. */
            <div key={l.id} className="relative flex items-center gap-2 py-2">
              <button
                type="button"
                onClick={() => onSelect(l.id)}
                aria-label={`Open ${l.name} in Stats`}
                className="absolute inset-0 z-0 rounded-xl focus-ring"
              />
              <span className="relative z-10 w-4 shrink-0 text-center text-xs font-bold tabular-nums text-text-muted">{l.rank}</span>
              <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-2">
                {/* The link hugs the identity; the rest of the row opens the player in Stats. */}
                <PlayerLink playerId={l.id} name={l.name} className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2">
                  <AvatarCircle playerId={l.id} name={l.name} updatedAt={avatarUpdatedAtById.get(l.id) ?? null} sizeClass="h-6 w-6" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text-normal">{l.name}</span>
                    {l.latest ? (
                      <span className="block truncate text-xs text-text-muted">{l.latest.name} · {fmtShortDate(l.latest.date)}</span>
                    ) : null}
                  </span>
                </PlayerLink>
              </div>
              <span className="relative z-10 text-sm font-bold tabular-nums text-accent">{l.count}</span>
            </div>
          ))}
        </div>
      ) : <EmptyState title="None yet." className="py-2" />}
      <MoreLine total={leaders.length} shown={shown.length} />
    </StatsSection>
  );
}

/** The record length of one streak category and every player tied at it. */
function LongestRunGroup({ icon, label, explainer, length, runs }: { icon: ReactNode; label: string; explainer: string; length: number; runs: StatsStreakRun[] }) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const shown = runs.slice(0, SHOWN);
  return (
    <StatsSection label={label} icon={icon} explainer={explainer} action={<TieCount n={runs.length} />}>
      <div className="list-divided">
        {shown.map((run, i) => {
          const pid = run.player?.id ?? 0;
          const identity = (
            <>
              <AvatarCircle playerId={pid} name={run.player.display_name} updatedAt={avatarUpdatedAtById.get(pid) ?? null} sizeClass="h-6 w-6" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-normal">{run.player.display_name}</span>
                {streakDateText(run) ? <span className="block text-xs tabular-nums text-text-muted">{streakDateText(run)}</span> : null}
              </span>
            </>
          );
          return (
            <div key={`${pid}-${i}`} className="flex items-center gap-2 py-2">
              <span className="w-4 text-center text-xs font-bold tabular-nums text-text-muted">{i + 1}</span>
              {pid ? (
                <PlayerLink playerId={pid} name={run.player.display_name} className="flex min-w-0 flex-1 items-center gap-2">{identity}</PlayerLink>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2">{identity}</div>
              )}
              {run.ongoing ? <span className="shrink-0 rounded-full bg-status-bg-green/60 px-1.5 text-xs text-status-text-green">live</span> : null}
              <span className="text-sm font-bold tabular-nums text-accent">{length}</span>
            </div>
          );
        })}
      </div>
      <MoreLine total={runs.length} shown={shown.length} />
    </StatsSection>
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
            id: m.id, tName: t.name, date: t.date,
            a: teamNames(m, "A"), b: teamNames(m, "B"),
            ag: Number(A?.goals ?? 0), bg: Number(B?.goals ?? 0),
            aIds: (A?.players ?? []).map((p) => p.id), bIds: (B?.players ?? []).map((p) => p.id),
            // The shared match link: a friendly has no detail page, so the row stays inert.
            href: tournamentMatchHref(t, m),
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
        return { key: c.key, name: c.name, description: c.description, length: maxLen, runs };
      })
      .filter((c) => c.length > 0);
  }, [streaksQ.data]);

  if (loading) return <InlineLoading label="Loading…" />;
  if (!records) return <EmptyState title="No finished matches yet." className="py-6" />;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {winLeaders.length ? <TitlesGroup leaders={winLeaders} onSelect={onSelect} /> : null}
        <RecordGroup
          icon={<Zap size={12} aria-hidden="true" />}
          label="Biggest win"
          explainer="Largest goal difference in a finished match."
          matches={records.biggestWin}
        />
        <RecordGroup
          icon={<Goal size={12} aria-hidden="true" />}
          label="Highest-scoring match"
          explainer="Most goals in one match, both sides together."
          matches={records.highestScoring}
        />
        <RecordGroup
          icon={<Flame size={12} aria-hidden="true" />}
          label="Most goals by one side"
          explainer="The biggest single-side tally in a match."
          matches={records.mostSide}
        />
        <RecordGroup
          icon={<TrendingUp size={12} aria-hidden="true" />}
          label="Biggest upset (by Elo)"
          explainer="Win against the largest Elo gap between the two sides."
          matches={records.upset}
        />
        {streakCards.map((s) => (
          <LongestRunGroup
            key={s.key}
            icon={s.key === "unbeaten_streak" ? <Shield size={12} aria-hidden="true" /> : <Flame size={12} aria-hidden="true" />}
            label={`Longest ${s.name.toLowerCase()}`}
            explainer={s.description}
            length={s.length}
            runs={s.runs}
          />
        ))}
      </div>
      <p className="text-xs text-text-muted">Across {records.total} finished matches.</p>
    </div>
  );
}
