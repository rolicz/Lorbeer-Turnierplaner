import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { listPlayers } from "../../api/players.api";
import { listClubs } from "../../api/clubs.api";
import { getStatsPlayerMatches } from "../../api/stats.api";
import type { Club, Match, StatsScope } from "../../api/types";
import { sideBy } from "../../helpers";
import { StarsFA } from "../../ui/primitives/StarsFA";
import { StatsAvatarSelector, StatsFilterDataControls, type StatsMode } from "./StatsControls";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { useAuth } from "../../auth/AuthContext";

type Outcome = "W" | "D" | "L";

function winnerSide(m: Match): "A" | "B" | null {
  if (m.state !== "finished") return null;
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const ag = a?.goals ?? 0;
  const bg = b?.goals ?? 0;
  if (ag === bg) return null;
  return ag > bg ? "A" : "B";
}

function outcomeForPlayer(m: Match, playerId: number): { outcome: Outcome; points: number; side: "A" | "B" } | null {
  if (m.state !== "finished") return null;
  const a = sideBy(m, "A");
  const b = sideBy(m, "B");
  const aHas = (a?.players ?? []).some((p) => p.id === playerId);
  const bHas = (b?.players ?? []).some((p) => p.id === playerId);
  const focusSide: "A" | "B" | null = aHas && !bHas ? "A" : bHas && !aHas ? "B" : null;
  if (!focusSide) return null;

  const w = winnerSide(m);
  if (!w) return { outcome: "D", points: 1, side: focusSide };
  if (w === focusSide) return { outcome: "W", points: 3, side: focusSide };
  return { outcome: "L", points: 0, side: focusSide };
}

function modeLabel(mode: StatsMode) {
  return mode === "overall" ? "overall" : mode;
}

function scopeLabel(scope: StatsScope) {
  if (scope === "tournaments") return "tournaments";
  if (scope === "both") return "all";
  return "friendlies";
}

type StarBucket = {
  stars: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pts: number;
  ppm: number;
};

const STAR_LEVELS: number[] = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];

function computeBuckets(matches: Match[], playerId: number, clubs: Club[]): StarBucket[] {
  const starByClubId = new Map<number, number>();
  for (const c of clubs) {
    if (Number.isFinite(c.star_rating)) starByClubId.set(c.id, c.star_rating);
  }

  const byStars = new Map<number, { played: number; wins: number; draws: number; losses: number; pts: number }>();
  for (const s of STAR_LEVELS) byStars.set(s, { played: 0, wins: 0, draws: 0, losses: 0, pts: 0 });

  for (const m of matches) {
    const r = outcomeForPlayer(m, playerId);
    if (!r) continue;
    const side = sideBy(m, r.side);
    const clubId = side?.club_id ?? null;
    if (!clubId) continue;
    const stars = starByClubId.get(clubId);
    if (stars == null) continue;
    const normalizedStars = Math.round(stars * 2) / 2;
    if (!STAR_LEVELS.includes(normalizedStars)) continue;

    const cur = byStars.get(normalizedStars) ?? { played: 0, wins: 0, draws: 0, losses: 0, pts: 0 };
    cur.played += 1;
    cur.pts += r.points;
    if (r.outcome === "W") cur.wins += 1;
    else if (r.outcome === "D") cur.draws += 1;
    else cur.losses += 1;
    byStars.set(normalizedStars, cur);
  }

  return STAR_LEVELS.map((stars) => {
    const v = byStars.get(stars) ?? { played: 0, wins: 0, draws: 0, losses: 0, pts: 0 };
    return {
      stars,
      played: v.played,
      wins: v.wins,
      draws: v.draws,
      losses: v.losses,
      pts: v.pts,
      ppm: v.played > 0 ? v.pts / v.played : 0,
    };
  });
}

function computeOverallFromAllFinished(matches: Match[], playerId: number): {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pts: number;
  ppm: number;
} {
  let played = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let pts = 0;

  for (const m of matches) {
    const r = outcomeForPlayer(m, playerId);
    if (!r) continue;
    played += 1;
    pts += r.points;
    if (r.outcome === "W") wins += 1;
    else if (r.outcome === "D") draws += 1;
    else losses += 1;
  }

  return {
    played,
    wins,
    draws,
    losses,
    pts,
    ppm: played > 0 ? pts / played : 0,
  };
}

function StarRow({ r }: { r: StarBucket }) {
  const fill = Math.max(0, Math.min(1, r.ppm / 3));
  const fillPct = fill * 100;
  const fillOpacity = 0.30;
  return (
    <div className="panel-subtle relative overflow-hidden rounded-xl border border-border-card-inner/40">
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${fillPct}%`,
          backgroundColor: `rgb(var(--color-accent) / ${fillOpacity.toFixed(3)})`,
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5">
        <div className="inline-flex min-w-0 items-center">
          <StarsFA rating={r.stars} textClassName="text-text-normal" className="text-[11px]" />
        </div>

        <div className="min-w-0 text-center font-mono text-[11px] tabular-nums text-text-muted">
          <span>{r.played}P</span>
          <span className="px-2 text-text-muted/80">·</span>
          <span className="text-text-normal">{r.wins}</span>
          <span className="px-1 text-text-muted">-</span>
          <span className="text-text-normal">{r.draws}</span>
          <span className="px-1 text-text-muted">-</span>
          <span className="text-text-normal">{r.losses}</span>
        </div>

        <div className="shrink-0 text-right">
          <div className="font-mono text-[15px] font-semibold tabular-nums text-text-normal">{r.ppm.toFixed(2)}</div>
          <div className="text-[10px] leading-none text-text-muted">ppm</div>
        </div>
      </div>
    </div>
  );
}

export default function StarsPerformanceCard({ embedded = false }: { embedded?: boolean } = {}) {
  const { playerId: loggedInPlayerId } = useAuth();
  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => listClubs() });
  const { avatarUpdatedAtById } = usePlayerAvatarMap();

  const players = useMemo(() => playersQ.data ?? [], [playersQ.data]);
  const clubs = useMemo(() => clubsQ.data ?? [], [clubsQ.data]);
  const [playerId, setPlayerId] = useState<number | "">("");
  const [mode, setMode] = useState<StatsMode>("overall");
  const [scope, setScope] = useState<StatsScope>("tournaments");

  const defaultSelectedPlayerId = useMemo<number | "">(() => {
    if (!loggedInPlayerId) return "";
    if (players.length && !players.some((p) => p.id === loggedInPlayerId)) return "";
    return loggedInPlayerId;
  }, [loggedInPlayerId, players]);
  const selectedPlayerId: number | "" = playerId === "" ? defaultSelectedPlayerId : playerId;

  const matchesQ = useQuery({
    queryKey: ["stats", "starsPerformance", selectedPlayerId || "none", scope],
    queryFn: () => getStatsPlayerMatches({ playerId: Number(selectedPlayerId), scope }),
    enabled: selectedPlayerId !== "",
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const selected = useMemo(() => {
    if (selectedPlayerId === "") return null;
    return players.find((p) => p.id === selectedPlayerId) ?? null;
  }, [players, selectedPlayerId]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [players]);

  const flatMatches = useMemo(() => {
    const tournaments = matchesQ.data?.tournaments ?? [];
    if (mode === "overall") return tournaments.flatMap((t) => t.matches);
    return tournaments.filter((t) => t.mode === mode).flatMap((t) => t.matches);
  }, [matchesQ.data?.tournaments, mode]);

  const rows = useMemo(() => {
    if (!selected) return [];
    return computeBuckets(flatMatches, selected.id, clubs);
  }, [selected, flatMatches, clubs]);

  const summary = useMemo(() => {
    if (!selected) return null;
    return computeOverallFromAllFinished(flatMatches, selected.id);
  }, [flatMatches, selected]);

  const knownClubMatches = useMemo(() => rows.reduce((s, r) => s + r.played, 0), [rows]);

  const content = (
    <>
      <ErrorToastOnError error={matchesQ.error} title="Stars performance loading failed" />
      <ErrorToastOnError error={clubsQ.error} title="Club data loading failed" />
      <div className="card-inner-flat rounded-2xl space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatsFilterDataControls mode={mode} onModeChange={setMode} scope={scope} onScopeChange={setScope} />
        </div>
        <div className="h-px bg-border-card-inner/70" />
        <div className="text-[11px] text-text-muted">Player</div>
        <StatsAvatarSelector
          players={sortedPlayers}
          selectedId={selectedPlayerId}
          onSelect={setPlayerId}
          avatarUpdatedAtById={avatarUpdatedAtById}
        />
      </div>

      <div style={{ overflowAnchor: "none" }}>
        {selectedPlayerId === "" ? (
          <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Pick a player to see PPM by club stars.</div>
        ) : null}
        {matchesQ.isLoading ? <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Loading…</div> : null}

        {selected && rows.length ? (
          <div className="space-y-2">
            {summary ? (
              <div className="card-inner-flat rounded-2xl space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-text-normal">
                    {selected.display_name} · {modeLabel(mode)} · {scopeLabel(scope)}
                  </div>
                  <div className="font-mono text-sm tabular-nums text-text-normal">
                    {summary.ppm.toFixed(2)} ppm · {summary.played} m
                  </div>
                </div>
                <div className="text-[11px] text-text-muted">
                  Club stars available in {knownClubMatches}/{summary.played} finished matches
                </div>
              </div>
            ) : null}
            {rows.map((r) => (
              <StarRow key={r.stars} r={r} />
            ))}
          </div>
        ) : null}

        {selected && !matchesQ.isLoading && !rows.some((r) => r.played > 0) ? (
          <div className="card-inner-flat rounded-2xl text-sm text-text-muted">
            No finished matches with selected clubs found for {selected.display_name} ({modeLabel(mode)} · {scopeLabel(scope)}).
          </div>
        ) : null}
      </div>
    </>
  );

  if (embedded) return <div className="space-y-3">{content}</div>;

  return (
    <CollapsibleCard
      title={
        <span className="inline-flex items-center gap-2">
          <i className="fa-solid fa-chart-bar text-text-muted" aria-hidden="true" />
          Club Stars Performance
        </span>
      }
      defaultOpen={false}
      scrollOnOpen={true}
      variant="outer"
      bodyVariant="none"
      bodyClassName="space-y-3"
      className="lg:col-start-2"
    >
      {content}
    </CollapsibleCard>
  );
}
