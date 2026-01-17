import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Card from "../ui/primitives/Card";
import Input from "../ui/primitives/Input";
import Button from "../ui/primitives/Button";

import { useAuth } from "../auth/AuthContext";
import { createPlayer, listPlayers, patchPlayer } from "../api/players.api";
import { getStatsPlayers } from "../api/stats.api";

import type { StatsPlayersResponse, StatsTournamentLite, StatsPlayerRow } from "../api/types";

type SortMode = "overall" | "last5";

type PlayerLite = {
  id: number;
  display_name: string;
};

function fmtAvg(n: number) {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function posClass(position: number, total: number) {
  // bucketed red -> amber -> emerald
  if (total <= 1) return "border-zinc-800 bg-zinc-950/40 text-zinc-300";
  const p = (position - 1) / (total - 1); // 0 best .. 1 worst
  if (p <= 0.20) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (p <= 0.55) return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-red-500/40 bg-red-500/10 text-red-300";
}

function TournamentPositionsRow({
  tournaments,
  positionsByTournament,
  cupOwnerId,
  playerId,
}: {
  tournaments: StatsTournamentLite[];
  positionsByTournament: Record<number, number | null>;
  cupOwnerId: number | null;
  playerId: number;
}) {
  if (!tournaments.length) return <div className="text-xs text-zinc-600">—</div>;

  const showWreath = cupOwnerId != null && cupOwnerId === playerId;

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="flex min-w-max items-center gap-1">
        {tournaments.map((t) => {
          const pos = positionsByTournament?.[t.id] ?? null;
          const title = t.date ? `${t.name} · ${t.date}` : t.name;

          if (pos == null) {
            return (
              <span
                key={t.id}
                title={title + " · did not participate"}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-900 bg-zinc-950/30 text-[11px] font-mono tabular-nums text-zinc-700"
              >
                —
              </span>
            );
          }

          const total = Number(t.players_count ?? 0) || Math.max(1, pos);
          const cls = posClass(pos, total);

          return (
            <span
              key={t.id}
              title={`${title} · position ${pos}/${total}`}
              className={
                "relative inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] font-mono tabular-nums " +
                cls
              }
            >
              {showWreath && (
                <i
                  className="fa fa-crown absolute right-0 top-0 translate-x-1/2 -translate-y-1/2 text-[10px] text-amber-300 pt-2 pr-2"
                  aria-hidden="true"
                  title="Current laurel owner"
                />
              )}
              <span>{pos}</span>
            </span>
          );
        })}
      </div>
    </div>
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

  console.log("cupOwnerId:");
  console.log(cupOwnerId)

  // lastN for label (backend doesn’t send N explicitly in this shape)
  const lastN = useMemo(() => {
    const first = statsQ.data?.players?.[0];
    const n = first?.lastN_pts?.length ?? 5;
    return Math.max(1, n);
  }, [statsQ.data]);

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

        {/* sort + status */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="text-xs text-zinc-500">Sort:</div>
            <div className="inline-flex overflow-hidden rounded-xl border border-zinc-800">
              <button
                type="button"
                onClick={() => setSortMode("overall")}
                className={"px-3 py-2 text-sm transition " + (sortMode === "overall" ? "bg-zinc-900" : "hover:bg-zinc-900/60")}
              >
                Overall points
              </button>
              <button
                type="button"
                onClick={() => setSortMode("last5")}
                className={"px-3 py-2 text-sm transition " + (sortMode === "last5" ? "bg-zinc-900" : "hover:bg-zinc-900/60")}
              >
                Last {lastN} average
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500">
            {statsQ.isLoading ? (
              <span>Stats: loading…</span>
            ) : statsQ.error ? (
              <span className="text-red-400">Stats: error</span>
            ) : (
              <span>Stats: updated</span>
            )}
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {playersQ.isLoading && <div className="text-zinc-400">Loading…</div>}
          {playersQ.error && <div className="text-red-400 text-sm">{String(playersQ.error)}</div>}

          {rows.map(({ p, s, rank }) => (
            <div key={p.id} className="rounded-xl border border-zinc-800 px-4 py-3 hover:bg-zinc-900/20">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/40 px-2 text-xs font-mono tabular-nums text-zinc-300">
                      #{rank}
                    </span>
                    <div className="truncate text-sm font-medium">{p.display_name}</div>
                  </div>

                  {/* tournament positions row */}
                  <div className="mt-2">
                    <TournamentPositionsRow
                      tournaments={tournaments}
                      positionsByTournament={s.positions_by_tournament ?? {}}
                      cupOwnerId={cupOwnerId}
                      playerId={p.id}
                    />
                  </div>
                </div>

                <div className="shrink-0 flex items-start gap-2">
                  {sortMode === "overall" && (
                    <div className="text-right">
                      <div className="text-xs font-mono tabular-nums text-zinc-300">
                        <span className="font-bold">{s.pts}</span> P
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-zinc-500">
                        {fmtAvg(s.lastN_avg_pts)} P
                      </div>
                    </div>
                  )}
                  {sortMode === "last5" && (
                    <div className="text-right">
                      <div className="text-xs font-mono tabular-nums text-zinc-300">
                        <span className="font-bold">{fmtAvg(s.lastN_avg_pts)}</span> P
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-zinc-500">
                        {s.pts} P
                      </div>
                    </div>
                  )}

                  {showControls && (
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
                  )}
                </div>
              </div>

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
          ))}
        </div>

        {patchMut.error && <div className="mt-3 text-sm text-red-400">{String(patchMut.error)}</div>}
      </Card>
    </div>
  );
}

