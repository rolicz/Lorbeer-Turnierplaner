/** H2H tab — full matrix, per-player detail, teammate synergy and rivalries. */
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import InlineLoading from "../../ui/primitives/InlineLoading";
import { getStatsH2H, getStatsPlayerMatches } from "../../api/stats.api";
import { qk } from "../../api/queryKeys";
import { ChipGroup } from "./charts";
import { PlayerPicker } from "./PlayerPicker";
import type { Row } from "./standings";
import { matchStats } from "./standings";
import type { StatsMode } from "./StatsControls";
import type { StatsScope, StatsH2HPair, StatsH2HOpponentRow, StatsPlayerMatchesTournament } from "../../api/types";

function h2hTone(pct: number): string {
  const t = Math.max(0, Math.min(1, pct / 100));
  return `hsl(${t * 130} 60% 42% / 0.85)`;
}

function h2hSequential(t: number): string {
  return `hsl(210 60% ${48 - t * 22}% / ${0.55 + t * 0.3})`;
}

function h2hDiverging(gd: number, maxAbs: number): string {
  if (maxAbs === 0) return `hsl(0 0% 40% / 0.55)`;
  const t = Math.max(-1, Math.min(1, gd / maxAbs));
  if (t >= 0) return `hsl(130 55% ${46 - t * 18}% / ${0.55 + t * 0.3})`;
  return `hsl(0 55% ${46 + t * 18}% / ${0.55 - t * 0.3})`;
}

export default function H2HView({ mode, scope, rows, myId }: { mode: StatsMode; scope: StatsScope; rows: Row[]; myId?: number | null }) {
  const q = useQuery({
    queryKey: qk.stats.h2h("all", 200, "rivalry", scope),
    queryFn: () => getStatsH2H({ playerId: null, limit: 200, order: "rivalry", scope }),
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const defaultSelected = (myId != null && rows.some((r) => r.id === myId)) ? myId : (rows[0]?.id ?? null);
  const [selected, setSelected] = useState<number | null>(defaultSelected);
  const [matrixMetric, setMatrixMetric] = useState<"winrate" | "played" | "gd" | "wdl" | "ppm" | "rivalry">("winrate");
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
    const rowGf = rowIsA ? p.a_gf : p.b_gf;
    const rowGa = rowIsA ? p.a_ga : p.b_ga;
    const ppm = (3 * rowWins + p.draws) / p.played;
    return { pct: (rowWins / p.played) * 100, w: rowWins, d: p.draws, l: colWins, played: p.played, gd: rowGf - rowGa, ppm, rivalry: p.rivalry_score };
  };
  const cellText = (v: { pct: number; played: number; gd: number; w: number; d: number; l: number; ppm: number; rivalry: number }) =>
    matrixMetric === "played" ? String(v.played)
      : matrixMetric === "gd" ? (v.gd >= 0 ? `+${v.gd}` : String(v.gd))
        : matrixMetric === "wdl" ? `${v.w}-${v.d}-${v.l}`
          : matrixMetric === "ppm" ? v.ppm.toFixed(2)
            : matrixMetric === "rivalry" ? String(Math.round(v.rivalry))
              : String(Math.round(v.pct));
  const topRivalries = pairs.slice().sort((a, b) => b.rivalry_score - a.rivalry_score).slice(0, 8);

  // Precompute normalization ranges for per-metric coloring.
  const matrixRanges = useMemo(() => {
    let maxPlayed = 1, maxRivalry = 1, maxAbsGd = 1;
    for (const r of rows) {
      for (const c of rows) {
        if (r.id === c.id) continue;
        const v = cell(r.id, c.id);
        if (!v) continue;
        maxPlayed = Math.max(maxPlayed, v.played);
        maxRivalry = Math.max(maxRivalry, v.rivalry);
        maxAbsGd = Math.max(maxAbsGd, Math.abs(v.gd));
      }
    }
    return { maxPlayed, maxRivalry, maxAbsGd };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs, rows]);

  const cellColor = (v: ReturnType<typeof cell>): string => {
    if (!v) return "";
    switch (matrixMetric) {
      case "played": return h2hSequential(v.played / matrixRanges.maxPlayed);
      case "rivalry": return h2hSequential(v.rivalry / matrixRanges.maxRivalry);
      case "gd": return h2hDiverging(v.gd, matrixRanges.maxAbsGd);
      default: return h2hTone(v.pct);
    }
  };

  // Per-player detail.
  const detailQ = useQuery({
    queryKey: qk.stats.h2hPlayerDetail(selected, scope),
    queryFn: () => getStatsH2H({ playerId: selected as number, order: "played", limit: 50, scope }),
    enabled: selected != null,
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const vs = useMemo<StatsH2HOpponentRow[]>(() => {
    const d = detailQ.data;
    if (!d) return [];
    return (mode === "1v1" ? d.vs_1v1 : mode === "2v2" ? d.vs_2v2 : d.vs_all) ?? [];
  }, [detailQ.data, mode]);
  const nemesis = mode === "1v1" ? detailQ.data?.nemesis_1v1 : mode === "2v2" ? detailQ.data?.nemesis_2v2 : detailQ.data?.nemesis_all;
  const favorite = mode === "1v1" ? detailQ.data?.favorite_victim_1v1 : mode === "2v2" ? detailQ.data?.favorite_victim_2v2 : detailQ.data?.favorite_victim_all;
  const selName = selected != null ? nameById.get(selected) ?? "" : "";

  // 2v2 teammate synergy — how the selected player does *with* each partner.
  const teammateQ = useQuery({
    queryKey: qk.stats.playerMatches(selected ?? 0, scope),
    queryFn: () => getStatsPlayerMatches({ playerId: selected as number, scope }),
    enabled: mode === "2v2" && selected != null,
    placeholderData: keepPreviousData, staleTime: 30_000,
  });
  const teammates = useMemo(() => {
    if (mode !== "2v2" || selected == null) return [];
    const data = teammateQ.data as { tournaments: StatsPlayerMatchesTournament[] } | undefined;
    type TM = { id: number; name: string; played: number; w: number; d: number; l: number; gf: number; ga: number; pts: number };
    const acc = new Map<number, TM>();
    for (const t of data?.tournaments ?? []) {
      if (t.mode !== "2v2") continue;
      for (const m of t.matches) {
        if (m.state !== "finished") continue;
        const sideA = m.sides.find((s) => s.side === "A");
        const sideB = m.sides.find((s) => s.side === "B");
        const mySide = (sideA?.players ?? []).some((p) => p.id === selected) ? sideA
          : (sideB?.players ?? []).some((p) => p.id === selected) ? sideB : null;
        if (!mySide) continue;
        const st = matchStats(m, selected);
        if (!st) continue;
        for (const partner of (mySide.players ?? []).filter((p) => p.id !== selected)) {
          const e = acc.get(partner.id) ?? { id: partner.id, name: partner.display_name, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
          e.played++; e.gf += st.gf; e.ga += st.ga; e.pts += st.pts;
          if (st.res === "W") e.w++; else if (st.res === "D") e.d++; else e.l++;
          acc.set(partner.id, e);
        }
      }
    }
    return Array.from(acc.values()).sort(
      (a, b) => b.pts / Math.max(1, b.played) - a.pts / Math.max(1, a.played) || b.played - a.played,
    );
  }, [teammateQ.data, mode, selected]);
  const bestPartner = teammates.length >= 2 ? teammates[0] : null;
  const worstPartner = teammates.length >= 2 ? teammates[teammates.length - 1] : null;

  if (q.isLoading && !q.data) return <InlineLoading label="Loading…" />;

  return (
    <div className="space-y-5">
      {/* Full-name square matrix */}
      <div>
        <div className="section-head"><span className="section-label">Matrix</span></div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ChipGroup<"winrate" | "played" | "gd" | "wdl" | "ppm" | "rivalry">
            value={matrixMetric}
            onChange={setMatrixMetric}
            ariaLabel="Matrix metric"
            options={[{ key: "winrate", label: "Win %" }, { key: "wdl", label: "W-D-L" }, { key: "ppm", label: "PPM" }, { key: "played", label: "Played" }, { key: "gd", label: "Goal diff" }, { key: "rivalry", label: "Rivalry" }]}
          />
        </div>
        <div className="overflow-x-auto" data-no-swipe-nav>
          <table className="border-separate" style={{ borderSpacing: 3 }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-bg-default" />
                {rows.map((c) => (
                  <th key={c.id} className="p-0 align-bottom">
                    <div className="mx-auto flex h-24 w-11 items-center justify-center overflow-visible">
                      <span className="-rotate-90 whitespace-nowrap text-[11px] font-medium text-text-muted">{c.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th className="sticky left-0 z-10 bg-bg-default pr-2 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(r.id)}
                      className={"block max-w-[120px] truncate text-xs font-medium " + (selected === r.id ? "text-accent" : "text-text-normal hover:text-accent")}
                    >
                      {r.name}
                    </button>
                  </th>
                  {rows.map((c) => {
                    if (r.id === c.id) return <td key={c.id} className="h-11 w-11 rounded bg-bg-card-chip/30" />;
                    const v = cell(r.id, c.id);
                    if (!v) return <td key={c.id} className="h-11 w-11 rounded bg-bg-card-chip/15 text-center text-xs text-text-muted">–</td>;
                    return (
                      <td key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(r.id)}
                          title={`${r.name} vs ${c.name}: ${v.w}-${v.d}-${v.l}`}
                          className="grid h-11 w-11 place-items-center rounded text-xs font-semibold leading-none text-white"
                          style={{ backgroundColor: cellColor(v) }}
                        >
                          {cellText(v)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-player detail */}
      <div className="space-y-2">
        <div className="section-head"><span className="section-label">Head-to-head by player</span></div>
        <PlayerPicker players={rows.map((r) => ({ id: r.id, name: r.name }))} selectedId={selected} onSelect={setSelected} />
        {selected == null ? (
          <div className="text-sm text-text-muted">Pick a player.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="card-chip px-3 py-2">
                <div className="inline-flex items-center gap-2 text-text-muted"><i className="fa-solid fa-face-smile" aria-hidden="true" /><span>Favorite</span></div>
                <div className="mt-0.5 font-semibold">{favorite?.opponent.display_name ?? "—"}</div>
                {favorite ? <div className="mt-0.5 text-text-muted">{favorite.wins}-{favorite.draws}-{favorite.losses} · {favorite.pts_per_match.toFixed(2)} ppm</div> : null}
              </div>
              <div className="card-chip px-3 py-2">
                <div className="inline-flex items-center gap-2 text-text-muted"><i className="fa-solid fa-heart-crack" aria-hidden="true" /><span>Nemesis</span></div>
                <div className="mt-0.5 font-semibold">{nemesis?.opponent.display_name ?? "—"}</div>
                {nemesis ? <div className="mt-0.5 text-text-muted">{nemesis.wins}-{nemesis.draws}-{nemesis.losses} · {nemesis.pts_per_match.toFixed(2)} ppm</div> : null}
              </div>
            </div>
            {detailQ.isLoading && !detailQ.data ? (
              <InlineLoading label="Loading…" />
            ) : vs.length ? (
              <div className="list-divided">
                {vs.map((o) => (
                  <button key={o.opponent.id} type="button" onClick={() => setSelected(o.opponent.id)} className="row row-tap">
                    <span className="min-w-0 flex-1 truncate text-sm text-text-normal">{o.opponent.display_name}</span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted">
                      {o.played}P · <span className="text-status-text-green">{o.wins}</span>-<span className="text-amber-300">{o.draws}</span>-<span className="text-[color:rgb(var(--delta-down)/1)]">{o.losses}</span>
                    </span>
                    <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-accent">{o.played ? Math.round(o.win_rate * 100) : 0}%</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-text-muted">No head-to-head matches for {selName}.</div>
            )}
          </>
        )}
      </div>

      {/* Teammate synergy (2v2) */}
      {mode === "2v2" && selected != null ? (
        <div className="space-y-2">
          <div className="section-head"><span className="section-label">Teammate synergy</span></div>
          {teammateQ.isLoading && !teammateQ.data ? (
            <InlineLoading label="Loading…" />
          ) : teammates.length ? (
            <>
              <p className="text-[11px] text-text-muted">How {selName} performs with each partner (points per match as a duo).</p>
              {bestPartner && worstPartner && bestPartner.id !== worstPartner.id ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="card-chip px-3 py-2">
                    <div className="inline-flex items-center gap-2 text-text-muted"><i className="fa-solid fa-handshake-angle" aria-hidden="true" /><span>Best partner</span></div>
                    <div className="mt-0.5 font-semibold">{bestPartner.name}</div>
                    <div className="mt-0.5 text-text-muted">{bestPartner.w}-{bestPartner.d}-{bestPartner.l} · {(bestPartner.pts / Math.max(1, bestPartner.played)).toFixed(2)} ppm</div>
                  </div>
                  <div className="card-chip px-3 py-2">
                    <div className="inline-flex items-center gap-2 text-text-muted"><i className="fa-solid fa-user-slash" aria-hidden="true" /><span>Toughest pairing</span></div>
                    <div className="mt-0.5 font-semibold">{worstPartner.name}</div>
                    <div className="mt-0.5 text-text-muted">{worstPartner.w}-{worstPartner.d}-{worstPartner.l} · {(worstPartner.pts / Math.max(1, worstPartner.played)).toFixed(2)} ppm</div>
                  </div>
                </div>
              ) : null}
              <div className="list-divided">
                {teammates.map((tm) => (
                  <button key={tm.id} type="button" onClick={() => setSelected(tm.id)} className="row row-tap">
                    <span className="min-w-0 flex-1 truncate text-sm text-text-normal">{tm.name}</span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted">
                      {tm.played}P · <span className="text-status-text-green">{tm.w}</span>-<span className="text-amber-300">{tm.d}</span>-<span className="text-[color:rgb(var(--delta-down)/1)]">{tm.l}</span>
                    </span>
                    <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums text-accent">{(tm.pts / Math.max(1, tm.played)).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="text-sm text-text-muted">No 2v2 matches with a partner yet.</div>
          )}
        </div>
      ) : null}

      {/* Top rivalries */}
      <div className="space-y-2">
        <div className="section-head"><span className="section-label">Top rivalries</span></div>
        <p className="text-[11px] text-text-muted">Most-played and closest matchups — a higher rivalry score means more games and a tighter win balance.</p>
        {topRivalries.map((p) => (
          <button key={`${p.a.id}-${p.b.id}`} type="button" onClick={() => setSelected(p.a.id)}
            className="surface flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-hover-default/30">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text-normal">
                {nameById.get(p.a.id) ?? p.a.display_name} <span className="text-text-muted">vs</span> {nameById.get(p.b.id) ?? p.b.display_name}
              </div>
              <div className="text-[11px] text-text-muted">{p.played} matches · {p.a_wins}-{p.draws}-{p.b_wins}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold tabular-nums text-accent">{Math.round(p.rivalry_score)}</div>
              <div className="text-[11px] text-text-muted">rivalry</div>
            </div>
          </button>
        ))}
        {!topRivalries.length ? <div className="text-sm text-text-muted">No rivalries yet.</div> : null}
      </div>
    </div>
  );
}
