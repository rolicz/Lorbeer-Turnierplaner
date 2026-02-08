import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { Match, Player } from "../../api/types";
import { sideBy } from "../../helpers";
import Card from "../../ui/primitives/Card";
import { listPlayerAvatarMeta, playerAvatarUrl } from "../../api/playerAvatars.api";
import { getCup, listCupDefs } from "../../api/cup.api";
import { cupColorVarForKey } from "../../cupColors";

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

function PlayerAvatar({
  playerId,
  name,
  updatedAt,
  className = "h-9 w-9",
}: {
  playerId: number;
  name: string;
  updatedAt: string | null;
  className?: string;
}) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <span
      className={`panel-subtle inline-flex items-center justify-center overflow-hidden rounded-full shrink-0 ${className}`}
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
  );
}

function CupMark({ cupKey, cupName }: { cupKey: string; cupName: string }) {
  const varName = cupColorVarForKey(cupKey);
  return (
    <span
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border shadow-sm shrink-0"
      style={{
        borderColor: `rgb(var(${varName}) / 0.50)`,
        backgroundColor: `rgb(var(${varName}) / 0.14)`,
        color: `rgb(var(${varName}))`,
      }}
      title={`${cupName} owner (before tournament)`}
    >
      <i className="fa-solid fa-crown text-[11px]" aria-hidden="true" />
    </span>
  );
}

function MobileRow({
  r,
  rank,
  delta,
  isLeader,
  avatarUpdatedAt,
  cupMarks,
}: {
  r: Row;
  rank: number;
  delta: number | null;
  isLeader: boolean;
  avatarUpdatedAt: string | null;
  cupMarks: { key: string; name: string }[];
}) {
  return (
    <div className="panel-subtle relative overflow-hidden px-3 py-2">
      {/* leader bar */}
      {isLeader && <div className="absolute inset-y-0 left-0 w-1 bg-status-bar-green" />}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-6 text-text-muted tabular-nums">{rank}</div>
            <div className="w-5">
              <Arrow delta={delta} />
            </div>
            <PlayerAvatar playerId={r.playerId} name={r.name} updatedAt={avatarUpdatedAt} />
            <div className="min-w-0 flex items-center gap-2">
              <div className="min-w-0 truncate font-medium text-text-normal">{r.name}</div>
              {cupMarks.length ? (
                <div className="inline-flex items-center gap-1">
                  {cupMarks.slice(0, 2).map((c) => (
                    <CupMark key={c.key} cupKey={c.key} cupName={c.name} />
                  ))}
                  {cupMarks.length > 2 ? (
                    <span className="text-[11px] text-text-muted">+{cupMarks.length - 2}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-1 text-xs text-text-muted font-mono tabular-nums">
            {r.played}P · {r.wins}-{r.draws}-{r.losses} · GD {r.gd} (+{r.gf}/-{r.ga})
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="font-semibold font-mono tabular-nums">{r.pts}</div>
          <div className="text-[11px] text-text-muted">pts</div>
        </div>
      </div>
    </div>
  );
}

export default function StandingsTable({
  tournamentId,
  tournamentDate,
  matches,
  players,
  tournamentStatus,
  wrap = true,
}: {
  tournamentId: number;
  tournamentDate?: string | null;
  matches: Match[];
  players: Player[];
  tournamentStatus?: "draft" | "live" | "done";
  /** If false, renders borderless (for embedding inside another Card/Collapsible). */
  wrap?: boolean;
}) {
  const baseRows = useMemo(() => computeStandings(matches, players, "finished"), [matches, players]);
  const liveRows = useMemo(() => computeStandings(matches, players, "live"), [matches, players]);
  const basePos = useMemo(() => posMap(baseRows), [baseRows]);

  const avatarMetaQ = useQuery({ queryKey: ["players", "avatars"], queryFn: listPlayerAvatarMeta });
  const avatarUpdatedAtByPlayerId = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of avatarMetaQ.data ?? []) m.set(r.player_id, r.updated_at);
    return m;
  }, [avatarMetaQ.data]);

  const cupDefsQ = useQuery({ queryKey: ["cup", "defs"], queryFn: listCupDefs });
  const cupsRaw = cupDefsQ.data?.cups?.length ? cupDefsQ.data.cups : [{ key: "default", name: "Cup", since_date: null }];
  const cups = useMemo(() => {
    // Keep config order, but put the default cup last (consistent with dashboard/players).
    const nonDefault = cupsRaw.filter((c) => c.key !== "default");
    const defaults = cupsRaw.filter((c) => c.key === "default");
    return [...nonDefault, ...defaults];
  }, [cupsRaw]);

  const cupsQ = useQueries({
    queries: cups.map((c) => ({
      queryKey: ["cup", c.key],
      queryFn: () => getCup(c.key),
    })),
  });

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
    <>
      {/* Mobile */}
      <div className="sm:hidden space-y-2">
        {liveRows.map((r, idx) => {
          const baseIdx = basePos.get(r.playerId);
          const delta = baseIdx === undefined ? null : baseIdx - idx;
          const avatarUpdatedAt = avatarUpdatedAtByPlayerId.get(r.playerId) ?? null;
          const cupMarks = cupMarksByPlayerId.get(r.playerId) ?? [];
          return (
            <MobileRow
              key={r.playerId}
              r={r}
              rank={idx + 1}
              delta={delta}
              isLeader={idx === 0}
              avatarUpdatedAt={avatarUpdatedAt}
              cupMarks={cupMarks}
            />
          );
        })}
      </div>

      {/* Desktop */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full table-auto text-sm">
          <thead className="text-text-muted">
            <tr className="border-b border-border-card-inner">
              <th className="py-2 pr-1.5 text-left font-medium w-10">#</th>
              <th className="py-2 px-1.5 text-left font-medium w-8"></th>
              <th className="py-2 pr-1.5 text-left font-medium">Player</th>
              <th className="py-2 px-1.5 text-right font-medium">P</th>
              <th className="py-2 px-1.5 text-right font-medium">W</th>
              <th className="py-2 px-1.5 text-right font-medium">D</th>
              <th className="py-2 px-1.5 text-right font-medium">L</th>
              <th className="py-2 px-1.5 text-right font-medium">+</th>
              <th className="py-2 px-1.5 text-right font-medium">-</th>
              <th className="py-2 px-1.5 text-right font-medium">GD</th>
              <th className="py-2 pl-1.5 text-right font-semibold">Pts</th>
            </tr>
          </thead>

          <tbody className="font-mono tabular-nums">
            {liveRows.map((r, idx) => {
              const baseIdx = basePos.get(r.playerId);
              const delta = baseIdx === undefined ? null : baseIdx - idx;
              const isLeader = idx === 0;

              return (
                <tr
                  key={r.playerId}
                  className={[
                    "relative",
                    "border-b border-border-card-inner",
                  ].join(" ")}
                >
                  {/* leader bar */}
                  {isLeader && (
                    <td className="relative py-2 pr-1.5 text-text-muted">
                      <div className="absolute left-0 top-0 h-full w-1 bg-status-bar-green" />
                      <div className="pl-1.5">{idx + 1}</div>
                    </td>
                  )}
                  {!isLeader && <td className="py-2 pr-1.5 text-text-muted">{idx + 1}</td>}

                  <td className="py-2 px-1.5">
                    <Arrow delta={delta} />
                  </td>
                  <td className="py-2 pr-1.5 font-sans font-medium min-w-0">
                    <div className="inline-flex min-w-0 max-w-[280px] items-center gap-2 lg:max-w-[420px]">
                      <PlayerAvatar
                        playerId={r.playerId}
                        name={r.name}
                        updatedAt={avatarUpdatedAtByPlayerId.get(r.playerId) ?? null}
                        className="h-7 w-7"
                      />
                      <span className="min-w-0 truncate">{r.name}</span>
                      {(cupMarksByPlayerId.get(r.playerId) ?? []).length ? (
                        <span className="inline-flex items-center gap-1">
                          {(cupMarksByPlayerId.get(r.playerId) ?? []).slice(0, 2).map((c) => (
                            <CupMark key={c.key} cupKey={c.key} cupName={c.name} />
                          ))}
                          {(cupMarksByPlayerId.get(r.playerId) ?? []).length > 2 ? (
                            <span className="text-[11px] text-text-muted">+{(cupMarksByPlayerId.get(r.playerId) ?? []).length - 2}</span>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-2 px-1.5 text-right">{r.played}</td>
                  <td className="py-2 px-1.5 text-right">{r.wins}</td>
                  <td className="py-2 px-1.5 text-right">{r.draws}</td>
                  <td className="py-2 px-1.5 text-right">{r.losses}</td>
                  <td className="py-2 px-1.5 text-right">{r.gf}</td>
                  <td className="py-2 px-1.5 text-right">{r.ga}</td>
                  <td className="py-2 px-1.5 text-right">{r.gd}</td>
                  <td className="py-2 pl-1.5 text-right font-sans font-semibold">{r.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );

  if (!wrap) return content;

  return <Card title={title} variant="inner">{content}</Card>;
}
