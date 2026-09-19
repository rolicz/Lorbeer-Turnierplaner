/**
 * Records tab — titles and match superlatives.
 *
 * Built from the same block as every other stats sub-view (`DESIGN.md` §6 "Stats
 * sub-view skeleton"): one `StatsSection` per category — icon, title, one-line
 * explainer, then rows — and every match row is a `ScoreLine` (§8), never a local
 * score rendering.
 *
 * **One computation, read here and nowhere else recomputed** (M1/M4): every
 * superlative — titles, biggest win, highest-scoring match, most goals by one
 * side, the Elo upset — is computed once on the backend (`/stats/records`) and
 * this page only renders the answer. It used to fetch `/stats/player-matches`
 * once per player and fold the same rules in the browser; the profile's badge
 * band reads the identical cache entry, so a badge can never claim a record
 * this page does not show.
 *
 * **Longest runs live in Streaks** (T6): every streak record — win, unbeaten,
 * scoring, clean sheet — is owned by the Streaks sub-view, which shows all four
 * categories with their current runs. Records used to repeat two of them; it now
 * only points there.
 */
import { Flame } from "lucide-react";
import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import Button from "../../ui/primitives/Button";
import ClubMark from "../../ui/primitives/ClubMark";
import EmptyState from "../../ui/primitives/EmptyState";
import InlineLoading from "../../ui/primitives/InlineLoading";
import PlayerLink from "../../ui/primitives/PlayerLink";
import ScoreLine from "../../ui/primitives/ScoreLine";
import { listClubs } from "../../api/clubs.api";
import { getStatsRecords } from "../../api/stats.api";
import { qk } from "../../api/queryKeys";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { useCupHolders } from "../../hooks/useCupHolders";
import { fmtCount, fmtShortDate } from "../../utils/format";
import { recordIcon } from "./recordIcons";
import { RECORD_PARAM, recordSectionId } from "./statsNav";
import { useOneShotSectionParam } from "./useOneShotSectionParam";
import { tournamentMatchHref } from "./MatchHistoryList";
import StatsSection from "./StatsSection";
import type { StatsMode } from "./statsMode";
import type { Club, StatsMatch, StatsRecord, StatsRecordLeader, StatsScope } from "../../api/types";

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
  /** The clubs that played it — a record row shows a score and nothing else (Q17). */
  aClubId: number | null; bClubId: number | null;
  /** Match detail page, or null for a friendly (no detail page). */
  href: string | null;
};

/** A record's `matches[]` payload, rendered exactly as `/stats/player-matches` renders a row. */
function toRecMatches(rows: StatsRecord["matches"]): RecMatch[] {
  return (rows ?? []).map(({ tournament: t, match: m }) => {
    const A = m.sides.find((s) => s.side === "A");
    const B = m.sides.find((s) => s.side === "B");
    return {
      id: m.id, tName: t.name, date: t.date,
      a: teamNames(m, "A"), b: teamNames(m, "B"),
      ag: Number(A?.goals ?? 0), bg: Number(B?.goals ?? 0),
      aClubId: A?.club_id ?? null, bClubId: B?.club_id ?? null,
      // The shared match link: a friendly has no detail page, so the row stays inert.
      href: tournamentMatchHref(t, m),
    };
  });
}

/** Tie count next to a category title ("4 tied" = four matches/players share this record). */
function TieCount({ n }: { n: number }) {
  if (n <= 1) return null;
  return <span className="text-xs font-normal text-text-muted">{n} tied</span>;
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
      ) : <EmptyState title="No matches yet." className="py-2" />}
      <MoreLine total={matches.length} shown={shown.length} />
    </StatsSection>
  );
}

type WinLeader = { id: number; name: string; count: number; rank: number; latest: { name: string; date: string } | null };

function toWinLeaders(leaders: StatsRecordLeader[]): WinLeader[] {
  return leaders.map((l) => ({ id: l.player.id, name: l.player.display_name, count: l.count, rank: l.rank, latest: l.latest ?? null }));
}

/** Most tournament wins — a ranked identity list, the same row shape as Streaks'. */
function TitlesGroup({ icon, leaders, holderCount, onSelect }: { icon: ReactNode; leaders: WinLeader[]; holderCount: number; onSelect: (id: number) => void }) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const { cupsHeldByPlayerId } = useCupHolders();
  const shown = leaders.slice(0, SHOWN);
  return (
    <StatsSection
      label="Most tournament wins"
      icon={icon}
      explainer="Tournaments won, with each player's most recent title."
      action={<TieCount n={holderCount} />}
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
      ) : <EmptyState title="No titles yet." className="py-2" />}
      <MoreLine total={leaders.length} shown={shown.length} />
    </StatsSection>
  );
}

export default function RecordsView({
  mode, scope, onSelect, onOpenStreaks,
}: {
  mode: StatsMode; scope: StatsScope;
  onSelect: (id: number) => void;
  /** Opens the Streaks sub-view — the single home of every longest run (T6). */
  onOpenStreaks: () => void;
}) {
  const q = useQuery({
    queryKey: qk.stats.records(mode, scope),
    queryFn: () => getStatsRecords({ mode, scope }),
    placeholderData: keepPreviousData,
  });
  // The only request this sub-view makes beyond `/stats/records` (Q17), and it is
  // on the `qk.clubs()` key four other stats views already use — so it is a cache
  // hit for anyone arriving from one of them, and one shared request otherwise.
  // The club *ids* are already in the match payload; this resolves them to a crest.
  const clubsQ = useQuery({ queryKey: qk.clubs(), queryFn: () => listClubs(), staleTime: 60_000 });

  const data = q.data;
  const records = data?.records ?? [];
  const titles = records.find((r) => r.key === "most_titles");
  const matchGroups = records.filter((r) => r.group === "match");

  // `?record=<key>` — a badge tap, or a record's own deep-link path, lands here,
  // scrolls to that record's section and drops the param (`useOneShotSectionParam`,
  // the shared `?cup=` mechanism, M4).
  useOneShotSectionParam(RECORD_PARAM, recordSectionId, records.map((r) => r.key), !!data);

  if (q.isLoading && !data) return <InlineLoading label="Loading…" />;
  if (!data || data.finished_matches === 0) return <EmptyState title="No finished matches yet." className="py-6" />;

  const clubs = clubsQ.data ?? [];
  const showTitles = !!titles && (titles.leaders?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {showTitles && titles ? (() => {
          const TitlesIcon = recordIcon("most_titles");
          return (
            <div id={recordSectionId(titles.key)}>
              <TitlesGroup
                icon={<TitlesIcon size={12} aria-hidden="true" />}
                leaders={toWinLeaders(titles.leaders ?? [])}
                holderCount={titles.holders.length}
                onSelect={onSelect}
              />
            </div>
          );
        })() : null}
        {matchGroups.map((r) => {
          const Icon = recordIcon(r.key);
          return (
            <div key={r.key} id={recordSectionId(r.key)}>
              <RecordGroup
                icon={<Icon size={12} aria-hidden="true" />}
                label={r.label}
                explainer={r.explainer}
                matches={toRecMatches(r.matches)}
                clubs={clubs}
              />
            </div>
          );
        })}
      </div>
      {/* Streak records are not repeated here — Streaks owns every run (T6). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-muted">Across {fmtCount(data.finished_matches, "finished match", "finished matches")}.</p>
        <Button variant="ghost" size="sm" onClick={onOpenStreaks} className="gap-1.5" title="Open the Streaks sub-view">
          <Flame size={14} aria-hidden="true" />
          Longest runs in Streaks
        </Button>
      </div>
    </div>
  );
}
