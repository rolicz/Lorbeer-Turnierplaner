/** Shared standings data + table column definitions (used by StatsInsights and StatsTable). */
import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getStatsRatings, getStatsPlayers } from "../../api/stats.api";
import type { Match, StatsScope } from "../../api/types";
import type { StatsMode } from "./StatsControls";

export type Row = {
  id: number; name: string; pts: number; rating: number;
  played: number; wins: number; draws: number; losses: number;
  gf: number; ga: number; gd: number; form: number[]; formAvg: number;
};

// ---- shared data ----------------------------------------------------------
export function useStandings(mode: StatsMode, scope: StatsScope) {
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
export function sideOf(m: Match, pid: number): "A" | "B" | null {
  const a = m.sides.find((s) => s.side === "A");
  const b = m.sides.find((s) => s.side === "B");
  if (a?.players.some((p) => p.id === pid)) return "A";
  if (b?.players.some((p) => p.id === pid)) return "B";
  return null;
}
export function matchStats(m: Match, pid: number): { pts: number; gf: number; ga: number; res: "W" | "D" | "L" } | null {
  if (m.state !== "finished") return null;
  const side = sideOf(m, pid);
  if (!side) return null;
  const me = m.sides.find((s) => s.side === side)!;
  const opp = m.sides.find((s) => s.side !== side)!;
  const mg = Number(me.goals ?? 0), og = Number(opp.goals ?? 0);
  const res = mg > og ? "W" : mg < og ? "L" : "D";
  return { pts: res === "W" ? 3 : res === "D" ? 1 : 0, gf: mg, ga: og, res };
}

// ---- table columns --------------------------------------------------------
export type ColDef = {
  key: string;
  label: string;
  val: (r: Row) => number;
  fmt: (n: number, r: Row) => string;
  cls?: string;
  bold?: boolean;
};

export const f2 = (n: number) => n.toFixed(2);
export const TABLE_COLS: ColDef[] = [
  { key: "pts", label: "Pts", val: (r) => r.pts, fmt: (n) => String(n), bold: true },
  { key: "ppm", label: "PPM", val: (r) => (r.played ? r.pts / r.played : 0), fmt: (_n, r) => (r.played ? f2(r.pts / r.played) : "—") },
  { key: "played", label: "P", val: (r) => r.played, fmt: (n) => String(n), cls: "text-text-muted" },
  { key: "wins", label: "W", val: (r) => r.wins, fmt: (n) => String(n), cls: "text-status-text-green" },
  { key: "draws", label: "D", val: (r) => r.draws, fmt: (n) => String(n), cls: "text-amber-300" },
  { key: "losses", label: "L", val: (r) => r.losses, fmt: (n) => String(n), cls: "text-[color:rgb(var(--delta-down)/1)]" },
  { key: "winrate", label: "Win%", val: (r) => (r.played ? r.wins / r.played : 0), fmt: (_n, r) => (r.played ? `${Math.round((r.wins / r.played) * 100)}%` : "—") },
  { key: "gf", label: "GF", val: (r) => r.gf, fmt: (n) => String(n) },
  { key: "ga", label: "GA", val: (r) => r.ga, fmt: (n) => String(n) },
  { key: "gpm", label: "G/M", val: (r) => (r.played ? r.gf / r.played : 0), fmt: (_n, r) => (r.played ? f2(r.gf / r.played) : "—"), cls: "text-text-muted" },
  { key: "gapm", label: "GA/M", val: (r) => (r.played ? r.ga / r.played : 0), fmt: (_n, r) => (r.played ? f2(r.ga / r.played) : "—"), cls: "text-text-muted" },
  { key: "gd", label: "GD", val: (r) => r.gd, fmt: (n) => (n >= 0 ? `+${n}` : String(n)) },
  { key: "gdpm", label: "GD/M", val: (r) => (r.played ? r.gd / r.played : 0), fmt: (_n, r) => (r.played ? (r.gd >= 0 ? "+" : "") + f2(r.gd / r.played) : "—"), cls: "text-text-muted" },
  { key: "rating", label: "Elo", val: (r) => r.rating, fmt: (n) => String(Math.round(n)) },
];
export const DEFAULT_COLS = ["pts", "ppm", "played", "winrate", "rating"];
// Chip controls — W/D/L and the goal trios each toggle together as one group.
export const COL_CHIPS: { label: string; cols: string[] }[] = [
  { label: "Pts", cols: ["pts"] },
  { label: "PPM", cols: ["ppm"] },
  { label: "P", cols: ["played"] },
  { label: "W-D-L", cols: ["wins", "draws", "losses"] },
  { label: "Win%", cols: ["winrate"] },
  { label: "GF-GA-GD", cols: ["gf", "ga", "gd"] },
  { label: "GF-GA-GD /m", cols: ["gpm", "gapm", "gdpm"] },
  { label: "Elo", cols: ["rating"] },
];
