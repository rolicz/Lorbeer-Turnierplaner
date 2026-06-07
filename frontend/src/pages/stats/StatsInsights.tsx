import { useMemo, useState } from "react";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { LineChart, Table2, Grid3x3, UserRound, Flame } from "lucide-react";

import AvatarCircle from "../../ui/primitives/AvatarCircle";
import AvatarButton from "../../ui/primitives/AvatarButton";
import InlineLoading from "../../ui/primitives/InlineLoading";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";
import { getStatsRatings, getStatsPlayers, getStatsPlayerMatches, getStatsH2H, getStatsStreaks } from "../../api/stats.api";
import { listClubs } from "../../api/clubs.api";
import type { Match, StatsScope, StatsH2HPair, StatsPlayerMatchesTournament, StatsStreakCategory } from "../../api/types";
import type { StatsMode } from "./StatsControls";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { colorForIdx } from "./trendsMath";
import { Sparkline, Radar, Heatmap, MultiLine, ChipGroup } from "./charts";
import { MatchHistoryList } from "./MatchHistoryList";

type Tab = "trends" | "table" | "h2h" | "streaks" | "player";

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
function matchStats(m: Match, pid: number): { pts: number; gf: number; ga: number; res: "W" | "D" | "L" } | null {
  if (m.state !== "finished") return null;
  const side = sideOf(m, pid);
  if (!side) return null;
  const me = m.sides.find((s) => s.side === side)!;
  const opp = m.sides.find((s) => s.side !== side)!;
  const mg = Number(me.goals ?? 0), og = Number(opp.goals ?? 0);
  const res = mg > og ? "W" : mg < og ? "L" : "D";
  return { pts: res === "W" ? 3 : res === "D" ? 1 : 0, gf: mg, ga: og, res };
}

// ---- small controls -------------------------------------------------------
function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-bg-card-chip/60 accent-[rgb(var(--color-accent))]"
      />
      <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-text-normal">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      {children}
    </div>
  );
}

// ==========================================================================
//  TRENDS — interactive
// ==========================================================================
type Metric = "points" | "goals" | "conceded" | "gd" | "winrate" | "ppm";
type ViewMode = "per" | "cumulative" | "rolling";

const METRIC_OPTS: { key: Metric; label: string }[] = [
  { key: "points", label: "Points" },
  { key: "goals", label: "Goals" },
  { key: "conceded", label: "Conceded" },
  { key: "gd", label: "Goal diff" },
  { key: "winrate", label: "Win %" },
  { key: "ppm", label: "Pts/match" },
];

function TrendsExplorer({ mode, scope, rows }: { mode: StatsMode; scope: StatsScope; rows: Row[] }) {
  const [metric, setMetric] = useState<Metric>("points");
  const [view, setView] = useState<ViewMode>("cumulative");
  const [rollN, setRollN] = useState(5);
  const [rangeN, setRangeN] = useState(12);
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

  const { labels, series, totalEvents, allowsCumulative } = useMemo(() => {
    const perPlayer = new Map<number, Map<number, number>>();
    const tDate = new Map<number, string>();
    rows.forEach((r, i) => {
      const data = matchesQs[i]?.data as { tournaments: StatsPlayerMatchesTournament[] } | undefined;
      const vals = new Map<number, number>();
      for (const t of data?.tournaments ?? []) {
        if (mode !== "overall" && t.mode !== mode) continue;
        let pts = 0, gf = 0, ga = 0, w = 0, played = 0, any = false;
        for (const m of t.matches) {
          const s = matchStats(m, r.id);
          if (!s) continue;
          any = true; played++; pts += s.pts; gf += s.gf; ga += s.ga; if (s.res === "W") w++;
        }
        if (!any) continue;
        tDate.set(t.id, t.date);
        const v = metric === "points" ? pts : metric === "goals" ? gf : metric === "conceded" ? ga
          : metric === "gd" ? gf - ga : metric === "winrate" ? (played ? (w / played) * 100 : 0)
          : (played ? pts / played : 0);
        vals.set(t.id, v);
      }
      perPlayer.set(r.id, vals);
    });
    const tids = [...tDate.keys()].sort((a, b) => (tDate.get(a)! < tDate.get(b)! ? -1 : 1));
    const allowsCumulative = metric === "points" || metric === "goals" || metric === "conceded" || metric === "gd";
    const effView: ViewMode = view === "cumulative" && !allowsCumulative ? "rolling" : view;
    const sliceTids = tids.slice(-rangeN);
    const labels = sliceTids.map((tid) => (tDate.get(tid) ?? "").slice(5));

    const series = rows.map((r, idx) => {
      const vals = perPlayer.get(r.id) ?? new Map<number, number>();
      let cum = 0;
      const full = tids.map((tid) => {
        const v = vals.get(tid);
        if (v == null) return null;
        cum += v;
        return { raw: v, cum };
      });
      const transformed = tids.map((_, i) => {
        const cell = full[i];
        if (effView === "cumulative") return cell ? cell.cum : (full.slice(0, i).reverse().find((c) => c)?.cum ?? null);
        if (effView === "per") return cell ? cell.raw : null;
        const wv: number[] = [];
        for (let j = i; j >= 0 && wv.length < rollN; j--) { const c = full[j]; if (c) wv.push(c.raw); }
        return wv.length ? wv.reduce((a, b) => a + b, 0) / wv.length : null;
      });
      const sliced = transformed.slice(-rangeN);
      const c = colorForIdx(idx, rows.length);
      return { id: r.id, name: r.name, color: c.solid, points: hidden.has(r.id) ? sliced.map(() => null) : sliced };
    });
    return { labels, series, totalEvents: tids.length, allowsCumulative };
  }, [rows, matchesQs, metric, view, rollN, rangeN, hidden, mode]);

  const allY = series.flatMap((s) => s.points.filter((p): p is number => p != null));
  const yMax = Math.max(1, ...allY);
  const yMin = Math.min(0, ...allY);

  return (
    <div className="space-y-3">
      {/* chart first (hero) */}
      <div className="card-outer">
        {loading ? <InlineLoading label="Loading…" /> : (
          <MultiLine series={series} xLabels={labels} yMax={Math.ceil(yMax)} yMin={Math.floor(yMin)} height={230} />
        )}
        <div className="mt-3 flex flex-wrap gap-2">
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

      {/* controls */}
      <div className="card-outer space-y-3">
        <Field label="Metric">
          <ChipGroup<Metric> value={metric} onChange={setMetric} ariaLabel="Metric" options={METRIC_OPTS} />
        </Field>
        <Field label="View">
          <ChipGroup<ViewMode> value={view} onChange={setView} ariaLabel="View"
            options={[
              ...(allowsCumulative ? [{ key: "cumulative" as ViewMode, label: "Cumulative" }] : []),
              { key: "per", label: "Per event" },
              { key: "rolling", label: "Rolling avg" },
            ]} />
        </Field>
        {view === "rolling" ? (
          <Slider label="Window" value={rollN} min={2} max={Math.max(3, Math.min(15, totalEvents || 10))} onChange={setRollN} />
        ) : null}
        <Slider label="Show last" value={Math.min(rangeN, Math.max(3, totalEvents || 3))} min={3} max={Math.max(4, totalEvents || 4)} onChange={setRangeN} />
      </div>
    </div>
  );
}

// ==========================================================================
//  TABLE — sortable, many derived metrics
// ==========================================================================
function StatsTable({ rows, loading, onSelect }: { rows: Row[]; loading: boolean; onSelect: (id: number) => void }) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const [sortKey, setSortKey] = useState<string>("pts");
  const [dir, setDir] = useState<1 | -1>(-1);
  const cols = [
    { key: "pts", label: "Pts" }, { key: "ppm", label: "PPM" }, { key: "played", label: "P" },
    { key: "wins", label: "W" }, { key: "draws", label: "D" }, { key: "losses", label: "L" },
    { key: "gf", label: "GF" }, { key: "ga", label: "GA" }, { key: "gpm", label: "G/M" },
    { key: "gapm", label: "GA/M" }, { key: "gd", label: "GD" }, { key: "rating", label: "Rtg" },
  ];
  const valOf = (r: Row, k: string): number =>
    k === "ppm" ? (r.played ? r.pts / r.played : 0)
    : k === "gpm" ? (r.played ? r.gf / r.played : 0)
    : k === "gapm" ? (r.played ? r.ga / r.played : 0)
    : (r[k as keyof Row] as number);
  const sorted = useMemo(() => rows.slice().sort((a, b) => (valOf(a, sortKey) - valOf(b, sortKey)) * dir), [rows, sortKey, dir]);
  const setSort = (k: string) => { if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setDir(-1); } };
  const f2 = (n: number) => n.toFixed(2);

  if (loading) return <InlineLoading label="Loading…" />;
  return (
    <div className="card-outer overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border-card-chip/50 text-[11px] uppercase tracking-wide text-text-muted">
            <th className="sticky left-0 z-10 bg-bg-card-outer py-2 pl-1 pr-2 text-left font-medium">Player</th>
            {cols.map((c) => (
              <th key={c.key} className="px-2 py-2 text-right font-medium">
                <button type="button" onClick={() => setSort(c.key)} className={"inline-flex items-center gap-0.5 " + (sortKey === c.key ? "text-accent" : "hover:text-text-normal")}>
                  {c.label}{sortKey === c.key ? <span>{dir === -1 ? "▾" : "▴"}</span> : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.id} onClick={() => onSelect(r.id)} className="cursor-pointer border-b border-border-card-inner/40 transition hover:bg-hover-default/30">
              <td className="sticky left-0 z-10 bg-bg-card-outer py-2 pl-1 pr-2">
                <div className="flex items-center gap-2">
                  <span className="w-4 text-right text-xs tabular-nums text-text-muted">{i + 1}</span>
                  <AvatarCircle playerId={r.id} name={r.name} updatedAt={avatarUpdatedAtById.get(r.id) ?? null} sizeClass="h-7 w-7" />
                  <span className="truncate font-medium text-text-normal">{r.name}</span>
                </div>
              </td>
              <td className="px-2 text-right font-bold tabular-nums">{r.pts}</td>
              <td className="px-2 text-right tabular-nums text-text-muted">{r.played ? f2(r.pts / r.played) : "—"}</td>
              <td className="px-2 text-right tabular-nums text-text-muted">{r.played}</td>
              <td className="px-2 text-right tabular-nums text-status-text-green">{r.wins}</td>
              <td className="px-2 text-right tabular-nums text-amber-300">{r.draws}</td>
              <td className="px-2 text-right tabular-nums text-[color:rgb(var(--delta-down)/1)]">{r.losses}</td>
              <td className="px-2 text-right tabular-nums">{r.gf}</td>
              <td className="px-2 text-right tabular-nums">{r.ga}</td>
              <td className="px-2 text-right tabular-nums text-text-muted">{r.played ? f2(r.gf / r.played) : "—"}</td>
              <td className="px-2 text-right tabular-nums text-text-muted">{r.played ? f2(r.ga / r.played) : "—"}</td>
              <td className="px-2 text-right tabular-nums">{r.gd >= 0 ? `+${r.gd}` : r.gd}</td>
              <td className="px-2 text-right tabular-nums">{Math.round(r.rating)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ==========================================================================
//  H2H — matrix + rivalries + pairwise detail
// ==========================================================================
function H2HView({ mode, scope, rows }: { mode: StatsMode; scope: StatsScope; rows: Row[] }) {
  const q = useQuery({
    queryKey: ["stats", "h2h", "all", 200, "rivalry", scope],
    queryFn: () => getStatsH2H({ playerId: null, limit: 200, order: "rivalry", scope }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const [selected, setSelected] = useState<{ a: number; b: number } | null>(null);
  const nameById = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);

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
    return { pct: (rowWins / p.played) * 100, label: `${rowWins}-${p.draws}-${colWins}` };
  };
  const players = rows.map((r) => ({ id: r.id, name: r.name }));
  const detail = selected ? pairIndex.get([selected.a, selected.b].sort((x, y) => x - y).join("-")) : null;
  const topRivalries = pairs.slice().sort((a, b) => b.rivalry_score - a.rivalry_score).slice(0, 8);

  if (q.isLoading && !q.data) return <InlineLoading label="Loading…" />;

  return (
    <div className="space-y-3">
      <div className="card-outer">
        <h2 className="mb-1 text-sm font-semibold text-text-normal">Win-rate matrix</h2>
        <p className="mb-3 text-[11px] text-text-muted">Row's win rate vs column. Green = dominates, red = dominated. Tap a cell.</p>
        <Heatmap players={players} cell={cell} onCell={(a, b) => setSelected({ a, b })} />
      </div>

      {detail ? (() => {
        const aName = nameById.get(detail.a.id) ?? detail.a.display_name;
        const bName = nameById.get(detail.b.id) ?? detail.b.display_name;
        return (
          <div className="card-outer">
            <div className="mb-2 text-sm font-semibold text-text-normal">{aName} vs {bName}</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="surface rounded-xl py-2"><div className="text-lg font-bold text-status-text-green">{detail.a_wins}</div><div className="text-[11px] text-text-muted">{aName}</div></div>
              <div className="surface rounded-xl py-2"><div className="text-lg font-bold text-amber-300">{detail.draws}</div><div className="text-[11px] text-text-muted">draws</div></div>
              <div className="surface rounded-xl py-2"><div className="text-lg font-bold text-[color:rgb(var(--delta-down)/1)]">{detail.b_wins}</div><div className="text-[11px] text-text-muted">{bName}</div></div>
            </div>
            <div className="mt-2 text-center text-[11px] text-text-muted">{detail.played} matches · goals {detail.a_gf}:{detail.b_gf}</div>
          </div>
        );
      })() : null}

      <div className="card-outer">
        <h2 className="mb-2 text-sm font-semibold text-text-normal">Top rivalries</h2>
        <div className="space-y-1.5">
          {topRivalries.map((p) => (
            <button key={`${p.a.id}-${p.b.id}`} type="button" onClick={() => setSelected({ a: p.a.id, b: p.b.id })}
              className="surface flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-hover-default/30">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-normal">
                  {nameById.get(p.a.id) ?? p.a.display_name} <span className="text-text-muted">vs</span> {nameById.get(p.b.id) ?? p.b.display_name}
                </div>
                <div className="text-[11px] text-text-muted">{p.played} matches · {p.a_wins}-{p.draws}-{p.b_wins}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-bold tabular-nums text-accent">{Math.round(p.rivalry_score)}</div>
                <div className="text-[10px] text-text-muted">rivalry</div>
              </div>
            </button>
          ))}
          {!topRivalries.length ? <div className="text-sm text-text-muted">No rivalries yet.</div> : null}
        </div>
      </div>
    </div>
  );
}

// ==========================================================================
//  STREAKS
// ==========================================================================
function StreaksView({ mode, scope }: { mode: StatsMode; scope: StatsScope }) {
  const q = useQuery({
    queryKey: ["stats", "streaks", mode, 200, scope],
    queryFn: () => getStatsStreaks({ mode, playerId: null, limit: 200, scope }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  if (q.isLoading && !q.data) return <InlineLoading label="Loading…" />;
  const cats: StatsStreakCategory[] = q.data?.categories ?? [];

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {cats.map((c) => {
        const records = (c.records ?? []).slice(0, 5);
        const current = (c.current ?? []).filter((r) => r.length > 0).slice(0, 5);
        return (
          <div key={c.key} className="card-outer">
            <div className="mb-1 flex items-center gap-2">
              <Flame size={14} className="text-text-muted" />
              <h2 className="text-sm font-semibold text-text-normal">{c.name}</h2>
            </div>
            <p className="mb-2 text-[11px] text-text-muted">{c.description}</p>
            {records.length ? (
              <div className="space-y-1">
                {records.map((r, i) => (
                  <div key={`${r.player.id}-${i}`} className="surface flex items-center gap-2 rounded-lg px-2.5 py-1.5">
                    <span className="w-4 text-center text-xs font-bold tabular-nums text-text-muted">{i + 1}</span>
                    <AvatarCircle playerId={r.player.id} name={r.player.display_name} updatedAt={avatarUpdatedAtById.get(r.player.id) ?? null} sizeClass="h-6 w-6" />
                    <span className="min-w-0 flex-1 truncate text-sm text-text-normal">{r.player.display_name}</span>
                    {r.ongoing ? <span className="rounded-full bg-status-bg-green/60 px-1.5 text-[10px] text-status-text-green">live</span> : null}
                    <span className="text-sm font-bold tabular-nums text-accent">{r.length}</span>
                  </div>
                ))}
              </div>
            ) : <div className="text-sm text-text-muted">None yet.</div>}
            {current.length ? (
              <div className="mt-2 border-t border-border-card-inner/50 pt-2">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">Current</div>
                <div className="flex flex-wrap gap-1.5">
                  {current.map((r) => (
                    <span key={r.player.id} className="inline-flex items-center gap-1 rounded-full bg-bg-card-chip/50 px-2 py-0.5 text-[11px]">
                      {r.player.display_name} <b className="text-text-normal">{r.length}</b>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      {!cats.length ? <div className="card-outer text-sm text-text-muted">No streak data yet.</div> : null}
    </div>
  );
}

// ==========================================================================
//  PLAYER — radar + stat tiles + history
// ==========================================================================
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface rounded-xl px-2 py-2 text-center">
      <div className="text-base font-bold tabular-nums text-text-normal">{value}</div>
      <div className="text-[10px] text-text-muted">{label}</div>
    </div>
  );
}

function PlayerProfile({ mode, scope, rows, selectedId, onSelect }: { mode: StatsMode; scope: StatsScope; rows: Row[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const { avatarUpdatedAtById } = usePlayerAvatarMap();
  const row = rows.find((r) => r.id === selectedId) ?? null;

  const radarAxes = useMemo(() => {
    if (!row) return [];
    const maxGfpm = Math.max(0.01, ...rows.map((r) => r.played ? r.gf / r.played : 0));
    const maxGapm = Math.max(0.01, ...rows.map((r) => r.played ? r.ga / r.played : 0));
    const maxPlayed = Math.max(1, ...rows.map((r) => r.played));
    return [
      { label: "Attack", value: (row.played ? row.gf / row.played : 0) / maxGfpm },
      { label: "Defense", value: 1 - (row.played ? row.ga / row.played : 0) / maxGapm },
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
  const tournaments = useMemo(() => (matchesQ.data?.tournaments ?? []).filter((t) => mode === "overall" || t.mode === mode), [matchesQ.data, mode]);

  return (
    <div className="space-y-4">
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="flex items-center gap-2">
          {rows.map((r) => (
            <AvatarButton key={r.id} playerId={r.id} name={r.name} updatedAt={avatarUpdatedAtById.get(r.id) ?? null}
              selected={r.id === selectedId} onClick={() => onSelect(r.id)} className="h-10 w-10" noOverflowAnchor />
          ))}
        </div>
      </div>

      {!row ? <div className="card-outer text-sm text-text-muted">Pick a player above.</div> : (
        <>
          <div className="card-outer flex items-center gap-3">
            <AvatarCircle playerId={row.id} name={row.name} updatedAt={avatarUpdatedAtById.get(row.id) ?? null} sizeClass="h-14 w-14" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-bold text-text-normal">{row.name}</div>
              <div className="text-xs text-text-muted">
                {Math.round(row.rating)}★ · <span className="text-status-text-green">{row.wins}</span>-<span className="text-amber-300">{row.draws}</span>-<span className="text-[color:rgb(var(--delta-down)/1)]">{row.losses}</span> · {row.pts} pts
              </div>
            </div>
            <Sparkline values={row.form} />
          </div>

          <div className="card-outer">
            <h2 className="mb-2 text-sm font-semibold text-text-normal">Key numbers</h2>
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Played" value={String(row.played)} />
              <StatTile label="Win rate" value={row.played ? `${Math.round((row.wins / row.played) * 100)}%` : "—"} />
              <StatTile label="Pts / match" value={row.played ? (row.pts / row.played).toFixed(2) : "—"} />
              <StatTile label="Goals / match" value={row.played ? (row.gf / row.played).toFixed(2) : "—"} />
              <StatTile label="Conceded / match" value={row.played ? (row.ga / row.played).toFixed(2) : "—"} />
              <StatTile label="Goal diff" value={row.gd >= 0 ? `+${row.gd}` : String(row.gd)} />
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
  { key: "h2h", label: "H2H", icon: <Grid3x3 size={14} /> },
  { key: "streaks", label: "Streaks", icon: <Flame size={14} /> },
  { key: "player", label: "Player", icon: <UserRound size={14} /> },
];

export default function StatsInsights({
  mode, scope, onModeChange, onScopeChange, playerId, onSelectPlayer,
}: {
  mode: StatsMode; scope: StatsScope;
  onModeChange: (m: StatsMode) => void; onScopeChange: (s: StatsScope) => void;
  playerId: number | ""; onSelectPlayer: (id: number) => void;
}) {
  const { rows, loading } = useStandings(mode, scope);
  const [tab, setTab] = useState<Tab>(playerId !== "" ? "player" : "trends");
  const selectedId = playerId === "" ? (rows[0]?.id ?? null) : playerId;
  const goPlayer = (id: number) => { onSelectPlayer(id); setTab("player"); };

  return (
    <div className="space-y-3">
      {/* Slim global filters */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Mode</span>
          <ChipGroup<StatsMode> value={mode} onChange={onModeChange} ariaLabel="Mode"
            options={[{ key: "overall", label: "Overall" }, { key: "1v1", label: "1v1" }, { key: "2v2", label: "2v2" }]} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Source</span>
          <ChipGroup<StatsScope> value={scope} onChange={onScopeChange} ariaLabel="Source"
            options={[{ key: "tournaments", label: "Tournaments" }, { key: "both", label: "Both" }, { key: "friendlies", label: "Friendlies" }]} />
        </div>
      </div>

      <SectionTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "trends" && <TrendsExplorer mode={mode} scope={scope} rows={rows} />}
      {tab === "table" && <StatsTable rows={rows} loading={loading} onSelect={goPlayer} />}
      {tab === "h2h" && <H2HView mode={mode} scope={scope} rows={rows} />}
      {tab === "streaks" && <StreaksView mode={mode} scope={scope} />}
      {tab === "player" && <PlayerProfile mode={mode} scope={scope} rows={rows} selectedId={selectedId} onSelect={onSelectPlayer} />}
    </div>
  );
}
