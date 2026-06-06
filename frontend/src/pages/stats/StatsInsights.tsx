import { useMemo, useState } from "react";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { LineChart, Table2, Grid3x3, UserRound } from "lucide-react";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import AvatarButton from "../../ui/primitives/AvatarButton";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";
import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";
import { getStatsRatings, getStatsPlayers, getStatsPlayerMatches, getStatsH2H } from "../../api/stats.api";
import { listClubs } from "../../api/clubs.api";
import type { Match, StatsScope, StatsH2HPair, StatsPlayerMatchesTournament } from "../../api/types";
import type { StatsMode } from "./StatsControls";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { colorForIdx } from "./trendsMath";
import { Sparkline, Radar, Heatmap, MultiLine } from "./charts";
import { MatchHistoryList } from "./MatchHistoryList";

type Tab = "trends" | "table" | "matrix" | "player";

type Row = {
  id: number; name: string; pts: number; rating: number;
  played: number; wins: number; draws: number; losses: number;
  gf: number; ga: number; gd: number; form: number[]; formAvg: number;
};

// ---- shared data ----------------------------------------------------------
function useStandings(mode: StatsMode, scope: StatsScope) {
  const ratingsQ = useQuery({
    queryKey: ["stats", "ratings", mode, scope],
    queryFn: () => getStatsRatings({ mode, scope }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const playersQ = useQuery({
    queryKey: ["stats", "players", mode, 12],
    queryFn: () => getStatsPlayers({ mode, lastN: 12 }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const formById = useMemo(() => {
    const m = new Map<number, { pts: number[]; avg: number }>();
    for (const p of playersQ.data?.players ?? []) m.set(Number(p.player_id), { pts: (p.lastN_pts ?? []).map(Number), avg: Number(p.lastN_avg_pts ?? 0) });
    return m;
  }, [playersQ.data]);
  const rows = useMemo<Row[]>(() => (ratingsQ.data?.rows ?? []).map((r) => {
    const f = formById.get(Number(r.player.id));
    return {
      id: Number(r.player.id), name: r.player.display_name, pts: Number(r.pts), rating: Number(r.rating),
      played: r.played, wins: r.wins, draws: r.draws, losses: r.losses, gf: r.gf, ga: r.ga, gd: r.gd,
      form: f?.pts ?? [], formAvg: f?.avg ?? 0,
    };
  }), [ratingsQ.data, formById]);
  return { rows, loading: ratingsQ.isLoading && !ratingsQ.data };
}

// ---- per-match helpers ----------------------------------------------------
function sideOf(m: Match, pid: number): "A" | "B" | null {
  const a = m.sides.find((s) => s.side === "A");
  const b = m.sides.find((s) => s.side === "B");
  if (a?.players.some((p) => p.id === pid)) return "A";
  if (b?.players.some((p) => p.id === pid)) return "B";
  return null;
}
function matchStats(m: Match, pid: number): { pts: number; gf: number; res: "W" | "D" | "L" } | null {
  if (m.state !== "finished") return null;
  const side = sideOf(m, pid);
  if (!side) return null;
  const me = m.sides.find((s) => s.side === side)!;
  const opp = m.sides.find((s) => s.side !== side)!;
  const mg = Number(me.goals ?? 0), og = Number(opp.goals ?? 0);
  const res = mg > og ? "W" : mg < og ? "L" : "D";
  return { pts: res === "W" ? 3 : res === "D" ? 1 : 0, gf: mg, res };
}

// ==========================================================================
//  TRENDS — interactive
// ==========================================================================
type Metric = "points" | "goals" | "winrate";
type ViewMode = "per" | "cumulative" | "rolling";
type Range = 10 | 20 | 0; // 0 = all

function TrendsExplorer({ mode, scope, rows }: { mode: StatsMode; scope: StatsScope; rows: Row[] }) {
  const [metric, setMetric] = useState<Metric>("points");
  const [view, setView] = useState<ViewMode>("cumulative");
  const [range, setRange] = useState<Range>(10);
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  const matchesQs = useQueries({
    queries: rows.map((r) => ({
      queryKey: ["stats", "playerMatches", r.id, scope],
      queryFn: () => getStatsPlayerMatches({ playerId: r.id, scope }),
      enabled: rows.length > 0,
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    })),
  });
  const loading = matchesQs.some((q) => q.isLoading && !q.data);

  // union of tournaments (by date), per-player per-tournament metric value
  const { labels, series } = useMemo(() => {
    const perPlayerVals = new Map<number, Map<number, number>>(); // pid -> (tid -> value)
    const tDate = new Map<number, string>();
    rows.forEach((r, i) => {
      const data = matchesQs[i]?.data as { tournaments: StatsPlayerMatchesTournament[] } | undefined;
      const vals = new Map<number, number>();
      for (const t of data?.tournaments ?? []) {
        if (mode !== "overall" && t.mode !== mode) continue;
        let pts = 0, gf = 0, w = 0, played = 0, any = false;
        for (const m of t.matches) {
          const s = matchStats(m, r.id);
          if (!s) continue;
          any = true; played++; pts += s.pts; gf += s.gf; if (s.res === "W") w++;
        }
        if (!any) continue;
        tDate.set(t.id, t.date);
        vals.set(t.id, metric === "points" ? pts : metric === "goals" ? gf : played ? (w / played) * 100 : 0);
      }
      perPlayerVals.set(r.id, vals);
    });
    const tids = [...tDate.keys()].sort((a, b) => (tDate.get(a)! < tDate.get(b)! ? -1 : 1));
    const sliceTids = range === 0 ? tids : tids.slice(-range);
    const labels = sliceTids.map((tid) => (tDate.get(tid) ?? "").slice(5)); // MM-DD

    const series = rows.map((r, idx) => {
      const vals = perPlayerVals.get(r.id) ?? new Map<number, number>();
      // build raw aligned to ALL tids (for cumulative/rolling correctness), then slice
      let cum = 0;
      const full = tids.map((tid) => {
        const v = vals.get(tid);
        if (v == null) return null;
        cum += v;
        return { raw: v, cum };
      });
      const transformed = tids.map((_, i) => {
        const cell = full[i];
        if (view === "cumulative") return cell ? cell.cum : (i > 0 ? (full.slice(0, i).reverse().find((c) => c)?.cum ?? null) : null);
        if (view === "per") return cell ? cell.raw : null;
        // rolling avg over last 5 present values up to i
        const windowVals: number[] = [];
        for (let j = i; j >= 0 && windowVals.length < 5; j--) { const c = full[j]; if (c) windowVals.push(c.raw); }
        return windowVals.length ? windowVals.reduce((a, b) => a + b, 0) / windowVals.length : null;
      });
      const sliced = range === 0 ? transformed : transformed.slice(-range);
      const c = colorForIdx(idx, rows.length);
      return { id: r.id, name: r.name, color: c.solid, points: hidden.has(r.id) ? sliced.map(() => null) : sliced };
    });
    return { labels, series };
  }, [rows, matchesQs, metric, view, range, hidden, mode]);

  const yMax = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p ?? 0)));

  return (
    <div className="space-y-3">
      <div className="card-outer space-y-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Metric</span>
            <SegmentedSwitch<Metric> value={metric} onChange={setMetric} ariaLabel="Metric"
              options={[{ key: "points", label: "Points" }, { key: "goals", label: "Goals" }, { key: "winrate", label: "Win %" }]} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">View</span>
            <SegmentedSwitch<ViewMode> value={view} onChange={setView} ariaLabel="View"
              options={[{ key: "cumulative", label: "Cumulative" }, { key: "per", label: "Per event" }, { key: "rolling", label: "Rolling avg" }]} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Range</span>
            <SegmentedSwitch<Range> value={range} onChange={setRange} ariaLabel="Range"
              options={[{ key: 10, label: "Last 10" }, { key: 20, label: "Last 20" }, { key: 0, label: "All" }]} />
          </div>
        </div>

        {loading ? <InlineLoading label="Loading…" /> : (
          <MultiLine series={series} xLabels={labels} yMax={Math.ceil(yMax)} height={220} />
        )}

        {/* Player toggles */}
        <div className="flex flex-wrap gap-2 pt-1">
          {rows.map((r, idx) => {
            const c = colorForIdx(idx, rows.length);
            const on = !hidden.has(r.id);
            return (
              <button key={r.id} type="button"
                onClick={() => setHidden((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition " + (on ? "bg-bg-card-chip/60 text-text-normal" : "bg-bg-card-chip/20 text-text-muted line-through")}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.solid, opacity: on ? 1 : 0.4 }} />
                {r.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="px-1 text-[11px] text-text-muted">
        Tap players to toggle. <b>Cumulative</b> sums over time, <b>Rolling avg</b> smooths the last 5 events.
      </div>
    </div>
  );
}

// ==========================================================================
//  TABLE — sortable
// ==========================================================================
type Col = { key: keyof Row | "ppm" | "rank"; label: string; num?: boolean };
function StatsTable({ rows, loading, onSelect }: { rows: Row[]; loading: boolean; onSelect: (id: number) => void }) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const [sortKey, setSortKey] = useState<string>("pts");
  const [dir, setDir] = useState<1 | -1>(-1);
  const cols: Col[] = [
    { key: "pts", label: "Pts", num: true }, { key: "ppm", label: "PPM", num: true },
    { key: "played", label: "P", num: true }, { key: "wins", label: "W", num: true },
    { key: "draws", label: "D", num: true }, { key: "losses", label: "L", num: true },
    { key: "gd", label: "GD", num: true }, { key: "rating", label: "Rtg", num: true },
  ];
  const valOf = (r: Row, k: string): number => k === "ppm" ? (r.played ? r.pts / r.played : 0) : (r[k as keyof Row] as number);
  const sorted = useMemo(() => rows.slice().sort((a, b) => (valOf(a, sortKey) - valOf(b, sortKey)) * dir), [rows, sortKey, dir]);
  const setSort = (k: string) => { if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setDir(-1); } };

  if (loading) return <InlineLoading label="Loading…" />;
  return (
    <div className="card-outer overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border-card-chip/50 text-[11px] uppercase tracking-wide text-text-muted">
            <th className="py-2 pl-1 pr-2 text-left font-medium">Player</th>
            {cols.map((c) => (
              <th key={c.key} className="px-2 py-2 text-right font-medium">
                <button type="button" onClick={() => setSort(c.key)} className={"inline-flex items-center gap-1 " + (sortKey === c.key ? "text-accent" : "hover:text-text-normal")}>
                  {c.label}{sortKey === c.key ? <span>{dir === -1 ? "▾" : "▴"}</span> : null}
                </button>
              </th>
            ))}
            <th className="px-2 py-2 text-right font-medium">Form</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.id} onClick={() => onSelect(r.id)} className="cursor-pointer border-b border-border-card-inner/40 transition hover:bg-hover-default/30">
              <td className="py-2 pl-1 pr-2">
                <div className="flex items-center gap-2">
                  <span className="w-4 text-right text-xs tabular-nums text-text-muted">{i + 1}</span>
                  <AvatarCircle playerId={r.id} name={r.name} updatedAt={avatarUpdatedAtById.get(r.id) ?? null} sizeClass="h-7 w-7" />
                  <span className="truncate font-medium text-text-normal">{r.name}</span>
                </div>
              </td>
              <td className="px-2 text-right font-bold tabular-nums">{r.pts}</td>
              <td className="px-2 text-right tabular-nums text-text-muted">{r.played ? (r.pts / r.played).toFixed(2) : "—"}</td>
              <td className="px-2 text-right tabular-nums text-text-muted">{r.played}</td>
              <td className="px-2 text-right tabular-nums text-status-text-green">{r.wins}</td>
              <td className="px-2 text-right tabular-nums text-amber-300">{r.draws}</td>
              <td className="px-2 text-right tabular-nums text-[color:rgb(var(--delta-down)/1)]">{r.losses}</td>
              <td className="px-2 text-right tabular-nums">{r.gd >= 0 ? `+${r.gd}` : r.gd}</td>
              <td className="px-2 text-right tabular-nums">{Math.round(r.rating)}</td>
              <td className="px-2"><div className="flex justify-end"><Sparkline values={r.form} w={52} h={18} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ==========================================================================
//  MATRIX — win-rate heatmap (replaces rivalry lists)
// ==========================================================================
function MatrixView({ mode, scope, rows }: { mode: StatsMode; scope: StatsScope; rows: Row[] }) {
  const q = useQuery({
    queryKey: ["stats", "h2h", "all", 200, "played", scope],
    queryFn: () => getStatsH2H({ playerId: null, limit: 200, order: "played", scope }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const [selected, setSelected] = useState<{ a: number; b: number } | null>(null);

  const pairs: StatsH2HPair[] = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    return mode === "1v1" ? d.rivalries_1v1 : mode === "2v2" ? d.rivalries_2v2 : d.rivalries_all;
  }, [q.data, mode]);

  const pairIndex = useMemo(() => {
    const m = new Map<string, StatsH2HPair>();
    for (const p of pairs) m.set([p.a.id, p.b.id].sort((x, y) => x - y).join("-"), p);
    return m;
  }, [pairs]);

  const cell = (rowId: number, colId: number) => {
    const p = pairIndex.get([rowId, colId].sort((x, y) => x - y).join("-"));
    if (!p || p.played === 0) return null;
    const rowIsA = p.a.id === rowId;
    const rowWins = rowIsA ? p.a_wins : p.b_wins;
    const colWins = rowIsA ? p.b_wins : p.a_wins;
    const pct = (rowWins / p.played) * 100;
    return { pct, label: `${rowWins}-${p.draws}-${colWins} of ${p.played}` };
  };

  const players = rows.map((r) => ({ id: r.id, name: r.name }));
  const detail = selected ? pairIndex.get([selected.a, selected.b].sort((x, y) => x - y).join("-")) : null;

  return (
    <div className="space-y-3">
      <div className="card-outer">
        <h2 className="mb-1 text-sm font-semibold text-text-normal">Win-rate matrix</h2>
        <p className="mb-3 text-[11px] text-text-muted">Each cell = row player's win rate vs the column player. Green = dominates, red = dominated. Tap for detail.</p>
        {q.isLoading && !q.data ? <InlineLoading label="Loading…" /> : (
          <Heatmap players={players} cell={cell} onCell={(a, b) => setSelected({ a, b })} />
        )}
      </div>
      {detail ? (() => {
        const aName = rows.find((r) => r.id === detail.a.id)?.name ?? detail.a.display_name;
        const bName = rows.find((r) => r.id === detail.b.id)?.name ?? detail.b.display_name;
        return (
          <div className="card-outer">
            <div className="mb-2 text-sm font-semibold text-text-normal">{aName} vs {bName}</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="surface rounded-xl py-2"><div className="text-lg font-bold text-status-text-green">{detail.a_wins}</div><div className="text-[11px] text-text-muted">{aName}</div></div>
              <div className="surface rounded-xl py-2"><div className="text-lg font-bold text-amber-300">{detail.draws}</div><div className="text-[11px] text-text-muted">draws</div></div>
              <div className="surface rounded-xl py-2"><div className="text-lg font-bold text-[color:rgb(var(--delta-down)/1)]">{detail.b_wins}</div><div className="text-[11px] text-text-muted">{bName}</div></div>
            </div>
            <div className="mt-2 text-center text-[11px] text-text-muted">{detail.played} matches · goals {detail.a_gf}:{detail.a_ga} ({aName})</div>
          </div>
        );
      })() : null}
    </div>
  );
}

// ==========================================================================
//  PLAYER — radar profile + trend + recent
// ==========================================================================
function PlayerProfile({ mode, scope, rows, selectedId, onSelect }: { mode: StatsMode; scope: StatsScope; rows: Row[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const row = rows.find((r) => r.id === selectedId) ?? null;

  // normalize metrics across players for the radar
  const radarAxes = useMemo(() => {
    if (!row) return [];
    const maxGfpm = Math.max(0.01, ...rows.map((r) => r.played ? r.gf / r.played : 0));
    const maxGapm = Math.max(0.01, ...rows.map((r) => r.played ? r.ga / r.played : 0));
    const maxPlayed = Math.max(1, ...rows.map((r) => r.played));
    const gfpm = row.played ? row.gf / row.played : 0;
    const gapm = row.played ? row.ga / row.played : 0;
    return [
      { label: "Attack", value: gfpm / maxGfpm },
      { label: "Defense", value: 1 - gapm / maxGapm },
      { label: "Win %", value: row.played ? row.wins / row.played : 0 },
      { label: "Form", value: row.formAvg / 3 },
      { label: "Activity", value: row.played / maxPlayed },
    ];
  }, [row, rows]);

  const matchesQ = useQuery({
    queryKey: ["stats", "playerMatches", selectedId ?? 0, scope],
    queryFn: () => getStatsPlayerMatches({ playerId: selectedId as number, scope }),
    enabled: selectedId != null,
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => listClubs(), staleTime: 60_000 });
  const tournaments = useMemo(() => {
    const ts = (matchesQ.data?.tournaments ?? []).filter((t) => mode === "overall" || t.mode === mode);
    return ts;
  }, [matchesQ.data, mode]);

  return (
    <div className="space-y-4">
      {/* player picker */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex items-center gap-2">
          {rows.map((r) => (
            <AvatarButton key={r.id} playerId={r.id} name={r.name} updatedAt={avatarUpdatedAtById.get(r.id) ?? null}
              selected={r.id === selectedId} onClick={() => onSelect(r.id)} className="h-10 w-10" noOverflowAnchor />
          ))}
        </div>
      </div>

      {!row ? (
        <div className="card-outer text-sm text-text-muted">Pick a player above.</div>
      ) : (
        <>
          <div className="card-outer flex items-center gap-3">
            <AvatarCircle playerId={row.id} name={row.name} updatedAt={avatarUpdatedAtById.get(row.id) ?? null} sizeClass="h-14 w-14" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-bold text-text-normal">{row.name}</div>
              <div className="text-xs text-text-muted">
                {Math.round(row.rating)}★ · <span className="text-status-text-green">{row.wins}</span>-<span className="text-amber-300">{row.draws}</span>-<span className="text-[color:rgb(var(--delta-down)/1)]">{row.losses}</span> · {row.pts} pts · {row.played} played
              </div>
            </div>
          </div>

          <div className="card-outer flex flex-col items-center">
            <h2 className="self-start text-sm font-semibold text-text-normal">Profile</h2>
            <Radar axes={radarAxes} />
            <div className="text-[11px] text-text-muted">Strengths relative to the field.</div>
          </div>

          <div className="card-outer">
            <h2 className="mb-2 text-sm font-semibold text-text-normal">Match history</h2>
            {matchesQ.isLoading && !matchesQ.data ? <InlineLoading label="Loading…" /> :
              tournaments.length ? <MatchHistoryList tournaments={tournaments} clubs={clubsQ.data ?? []} focusId={row.id} showMeta={false} nameColorByResult hideModePill /> :
                <div className="text-sm text-text-muted">No matches yet.</div>}
          </div>
        </>
      )}
    </div>
  );
}

// ==========================================================================
//  MAIN
// ==========================================================================
const TABS: SectionTab<Tab>[] = [
  { key: "trends", label: "Trends", icon: <LineChart size={14} /> },
  { key: "table", label: "Table", icon: <Table2 size={14} /> },
  { key: "matrix", label: "Matrix", icon: <Grid3x3 size={14} /> },
  { key: "player", label: "Player", icon: <UserRound size={14} /> },
];

export default function StatsInsights({
  mode,
  scope,
  playerId,
  onSelectPlayer,
}: {
  mode: StatsMode;
  scope: StatsScope;
  playerId: number | "";
  onSelectPlayer: (id: number) => void;
}) {
  const { rows, loading } = useStandings(mode, scope);
  const [tab, setTab] = useState<Tab>(playerId !== "" ? "player" : "trends");
  const selectedId = playerId === "" ? (rows[0]?.id ?? null) : playerId;

  const goPlayer = (id: number) => { onSelectPlayer(id); setTab("player"); };

  return (
    <div className="space-y-4">
      <SectionTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "trends" && <TrendsExplorer mode={mode} scope={scope} rows={rows} />}
      {tab === "table" && <StatsTable rows={rows} loading={loading} onSelect={goPlayer} />}
      {tab === "matrix" && <MatrixView mode={mode} scope={scope} rows={rows} />}
      {tab === "player" && <PlayerProfile mode={mode} scope={scope} rows={rows} selectedId={selectedId} onSelect={onSelectPlayer} />}
    </div>
  );
}
