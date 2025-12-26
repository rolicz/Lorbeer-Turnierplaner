import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "../ui/primitives/Card";
import Button from "../ui/primitives/Button";
import Input from "../ui/primitives/Input";
import Modal from "../ui/primitives/Modal";
import { listTournaments, createTournament, generateSchedule } from "../api/tournaments.api";
import { listPlayers } from "../api/players.api";
import { useAuth } from "../auth/AuthContext";

export default function TournamentsPage() {
  const qc = useQueryClient();
  const { role, token } = useAuth();
  const canWrite = role === "editor" || role === "admin";

  const tournamentsQ = useQuery({ queryKey: ["tournaments"], queryFn: listTournaments });
  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers, enabled: canWrite });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"1v1" | "2v2">("1v1");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const selectedIds = useMemo(() => Object.entries(selected).filter(([,v]) => v).map(([k]) => Number(k)), [selected]);

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
    }
  });

  return (
    <div className="space-y-4">
      <Card title="Tournaments">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-zinc-400">Active + past tournaments.</div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["tournaments"] })}>Refresh</Button>
            {canWrite && <Button onClick={() => setOpen(true)}>New</Button>}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {tournamentsQ.isLoading && <div className="text-zinc-400">Loading…</div>}
          {tournamentsQ.error && <div className="text-red-400 text-sm">{String(tournamentsQ.error)}</div>}
          {tournamentsQ.data?.map(t => (
            <Link
              key={t.id}
              to={`/live/${t.id}`}
              className="block rounded-xl border border-zinc-800 px-4 py-3 hover:bg-zinc-900/40"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{t.name}</div>
                <div className="text-sm text-zinc-400">{t.mode} · {t.status}</div>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      <Modal open={open} title="Create Tournament" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Friday Cup" />
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`rounded-xl border px-3 py-2 text-sm ${mode==="1v1" ? "border-zinc-600 bg-zinc-900" : "border-zinc-800 hover:bg-zinc-900/40"}`}
              onClick={() => setMode("1v1")}
              type="button"
            >
              1v1
            </button>
            <button
              className={`rounded-xl border px-3 py-2 text-sm ${mode==="2v2" ? "border-zinc-600 bg-zinc-900" : "border-zinc-800 hover:bg-zinc-900/40"}`}
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
              {playersQ.data?.map(p => (
                <label key={p.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 px-2 py-2 text-sm hover:bg-zinc-900/30">
                  <input
                    type="checkbox"
                    checked={!!selected[p.id]}
                    onChange={(e) => setSelected(prev => ({ ...prev, [p.id]: e.target.checked }))}
                  />
                  <span className="truncate">{p.display_name}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 text-xs text-zinc-500">Selected: {selectedIds.length}</div>
          </div>

          {createMut.error && (
            <div className="text-sm text-red-400">{String(createMut.error)}</div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} type="button">Cancel</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} type="button">
              {createMut.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
