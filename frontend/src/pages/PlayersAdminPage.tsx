import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "../ui/primitives/Card";
import Input from "../ui/primitives/Input";
import Button from "../ui/primitives/Button";
import { useAuth } from "../auth/AuthContext";
import { createPlayer, listPlayers, patchPlayer } from "../api/players.api";

export default function PlayersAdminPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["players"], queryFn: listPlayers });

  const [name, setName] = useState("");

  const createMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      return createPlayer(token, name.trim());
    },
    onSuccess: async () => {
      setName("");
      await qc.invalidateQueries({ queryKey: ["players"] });
    },
  });

  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const editingPlayer = useMemo(
    () => (q.data ?? []).find((p) => p.id === editId) || null,
    [q.data, editId]
  );

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
    },
  });

  return (
    <Card title="Players (Admin)">
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
          <Button variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["players"] })} title="Refresh">
            <i className="fa fa-refresh md:hidden" aria-hidden="true" />
            <span className="hidden md:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {createMut.error && <div className="mt-2 text-sm text-red-400">{String(createMut.error)}</div>}

      <div className="mt-5 space-y-2">
        {q.isLoading && <div className="text-zinc-400">Loading…</div>}
        {q.error && <div className="text-red-400 text-sm">{String(q.error)}</div>}

        {q.data?.map((p) => (
          <div key={p.id} className="rounded-xl border border-zinc-800 px-4 py-3 hover:bg-zinc-900/20">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{p.display_name}</div>
                <div className="text-xs text-zinc-500">#{p.id}</div>
              </div>

              <Button
                variant="ghost"
                onClick={() => {
                  setEditId(p.id);
                  setEditName(p.display_name);
                }}
                type="button"
              >
                <i className="fa fa-edit md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">Edit</span>
              </Button>
            </div>

            {editId === p.id && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Input
                  label="New name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
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

      {patchMut.error && (
        <div className="mt-3 text-sm text-red-400">
          {String(patchMut.error)}
          {editingPlayer ? (
            <div className="text-xs text-zinc-500 mt-1">
              Trying to rename #{editingPlayer.id}.
              If backend enforces unique names, duplicates will fail with 409.
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
