import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "../ui/primitives/Card";
import Input from "../ui/primitives/Input";
import Button from "../ui/primitives/Button";
import { useAuth } from "../auth/AuthContext";
import { createPlayer, listPlayers } from "../api/players.api";

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
    }
  });

  return (
    <Card title="Players (Admin)">
      <div className="grid gap-3 md:grid-cols-3">
        <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Roland" />
        <div className="flex items-end gap-2">
          <Button onClick={() => createMut.mutate()} disabled={!name.trim() || createMut.isPending}>
            {createMut.isPending ? "Creating…" : "Create"}
          </Button>
          <Button variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["players"] })}>Refresh</Button>
        </div>
      </div>

      {createMut.error && <div className="mt-2 text-sm text-red-400">{String(createMut.error)}</div>}

      <div className="mt-5 space-y-2">
        {q.isLoading && <div className="text-zinc-400">Loading…</div>}
        {q.error && <div className="text-red-400 text-sm">{String(q.error)}</div>}
        {q.data?.map(p => (
          <div key={p.id} className="rounded-xl border border-zinc-800 px-4 py-3">
            <div className="text-sm">{p.display_name}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
