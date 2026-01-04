import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "../ui/primitives/Card";
import Button from "../ui/primitives/Button";
import Input from "../ui/primitives/Input";
import Modal from "../ui/primitives/Modal";
import { Pill, statusPill } from "../ui/primitives/Pill"; // ⬅ add statusPill
import { listTournaments, createTournament, generateSchedule } from "../api/tournaments.api";
import { listPlayers } from "../api/players.api";
import { useAuth } from "../auth/AuthContext";
import { fmtDate } from "../utils/format";


import { useAnyTournamentWS } from "../hooks/useTournamentWS";

type Status = "draft" | "live" | "done";

function statusUI(status: Status) {
  switch (status) {
    case "live":
      return {
        bar: "bg-emerald-500/70",
        label: "LIVE",
      };
    case "draft":
      return {
        bar: "bg-sky-500/70",
        label: "DRAFT",
      };
    case "done":
    default:
      return {
        bar: "bg-zinc-700/60",
        label: "DONE",
      };
  }
}


// Best-effort winner label (depends on what your /tournaments list returns)
function winnerLabel(t: any): string | null {
  if(t.winner_string) {
    return t.winner_string;
  } 
  else if(t.winner_decider_string) {
    return t.winner_decider_string + " (decider)";
  }
  return null;
}

export default function TournamentsPage() {
  const qc = useQueryClient();
  const { role, token } = useAuth();
  const canWrite = role === "editor" || role === "admin";

  const tournamentsQ = useQuery({ queryKey: ["tournaments"], queryFn: listTournaments });
  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers, enabled: canWrite });

  useAnyTournamentWS();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"1v1" | "2v2">("1v1");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)),
    [selected]
  );

  // Sort tournaments by date (newest first), fallback to created_at
  const tournamentsSorted = useMemo(() => {
    const ts = tournamentsQ.data ?? [];
    const key = (t: any) => {
      const d = t.date ? `${t.date}T00:00:00` : t.created_at ?? null;
      const ms = d ? new Date(d).getTime() : 0;
      return Number.isFinite(ms) ? ms : 0;
    };

    return ts.slice().sort((a: any, b: any) => {
      const da = key(a);
      const db = key(b);
      if (db !== da) return db - da;
      const ia = typeof a.id === "number" ? a.id : 0;
      const ib = typeof b.id === "number" ? b.id : 0;
      return ib - ia;
    });
  }, [tournamentsQ.data]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      if (!name.trim()) throw new Error("Name missing");
      if (selectedIds.length < 3) throw new Error("Select at least 3 players");
      const created = await createTournament(token, { name: name.trim(), mode, player_ids: selectedIds });
      await generateSchedule(token, created.id, true);
      return created.id;
    },
    onSuccess: async () => {
      setOpen(false);
      setName("");
      setSelected({});
      await qc.invalidateQueries({ queryKey: ["tournaments"] });
    },
  });

  return (
    <div className="space-y-4">
      <Card title="Tournaments" variant="plain">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-zinc-400">Active + past tournaments.</div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["tournaments"] })} title="Refresh">
              <i className="fa fa-refresh md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Refresh</span>
            </Button>
            {canWrite && <Button onClick={() => setOpen(true)} title="New Tournament">
              <i className="fa fa-plus md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">New</span>
            </Button>}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {tournamentsQ.isLoading && <div className="text-zinc-400">Loading…</div>}
          {tournamentsQ.error && <div className="text-red-400 text-sm">{String(tournamentsQ.error)}</div>}

          {tournamentsSorted.map((t: any) => {
            const st: Status = (t.status as Status) ?? "draft";
            const ui = statusUI(st);
            const winner = winnerLabel(t);

            // “Current live tournament” -> green emphasis (also adds a subtle background)
            const isLive = st === "live";
            const isDraft = st === "draft";

            return (
              <Link
                key={t.id}
                to={`/live/${t.id}`}
                className={[
                  "relative block overflow-hidden rounded-xl border px-4 py-3 transition",
                  "hover:bg-zinc-900/40",
                  isLive ? "border-emerald-500/30 bg-emerald-500/5" : "",
                  isDraft ? "border-sky-500/30" : "border-zinc-800",
                ].join(" ")}
              >
                {/* left accent bar */}
                <div className={`absolute left-0 top-0 h-full w-1 ${ui.bar}`} />

                <div className="pl-1">
                  {/* Row 1: name + small mode pill */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-zinc-100 sm:text-base">
                        {t.name}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <Pill title="Mode">
                        {t.mode === "2v2" ? "2v2" : "1v1"}
                      </Pill>
                    </div>
                  </div>

                  {/* Row 2: pills (responsive) */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Pill className={statusPill(st)} title={ui.label}>
                      <span>{ui.label}</span>
                    </Pill>

                    <Pill title="Date">
                      <span className="font-mono tabular-nums">{fmtDate(t.date)}</span>
                    </Pill>

                    {winner && (
                      <Pill title="Winner">
                        <span>
                          <i className="fa fa-trophy text-yellow-400 mr-1" aria-hidden="true" />
                        </span>
                        <span className="max-w-[160px] truncate sm:max-w-[260px]">{winner}</span>
                      </Pill>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>

      <Modal open={open} title="Create Tournament" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday Cup" />
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`rounded-xl border px-3 py-2 text-sm ${
                mode === "1v1" ? "border-zinc-600 bg-zinc-900" : "border-zinc-800 hover:bg-zinc-900/40"
              }`}
              onClick={() => setMode("1v1")}
              type="button"
            >
              1v1
            </button>
            <button
              className={`rounded-xl border px-3 py-2 text-sm ${
                mode === "2v2" ? "border-zinc-600 bg-zinc-900" : "border-zinc-800 hover:bg-zinc-900/40"
              }`}
              onClick={() => setMode("2v2")}
              type="button"
            >
              2v2
            </button>
          </div>

          <div className="rounded-xl border border-zinc-800 p-3">
            <div className="mb-2 text-sm font-medium">Players</div>
            {playersQ.isLoading && <div className="text-sm text-zinc-400">Loading players…</div>}
            {playersQ.error && <div className="text-sm text-red-400">{String(playersQ.error)}</div>}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {playersQ.data?.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-zinc-800 px-2 py-2 text-sm hover:bg-zinc-900/30"
                >
                  <input
                    type="checkbox"
                    checked={!!selected[p.id]}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                  />
                  <span className="truncate">{p.display_name}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 text-xs text-zinc-500">Selected: {selectedIds.length}</div>
          </div>

          {createMut.error && <div className="text-sm text-red-400">{String(createMut.error)}</div>}

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} type="button">
              <i className="fa fa-times md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Cancel</span>
            </Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} type="button">
              <i className="fa fa-check ml-1 md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">{createMut.isPending ? "Creating…" : "Create"}</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
