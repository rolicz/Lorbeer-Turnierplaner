/**
 * Records tab — titles and match superlatives.
 *
 * Built from the same block as every other stats sub-view (`DESIGN.md` §6 "Stats
 * sub-view skeleton"): one `StatsSection` per category — icon, title, one-line
 * explainer, then rows — and every match row is a `ScoreLine` (§8), never a local
 * score rendering.
 *
 * **Longest runs live in Streaks** (T6): every streak record — win, unbeaten,
 * scoring, clean sheet — is owned by the Streaks sub-view, which shows all four
 * categories with their current runs. Records used to repeat two of them; it now
 * only points there.
 */
import { Flame, Goal, TrendingUp, Trophy, Zap } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import Button from "../../ui/primitives/Button";
import ClubMark from "../../ui/primitives/ClubMark";
import EmptyState from "../../ui/primitives/EmptyState";
import InlineLoading from "../../ui/primitives/InlineLoading";
import PlayerLink from "../../ui/primitives/PlayerLink";
import ScoreLine from "../../ui/primitives/ScoreLine";
import { listClubs } from "../../api/clubs.api";
import { getStatsPlayerMatches, getStatsPlayers } from "../../api/stats.api";
import { qk } from "../../api/queryKeys";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { useCupHolders } from "../../hooks/useCupHolders";
import { fmtShortDate } from "../../utils/format";
import { tournamentMatchHref } from "./MatchHistoryList";
import StatsSection from "./StatsSection";
import type { Row } from "./standings";
import type { StatsMode } from "./statsMode";
import type { Club, StatsScope, StatsMatch, StatsPlayerMatchesTournament, StatsTournamentLite } from "../../api/types";

/** How many rows a category shows before the "+N more" line (`DESIGN.md` §6). */
const SHOWN = 6;

/** The side's names, one per line — a record row is a `ScoreLine`, and 2v2 stacks (§8). */
function teamNames(m: StatsMatch, side: "A" | "B"): string[] {
  const names = (m.sides.find((x) => x.side === side)?.players ?? []).map((p) => p.display_name).filter(Boolean);
  return names.length ? names : ["—"];
}
type RecMatch = {
  id: number; tName: string; date: string;
  a: string[]; b: string[]; ag: number; bg: number;
  aIds: number[]; bIds: number[];
  /** The clubs that played it — a record row shows a score and nothing else (Q17). */
  aClubId: number | null; bClubId: number | null;
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
function RecordGroup({ icon, label, explainer, matches, clubs }: { icon: ReactNode; label: string; explainer: string; matches: RecMatch[]; clubs: Club[] }) {
  const shown = matches.slice(0, SHOWN);
  return (
    <StatsSection label={label} icon={icon} explainer={explainer} action={<TieCount n={matches.length} />}>
      {shown.length ? (
        <div className="list-divided">
          {shown.map((m) => {
            const body = (
              <>
                <ScoreLine
                  size="sm"
                  leftNames={m.a}
                  rightNames={m.b}
                  leftGoals={m.ag}
                  rightGoals={m.bg}
                  // A record row is a score and nothing else, so the clubs are the
                  // side marks — the same answer the compact match lists give (Q17).
                  leftMark={<ClubMark clubs={clubs} clubId={m.aClubId} side="left" />}
                  rightMark={<ClubMark clubs={clubs} clubId={m.bClubId} side="right" />}
                />
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
  const { cupsHeldByPlayerId } = useCupHolders();
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
                  <AvatarCircle playerId={l.id} name={l.name} updatedAt={avatarUpdatedAtById.get(l.id) ?? null} sizeClass="h-6 w-6" cups={cupsHeldByPlayerId.get(l.id)} />
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

export default function RecordsView({
  mode, scope, rows, onSelect, onOpenStreaks,
}: {
  mode: StatsMode; scope: StatsScope; rows: Row[];
  onSelect: (id: number) => void;
  /** Opens the Streaks sub-view — the single home of every longest run (T6). */
  onOpenStreaks: () => void;
}) {
  const eloById = useMemo(() => new Map(rows.map((r) => [r.id, r.rating])), [rows]);
  const matchesQs = useQueries({
    queries: rows.map((r) => ({
      queryKey: qk.stats.playerMatches(r.id, scope),
      queryFn: () => getStatsPlayerMatches({ playerId: r.id, scope }),
      enabled: rows.length > 0,
      placeholderData: keepPreviousData, staleTime: 30_000,
    })),
  });
  // Titles: wins per player, from the same tournament-winner data PositionsView uses.
  // Scoped like every other record here (A4) — with Source = Friendlies the endpoint
  // reports no tournaments, so there are no titles to show, which is the truth.
  // The only new request this sub-view makes (Q17), and it is on the `qk.clubs()` key
  // four other stats views already use — so it is a cache hit for anyone arriving from
  // one of them, and one shared request otherwise. The club *ids* are already in the
  // match payload; this resolves them to a crest.
  const clubsQ = useQuery({ queryKey: qk.clubs(), queryFn: () => listClubs(), staleTime: 60_000 });
  const playersQ = useQuery({
    queryKey: qk.stats.players(mode, "records", scope),
    queryFn: () => getStatsPlayers({ mode, scope }),
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
            aClubId: A?.club_id ?? null, bClubId: B?.club_id ?? null,
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
          clubs={clubsQ.data ?? []}
        />
        <RecordGroup
          icon={<Goal size={12} aria-hidden="true" />}
          label="Highest-scoring match"
          explainer="Most goals in one match, both sides together."
          matches={records.highestScoring}
          clubs={clubsQ.data ?? []}
        />
        <RecordGroup
          icon={<Flame size={12} aria-hidden="true" />}
          label="Most goals by one side"
          explainer="The biggest single-side tally in a match."
          matches={records.mostSide}
          clubs={clubsQ.data ?? []}
        />
        <RecordGroup
          icon={<TrendingUp size={12} aria-hidden="true" />}
          label="Biggest upset (by Elo)"
          explainer="Win against the largest Elo gap between the two sides."
          matches={records.upset}
          clubs={clubsQ.data ?? []}
        />
      </div>
      {/* Streak records are not repeated here — Streaks owns every run (T6). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-muted">Across {records.total} finished matches.</p>
        <Button variant="ghost" size="sm" onClick={onOpenStreaks} className="gap-1.5" title="Open the Streaks sub-view">
          <Flame size={14} aria-hidden="true" />
          Longest runs in Streaks
        </Button>
      </div>
    </div>
  );
}
