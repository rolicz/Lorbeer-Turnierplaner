import { useMemo } from "react";
import type { Match, Player } from "../../api/types";
import { sideBy } from "../../helpers";
import Card from "../../ui/primitives/Card";

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

function MobileRow({ r, rank, delta, isLeader }: { r: Row; rank: number; delta: number | null; isLeader: boolean }) {
  return (
    <div className="relative panel px-3 py-2">
      {/* leader bar */}
      {isLeader && <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-status-bar-green" />}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-6 text-text-muted tabular-nums">{rank}</div>
            <div className="w-5">
              <Arrow delta={delta} />
            </div>
            <div className="min-w-0 truncate font-medium">
              <span className="panel-subtle inline-flex items-center rounded-lg px-2 py-1">{r.name}</span>
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
  matches,
  players,
  tournamentStatus,
  wrap = true,
}: {
  matches: Match[];
  players: Player[];
  tournamentStatus?: "draft" | "live" | "done";
  /** If false, renders borderless (for embedding inside another Card/Collapsible). */
  wrap?: boolean;
}) {
  const baseRows = useMemo(() => computeStandings(matches, players, "finished"), [matches, players]);
  const liveRows = useMemo(() => computeStandings(matches, players, "live"), [matches, players]);
  const basePos = useMemo(() => posMap(baseRows), [baseRows]);

  const title = tournamentStatus === "done" ? "Results" : "Standings (live)";

  const content = (
    <>
      {/* Mobile */}
      <div className="sm:hidden space-y-2">
        {liveRows.map((r, idx) => {
          const baseIdx = basePos.get(r.playerId);
          const delta = baseIdx === undefined ? null : baseIdx - idx;
          return <MobileRow key={r.playerId} r={r} rank={idx + 1} delta={delta} isLeader={idx === 0} />;
        })}
      </div>

      {/* Desktop */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="min-w-[760px] w-full text-sm">
          <thead className="text-text-muted">
            <tr className="border-b border-border-card-inner">
              <th className="py-2 text-left font-medium w-10">#</th>
              <th className="py-2 text-left font-medium w-10"></th>
              <th className="py-2 text-left font-medium">Player</th>
              <th className="py-2 text-right font-medium">P</th>
              <th className="py-2 text-right font-medium">W</th>
              <th className="py-2 text-right font-medium">D</th>
              <th className="py-2 text-right font-medium">L</th>
              <th className="py-2 text-right font-medium">+</th>
              <th className="py-2 text-right font-medium">-</th>
              <th className="py-2 text-right font-medium">GD</th>
              <th className="py-2 text-right font-semibold">Pts</th>
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
                    idx % 2 === 0 ? "bg-table-row-a" : "bg-table-row-b",
                    "border-b border-border-card-inner",
                  ].join(" ")}
                >
                  {/* leader bar */}
                  {isLeader && (
                    <td className="relative py-2 pr-2 text-text-muted">
                      <div className="absolute left-0 top-0 h-full w-1 bg-status-bar-green" />
                      <div className="pl-2">{idx + 1}</div>
                    </td>
                  )}
                  {!isLeader && <td className="py-2 pr-2 text-text-muted">{idx + 1}</td>}

                  <td className="py-2">
                    <Arrow delta={delta} />
                  </td>
                  <td className="py-2 font-sans font-medium">
                    <span className="panel-subtle inline-flex items-center rounded-lg px-2 py-1">{r.name}</span>
                  </td>
                  <td className="py-2 text-right">{r.played}</td>
                  <td className="py-2 text-right">{r.wins}</td>
                  <td className="py-2 text-right">{r.draws}</td>
                  <td className="py-2 text-right">{r.losses}</td>
                  <td className="py-2 text-right">{r.gf}</td>
                  <td className="py-2 text-right">{r.ga}</td>
                  <td className="py-2 text-right">{r.gd}</td>
                  <td className="py-2 text-right font-sans font-semibold">{r.pts}</td>
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
