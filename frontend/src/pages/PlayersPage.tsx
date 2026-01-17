import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Card from "../ui/primitives/Card";
import Input from "../ui/primitives/Input";
import Button from "../ui/primitives/Button";

import { useAuth } from "../auth/AuthContext";
import { createPlayer, listPlayers, patchPlayer } from "../api/players.api";
import { getStatsPlayers } from "../api/stats.api";

import type { StatsPlayersResponse, StatsTournamentLite, StatsPlayerRow } from "../api/types";

type SortMode = "overall" | "lastN";

type PlayerLite = {
  id: number;
  display_name: string;
};

function fmtAvg(n: number) {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function fmtInt(n: number) {
  if (!Number.isFinite(n)) return "0";
  return String(Math.trunc(n));
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function parseDateSafe(s?: string | null): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/**
 * Discrete "real gradient" buckets best->worst.
 * (Winner gets special styling.)
 */
function posGradientClass(position: number, total: number) {
  if (total <= 1) return "border-zinc-800/70 bg-zinc-950/40 text-zinc-300";
  const p = clamp((position - 1) / (total - 1), 0, 1); // 0 best .. 1 worst

  const buckets = [
    "border-emerald-400/35 bg-emerald-400/10 text-emerald-200",
    "border-lime-400/30 bg-lime-400/10 text-lime-200",
    "border-amber-400/35 bg-amber-400/10 text-amber-200",
    "border-orange-400/35 bg-orange-400/10 text-orange-200",
    "border-red-500/35 bg-red-500/10 text-red-200",
  ];

  const idx = clamp(Math.round(p * (buckets.length - 1)), 0, buckets.length - 1);
  return buckets[idx];
}

function StatsPill({
  icon,
  label,
  value,
  valueCls = "text-zinc-200",
}: {
  icon: string;
  label: string;
  value: string;
  valueCls?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 py-1">
      <i className={icon + " text-zinc-400"} aria-hidden="true" />
      <span className="text-[11px] text-zinc-600">{label}</span>
      <span className={"text-[11px] font-mono tabular-nums " + valueCls}>{value}</span>
    </span>
  );
}

function Scoreline({
  played,
  wins,
  draws,
  losses,
  gf,
  ga,
  gd,
}: {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
}) {
  const gdCls = gd > 0 ? "text-emerald-300" : gd < 0 ? "text-red-300" : "text-zinc-300";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <StatsPill icon="fa-solid fa-gamepad" label="P" value={fmtInt(played)} />

      <span className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 py-1">
        <span className="inline-flex items-center gap-1">
          <span className="text-[11px] text-zinc-600">W</span>
          <span className="text-[11px] font-mono tabular-nums text-emerald-300">{fmtInt(wins)}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-[11px] text-zinc-600">D</span>
          <span className="text-[11px] font-mono tabular-nums text-amber-300">{fmtInt(draws)}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-[11px] text-zinc-600">L</span>
          <span className="text-[11px] font-mono tabular-nums text-red-300">{fmtInt(losses)}</span>
        </span>
      </span>

      <span className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 py-1">
        <i className="fa-regular fa-futbol text-zinc-400" aria-hidden="true" />
        <span className="text-[11px] text-zinc-600">G</span>
        <span className="text-[11px] font-mono tabular-nums text-zinc-200">
          {fmtInt(gf)}:{fmtInt(ga)}
        </span>
        <span className={"text-[11px] font-mono tabular-nums " + gdCls} title="Goal difference">
          ({gd > 0 ? "+" : ""}
          {fmtInt(gd)})
        </span>
      </span>
    </div>
  );
}

function GlobalTournamentLegend() {
  return (
    <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950/20 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-600">
          <span className="inline-flex items-center gap-2">
            <i className="fa-regular fa-flag text-zinc-500" aria-hidden="true" />
            Tournament positions
          </span>

          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm border border-emerald-400/55 bg-emerald-400/15" />
            <span>best</span>
            <span className="h-2.5 w-2.5 rounded-sm border border-lime-400/45 bg-lime-400/15" />
            <span className="h-2.5 w-2.5 rounded-sm border border-amber-400/55 bg-amber-400/15" />
            <span className="h-2.5 w-2.5 rounded-sm border border-orange-400/55 bg-orange-400/15" />
            <span className="h-2.5 w-2.5 rounded-sm border border-red-500/55 bg-red-500/15" />
            <span>worst</span>
          </span>

          <span className="inline-flex items-center gap-2">
            <span className="inline-flex h-6 w-7 items-center justify-center rounded-xl border border-zinc-900 bg-zinc-950/30 font-mono tabular-nums text-zinc-700">
              —
            </span>
            <span>not played</span>
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-zinc-600">
          <span className="inline-flex items-center gap-2">
            <i className="fa-regular fa-clock text-zinc-500" aria-hidden="true" />
            <span>Old</span>
          </span>
          <div className="h-2 w-20 rounded-full border border-zinc-800 bg-gradient-to-r from-zinc-900/40 to-zinc-200/20" />
          <span className="inline-flex items-center gap-2">
            <span>New</span>
            <i className="fa-regular fa-clock text-zinc-400" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}

function TournamentPositionsGrid({
  tournamentsSorted,
  recencyByTournamentId,
  positionsByTournament,
  cupOwnerId,
  playerId,
}: {
  tournamentsSorted: StatsTournamentLite[];
  recencyByTournamentId: Map<number, number>; // 0..1 (old..new)
  positionsByTournament: Record<number, number | null>;
  cupOwnerId: number | null;
  playerId: number;
}) {
  const showWreath = cupOwnerId != null && cupOwnerId === playerId;

  return (
    <div className="relative w-full">
      {showWreath && (
        <div className="absolute -top-2 -right-2">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-200 shadow-sm"
            title="Current laurel owner"
          >
            <i className="fa-solid fa-crown text-[12px]" aria-hidden="true" />
          </span>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/15 p-2">
        <div className="grid grid-cols-8 gap-1 sm:grid-cols-10 lg:grid-cols-12">
          {tournamentsSorted.length === 0 && (
            <div className="col-span-full rounded-xl border border-zinc-900 bg-zinc-950/30 px-3 py-2 text-xs text-zinc-600">
              No tournaments yet.
            </div>
          )}

          {tournamentsSorted.map((t) => {
            const pos = positionsByTournament?.[t.id] ?? null;
            const title = t.date ? `${t.name} · ${t.date}` : t.name;

            const w = recencyByTournamentId.get(t.id) ?? 0.5;
            // Older slightly dimmer, newer brighter. Keep subtle to avoid “washed out”.
            const opacity = 0.62 + 0.38 * w;

            if (pos == null) {
              return (
                <div
                  key={t.id}
                  title={title + " · did not participate"}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-900 bg-zinc-950/30 text-[11px] font-mono tabular-nums text-zinc-700"
                  style={{ opacity }}
                >
                  —
                </div>
              );
            }

            const total = Number(t.players_count ?? 0) || Math.max(1, pos);
            const isWinner = pos === 1;

            const base =
              "inline-flex h-9 items-center justify-center rounded-xl border text-[11px] font-mono tabular-nums transition " +
              "hover:brightness-110 hover:border-zinc-600/60";

            const cls = isWinner
              ? "border-emerald-500/70 bg-emerald-500/20 text-emerald-100 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
              : posGradientClass(pos, total);

            return (
              <div key={t.id} title={`${title} · position ${pos}/${total}`} className={base + " " + cls} style={{ opacity }}>
                <span>{pos}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SortSegment({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex flex-1 items-center gap-3 px-3 py-2 text-left transition " +
        (active ? "bg-zinc-900/70" : "hover:bg-zinc-900/40")
      }
    >
      <span
        className={
          "inline-flex h-8 w-8 items-center justify-center rounded-xl border " +
          (active ? "border-zinc-700 bg-zinc-950/40" : "border-zinc-800 bg-zinc-950/20")
        }
      >
        <i className={icon + " text-zinc-300"} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <div className={"truncate text-sm " + (active ? "text-zinc-100 font-semibold" : "text-zinc-300")}>{title}</div>
        <div className="truncate text-[11px] text-zinc-500">{subtitle}</div>
      </span>
    </button>
  );
}

export default function PlayersPage() {
  const { role, token } = useAuth();
  const qc = useQueryClient();

  const isAdmin = role === "admin";
  const showControls = isAdmin;

  const [sortMode, setSortMode] = useState<SortMode>("overall");
  const [name, setName] = useState("");

  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers });

  const statsQ = useQuery<StatsPlayersResponse>({
    queryKey: ["stats", "players"],
    queryFn: getStatsPlayers,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      return createPlayer(token, name.trim());
    },
    onSuccess: async () => {
      setName("");
      await qc.invalidateQueries({ queryKey: ["players"] });
      await qc.invalidateQueries({ queryKey: ["stats", "players"] });
    },
  });

  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const patchMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      if (!editId) throw new Error("No player selected");
      const n = editName.trim();
      if (!n) throw new Error("Name cannot be empty");
      return patchPlayer(token, editId, n);
    },
    onSuccess: async () => {
      setEditId(null);
      setEditName("");
      await qc.invalidateQueries({ queryKey: ["players"] });
      await qc.invalidateQueries({ queryKey: ["stats", "players"] });
    },
  });

  const tournaments = statsQ.data?.tournaments ?? [];
  const cupOwnerId = statsQ.data?.cup_owner_player_id ?? null;

  const lastN = useMemo(() => {
    const n = statsQ.data?.lastN;
    if (Number.isFinite(n as any) && (n as number) > 0) return n as number;
    const first = statsQ.data?.players?.[0];
    const d = first?.lastN_pts?.length ?? 10;
    return Math.max(1, d);
  }, [statsQ.data]);

  // Sort tournaments by date (old -> new). If date is missing/unparseable, fall back to id order.
  const tournamentsSorted = useMemo(() => {
    const ts = tournaments.slice();
    ts.sort((a, b) => {
      const da = parseDateSafe(a.date);
      const db = parseDateSafe(b.date);
      if (da != null && db != null) return da - db;
      if (da != null && db == null) return -1;
      if (da == null && db != null) return 1;
      return a.id - b.id;
    });
    return ts;
  }, [tournaments]);

  // Recency weight per tournament id: 0 (old) .. 1 (new)
  const recencyByTournamentId = useMemo(() => {
    const m = new Map<number, number>();
    const n = tournamentsSorted.length;
    if (n <= 1) {
      for (const t of tournamentsSorted) m.set(t.id, 1);
      return m;
    }
    for (let i = 0; i < n; i++) {
      m.set(tournamentsSorted[i].id, i / (n - 1));
    }
    return m;
  }, [tournamentsSorted]);

  const statsById = useMemo(() => {
    const m = new Map<number, StatsPlayerRow>();
    for (const r of statsQ.data?.players ?? []) m.set(r.player_id, r);
    return m;
  }, [statsQ.data]);

  const rows = useMemo(() => {
    const ps = (playersQ.data ?? []) as PlayerLite[];

    const withStats = ps.map((p) => {
      const s =
        statsById.get(p.id) ??
        ({
          player_id: p.id,
          display_name: p.display_name,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          gf: 0,
          ga: 0,
          gd: 0,
          pts: 0,
          lastN_pts: [],
          lastN_avg_pts: 0,
          positions_by_tournament: {},
        } as StatsPlayerRow);

      return { p, s };
    });

    const key = (x: (typeof withStats)[number]) => (sortMode === "overall" ? x.s.pts : x.s.lastN_avg_pts);

    withStats.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (kb !== ka) return kb - ka;
      return a.p.display_name.localeCompare(b.p.display_name);
    });

    return withStats.map((x, idx) => ({ ...x, rank: idx + 1 }));
  }, [playersQ.data, statsById, sortMode]);

  return (
    <div className="space-y-4">
      <Card title={`Players${isAdmin ? " (Admin)" : ""}`}>
        {showControls && (
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              label="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hans Knauss"
            />
            <div className="flex items-end gap-2">
              <Button onClick={() => createMut.mutate()} disabled={!name.trim() || createMut.isPending}>
                <i className="fa fa-plus md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">{createMut.isPending ? "Creating…" : "Create"}</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  qc.invalidateQueries({ queryKey: ["players"] });
                  qc.invalidateQueries({ queryKey: ["stats", "players"] });
                }}
                title="Refresh"
              >
                <i className="fa fa-refresh md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">Refresh</span>
              </Button>
            </div>
          </div>
        )}

        {createMut.error && <div className="mt-2 text-sm text-red-400">{String(createMut.error)}</div>}

        {/* sort control */}
        <div className="mt-4 space-y-2">
          <div className="text-xs text-zinc-500 inline-flex items-center gap-2">
            <i className="fa-solid fa-arrow-down-wide-short" aria-hidden="true" />
            Sort & primary metric
          </div>

          <div className="flex overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/30">
            <SortSegment
              active={sortMode === "overall"}
              onClick={() => setSortMode("overall")}
              icon="fa-solid fa-trophy"
              title="Overall points"
              subtitle="Rank by total points"
            />
            <div className="w-px bg-zinc-800" />
            <SortSegment
              active={sortMode === "lastN"}
              onClick={() => setSortMode("lastN")}
              icon="fa-solid fa-chart-line"
              title={`Last ${lastN} avg`}
              subtitle="Rank by recent form"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span className="inline-flex items-center gap-2">
              {sortMode === "overall" ? (
                <>
                  <i className="fa-solid fa-trophy text-zinc-400" aria-hidden="true" />
                  Showing: total points
                </>
              ) : (
                <>
                  <i className="fa-solid fa-chart-line text-zinc-400" aria-hidden="true" />
                  Showing: last {lastN} average
                </>
              )}
            </span>

            <span className="inline-flex items-center gap-2">
              {statsQ.isLoading ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
                  Stats: loading…
                </>
              ) : statsQ.error ? (
                <>
                  <i className="fa-solid fa-triangle-exclamation text-red-300" aria-hidden="true" />
                  Stats: error
                </>
              ) : (
                <>
                  <i className="fa-regular fa-circle-check text-emerald-300" aria-hidden="true" />
                  Stats: updated
                </>
              )}
            </span>
          </div>
        </div>

        {/* Global legend once */}
        <GlobalTournamentLegend />

        <div className="mt-5 space-y-3">
          {playersQ.isLoading && <div className="text-zinc-400">Loading…</div>}
          {playersQ.error && <div className="text-red-400 text-sm">{String(playersQ.error)}</div>}

          {rows.map(({ p, s, rank }) => {
            const primary =
              sortMode === "overall"
                ? { label: "Points", value: String(s.pts), suffix: "P", icon: "fa-solid fa-trophy" }
                : { label: `Last ${lastN} avg`, value: fmtAvg(s.lastN_avg_pts), suffix: "P", icon: "fa-solid fa-chart-line" };

            return (
              <div
                key={p.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-950/10 px-4 py-4 hover:bg-zinc-900/15"
              >
                {/* Header: aligned top, visually consistent */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="inline-flex h-7 min-w-[2.75rem] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/40 px-2 text-xs font-mono tabular-nums text-zinc-200">
                        #{rank}
                      </span>
                      <div className="truncate text-lg font-semibold leading-tight text-zinc-100">{p.display_name}</div>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 inline-flex items-center gap-2">
                      <i className="fa-regular fa-calendar text-zinc-500" aria-hidden="true" />
                      positions (old → new)
                    </div>
                  </div>

                  {/* Metric box: align to top, not “floating” */}
                  <div className="self-start rounded-2xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-right">
                    <div className="text-[10px] leading-tight text-zinc-500 inline-flex items-center justify-end gap-2">
                      <i className={primary.icon + " text-zinc-400"} aria-hidden="true" />
                      <span>{primary.label}</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold leading-none text-zinc-100">
                      {primary.value}
                      <span className="ml-1 text-xs font-medium text-zinc-500">{primary.suffix}</span>
                    </div>
                  </div>
                </div>

                {/* Tournament grid full width + recency */}
                <div className="mt-3">
                  <TournamentPositionsGrid
                    tournamentsSorted={tournamentsSorted}
                    recencyByTournamentId={recencyByTournamentId}
                    positionsByTournament={s.positions_by_tournament ?? {}}
                    cupOwnerId={cupOwnerId}
                    playerId={p.id}
                  />
                </div>

                {/* Stats */}
                <Scoreline
                  played={s.played}
                  wins={s.wins}
                  draws={s.draws}
                  losses={s.losses}
                  gf={s.gf}
                  ga={s.ga}
                  gd={s.gd}
                />

                {/* Admin */}
                {showControls && (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditId(p.id);
                        setEditName(p.display_name);
                      }}
                      type="button"
                      title="Edit player"
                    >
                      <i className="fa fa-edit md:hidden" aria-hidden="true" />
                      <span className="hidden md:inline">Edit</span>
                    </Button>
                  </div>
                )}

                {editId === p.id && (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <Input label="New name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <Button onClick={() => patchMut.mutate()} disabled={patchMut.isPending} type="button">
                      {patchMut.isPending ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditId(null);
                        setEditName("");
                      }}
                      type="button"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {patchMut.error && <div className="mt-3 text-sm text-red-400">{String(patchMut.error)}</div>}
      </Card>
    </div>
  );
}
