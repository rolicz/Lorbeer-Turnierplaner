import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "../ui/primitives/Card";
import Input from "../ui/primitives/Input";
import Button from "../ui/primitives/Button";
import { useAuth } from "../auth/AuthContext";
import { createClub, listClubs, patchClub } from "../api/clubs.api";

export default function ClubsPage() {
  const { token } = useAuth();
  const qc = useQueryClient();

  const [game, setGame] = useState("EA FC 26");
  const q = useQuery({ queryKey: ["clubs", game], queryFn: () => listClubs(game) });

  const [name, setName] = useState("");
  const [stars, setStars] = useState("4.0");

  const createMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      return createClub(token, { name: name.trim(), game: game.trim(), star_rating: Number(stars) });
    },
    onSuccess: async () => {
      setName("");
      await qc.invalidateQueries({ queryKey: ["clubs", game] });
    }
  });

  const [editId, setEditId] = useState<number | null>(null);
  const [editStars, setEditStars] = useState("4.0");

  const patchMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      if (!editId) throw new Error("No club selected");
      return patchClub(token, editId, { star_rating: Number(editStars) });
    },
    onSuccess: async () => {
      setEditId(null);
      await qc.invalidateQueries({ queryKey: ["clubs", game] });
    }
  });

  const clubs = q.data ?? [];
  const editingClub = useMemo(() => clubs.find(c => c.id === editId) || null, [clubs, editId]);

  return (
    <div className="space-y-4">
      <Card title="Clubs (Teams)">
        <div className="grid gap-3 md:grid-cols-3">
          <Input label="Game" value={game} onChange={(e) => setGame(e.target.value)} />
          <Input label="Club name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sturm Graz" />
          <Input label="Stars (0.5–5.0)" value={stars} onChange={(e) => setStars(e.target.value)} hint="Steps of 0.5" />
        </div>
        {createMut.error && <div className="mt-2 text-sm text-red-400">{String(createMut.error)}</div>}
        <div className="mt-3">
          <Button onClick={() => createMut.mutate()} disabled={!name.trim() || !game.trim() || createMut.isPending}>
            {createMut.isPending ? "Creating…" : "Create"}
          </Button>
          <Button variant="ghost" className="ml-2" onClick={() => qc.invalidateQueries({ queryKey: ["clubs", game] })}>
            Refresh
          </Button>
        </div>

        <div className="mt-5 space-y-2">
          {q.isLoading && <div className="text-zinc-400">Loading…</div>}
          {q.error && <div className="text-red-400 text-sm">{String(q.error)}</div>}
          {clubs.map(c => (
            <div key={c.id} className="rounded-xl border border-zinc-800 px-4 py-3 hover:bg-zinc-900/20">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="text-xs text-zinc-500">{c.game}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-zinc-300">{c.star_rating}★</div>
                  <Button
                    variant="ghost"
                    onClick={() => { setEditId(c.id); setEditStars(String(c.star_rating)); }}
                    type="button"
                  >
                    Edit
                  </Button>
                </div>
              </div>

              {editId === c.id && (
                <div className="mt-3 flex items-end gap-2">
                  <Input label="New stars" value={editStars} onChange={(e) => setEditStars(e.target.value)} />
                  <Button onClick={() => patchMut.mutate()} disabled={patchMut.isPending}>
                    {patchMut.isPending ? "Saving…" : "Save"}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditId(null)} type="button">Cancel</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
