import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { listPlayers } from "../../api/players.api";
import { listClubs } from "../../api/clubs.api";
import { getStatsPlayerMatches } from "../../api/stats.api";
import { listPlayerAvatarMeta, playerAvatarUrl } from "../../api/playerAvatars.api";
import type { Club, Match } from "../../api/types";
import { sideBy } from "../../helpers";
import { StarsFA } from "../../ui/primitives/StarsFA";

type Outcome = "W" | "D" | "L";
type Mode = "overall" | "1v1" | "2v2";

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

function modeLabel(mode: Mode) {
  return mode === "overall" ? "overall" : mode;
}

function AvatarButton({
  playerId,
  name,
  updatedAt,
  selected,
  onClick,
  className = "h-8 w-8",
}: {
  playerId: number;
  name: string;
  updatedAt: string | null;
  selected: boolean;
  onClick: () => void;
  className?: string;
}) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ overflowAnchor: "none" }}
      className={"relative shrink-0 rounded-full transition-colors " + (selected ? "" : "hover:bg-bg-card-chip/20")}
      aria-pressed={selected}
      title={name}
    >
      <span
        className={
          `panel-subtle inline-flex items-center justify-center overflow-hidden rounded-full ${className} ` +
          (selected ? "ring-2 ring-[color:rgb(var(--color-accent)/0.85)]" : "")
        }
      >
        {updatedAt ? (
          <img
            src={playerAvatarUrl(playerId, updatedAt)}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="text-sm font-semibold text-text-muted">{initial}</span>
        )}
      </span>
      <span className="sr-only">{name}</span>
    </button>
  );
}

function ModeSwitch({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const idx = value === "overall" ? 0 : value === "1v1" ? 1 : 2;
  const wCls = "w-16 sm:w-24";
  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label="Filter mode"
      title="Filter: Overall / 1v1 / 2v2"
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
          { k: "overall" as const, label: "Overall", icon: "fa-layer-group" },
          { k: "1v1" as const, label: "1v1", icon: "fa-user" },
          { k: "2v2" as const, label: "2v2", icon: "fa-users" },
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

export default function StarsPerformanceCard() {
  const qc = useQueryClient();
  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => listClubs() });
  const avatarMetaQ = useQuery({
    queryKey: ["players", "avatars"],
    queryFn: listPlayerAvatarMeta,
    staleTime: 30_000,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const players = playersQ.data ?? [];
  const clubs = clubsQ.data ?? [];
  const [playerId, setPlayerId] = useState<number | "">("");
  const [mode, setMode] = useState<Mode>("overall");

  useEffect(() => {
    if (!players.length) return;
    for (const p of players) {
      void qc.prefetchQuery({
        queryKey: ["stats", "starsPerformance", p.id],
        queryFn: () => getStatsPlayerMatches({ playerId: p.id }),
        staleTime: 30_000,
      });
    }
  }, [players, qc]);

  const avatarUpdatedAtById = useMemo(() => {
    const m = new Map<number, string>();
    for (const x of avatarMetaQ.data ?? []) m.set(x.player_id, x.updated_at);
    return m;
  }, [avatarMetaQ.data]);

  const matchesQ = useQuery({
    queryKey: ["stats", "starsPerformance", playerId || "none"],
    queryFn: () => getStatsPlayerMatches({ playerId: Number(playerId) }),
    enabled: playerId !== "",
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const selected = useMemo(() => {
    if (playerId === "") return null;
    return players.find((p) => p.id === playerId) ?? null;
  }, [players, playerId]);

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
      <ErrorToastOnError error={matchesQ.error} title="Stars performance loading failed" />
      <ErrorToastOnError error={clubsQ.error} title="Club data loading failed" />
      <div className="card-inner-flat rounded-2xl space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex h-9 items-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
            <i className="fa-solid fa-filter text-[11px]" aria-hidden="true" />
            <span>Filter</span>
          </div>
          <ModeSwitch value={mode} onChange={setMode} />
        </div>
        <div className="h-px bg-border-card-inner/70" />
        <div className="text-[11px] text-text-muted">Player</div>
        <div className="-mx-1 overflow-x-auto px-1 py-0.5">
          <div className="flex min-w-full items-center justify-between gap-2">
            {sortedPlayers.map((p) => (
              <AvatarButton
                key={p.id}
                playerId={p.id}
                name={p.display_name}
                updatedAt={avatarUpdatedAtById.get(p.id) ?? null}
                selected={playerId === p.id}
                onClick={() => setPlayerId(p.id)}
              />
            ))}
          </div>
        </div>
      </div>

      <div style={{ overflowAnchor: "none" }}>
        {playerId === "" ? (
          <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Pick a player to see PPM by club stars.</div>
        ) : null}
        {matchesQ.isLoading ? <div className="card-inner-flat rounded-2xl text-sm text-text-muted">Loading…</div> : null}

        {selected && rows.length ? (
          <div className="space-y-2">
            {summary ? (
              <div className="card-inner-flat rounded-2xl space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-text-normal">
                    {selected.display_name} · {modeLabel(mode)}
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
            No finished matches with selected clubs found for {selected.display_name} ({modeLabel(mode)}).
          </div>
        ) : null}
      </div>
    </CollapsibleCard>
  );
}
