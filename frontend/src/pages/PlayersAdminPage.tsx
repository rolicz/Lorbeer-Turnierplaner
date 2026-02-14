import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Card from "../ui/primitives/Card";
import Input from "../ui/primitives/Input";
import Button from "../ui/primitives/Button";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";
import AvatarCircle from "../ui/primitives/AvatarCircle";

import { useAuth } from "../auth/AuthContext";
import { createPlayer, listPlayerProfiles, listPlayers, patchPlayer } from "../api/players.api";
import { usePlayerAvatarMap } from "../hooks/usePlayerAvatarMap";

export default function PlayersAdminPage() {
  const { token, role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers });
  const profilesQ = useQuery({ queryKey: ["players", "profiles"], queryFn: listPlayerProfiles });
  const { avatarUpdatedAtById: avatarUpdatedAtByPlayerId } = usePlayerAvatarMap();

  const [newName, setNewName] = useState("");
  const createMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      if (!isAdmin) throw new Error("Admin only");
      return createPlayer(token, newName.trim());
    },
    onSuccess: async () => {
      setNewName("");
      await qc.invalidateQueries({ queryKey: ["players"] });
      await qc.invalidateQueries({ queryKey: ["stats"] });
      await qc.invalidateQueries({ queryKey: ["cup"] });
    },
  });

  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const patchMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
      if (!isAdmin) throw new Error("Admin only");
      if (!editId) throw new Error("No player selected");
      const n = editName.trim();
      if (!n) throw new Error("Name cannot be empty");
      return patchPlayer(token, editId, n);
    },
    onSuccess: async () => {
      setEditId(null);
      setEditName("");
      await qc.invalidateQueries({ queryKey: ["players"] });
      await qc.invalidateQueries({ queryKey: ["stats"] });
      await qc.invalidateQueries({ queryKey: ["cup"] });
    },
  });

  const players = playersQ.data ?? [];
  const bioByPlayerId = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of profilesQ.data ?? []) {
      map.set(Number(p.player_id), p.bio ?? "");
    }
    return map;
  }, [profilesQ.data]);

  return (
    <div className="page">
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <i className="fa-solid fa-screwdriver-wrench text-text-muted" aria-hidden="true" />
            Players
          </span>
        }
        variant="outer"
        bodyClassName="space-y-3"
      >
        <ErrorToastOnError error={createMut.error} title="Could not create player" />
        <ErrorToastOnError error={playersQ.error} title="Players loading failed" />
        <ErrorToastOnError error={patchMut.error} title="Could not save player" />
        {isAdmin ? (
          <div className="panel-subtle p-3 space-y-2">
            <div className="text-xs text-text-muted">Create player</div>
            <div className="flex flex-wrap items-end gap-2">
              <Input label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Button
                type="button"
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !newName.trim()}
                title="Create"
              >
                {createMut.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="panel-subtle rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 items-center gap-2 border-b border-border-card-inner bg-bg-card-chip/20 px-3 py-2 text-[11px] text-text-muted">
            <div className="col-span-8">Player</div>
            <div className="col-span-4 text-right">Actions</div>
          </div>

          {playersQ.isLoading ? <div className="px-3 py-3 text-text-muted">Loading…</div> : null}

          {players.map((p, idx) => {
            const zebra = idx % 2 === 0 ? "bg-table-row-a" : "bg-table-row-b";
            const updatedAt = avatarUpdatedAtByPlayerId.get(p.id) ?? null;
            const editing = editId === p.id;
            const bio = bioByPlayerId.get(p.id)?.trim() ?? "";

            return (
              <div key={p.id} className={"border-b border-border-card-inner last:border-b-0 " + zebra}>
                <div className="grid grid-cols-12 items-center gap-2 px-3 py-2">
                  <div className="col-span-8 min-w-0 flex items-center gap-2">
                    <Link to={`/profiles/${p.id}`} className="shrink-0" title={`Open profile: ${p.display_name}`}>
                      <AvatarCircle playerId={p.id} name={p.display_name} updatedAt={updatedAt} sizeClass="h-10 w-10" />
                    </Link>
                    <div className="min-w-0">
                      <div className="truncate text-text-normal font-semibold">{p.display_name}</div>
                      {bio ? <div className="truncate text-[11px] text-text-muted">{bio}</div> : null}
                    </div>
                  </div>

                  <div className="col-span-4 flex items-center justify-end gap-2">
                    <Link
                      to={`/profiles/${p.id}`}
                      className="btn-base btn-ghost inline-flex h-10 items-center justify-center px-3"
                      title="Open profile"
                    >
                      <i className="fa-solid fa-user md:hidden" aria-hidden="true" />
                      <span className="hidden md:inline">Profile</span>
                    </Link>
                    {!editing && isAdmin ? (
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() => {
                          setEditId(p.id);
                          setEditName(p.display_name);
                        }}
                        title="Rename"
                      >
                        <i className="fa-solid fa-pen md:hidden" aria-hidden="true" />
                        <span className="hidden md:inline">Rename</span>
                      </Button>
                    ) : null}
                    {editing && isAdmin ? (
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() => {
                          setEditId(null);
                          setEditName("");
                        }}
                        title="Cancel"
                      >
                        <i className="fa-solid fa-xmark md:hidden" aria-hidden="true" />
                        <span className="hidden md:inline">Cancel</span>
                      </Button>
                    ) : null}
                  </div>
                </div>

                {editing && isAdmin ? (
                  <div className="px-3 pb-3">
                    <div className="panel-subtle p-3 flex flex-wrap items-end gap-2">
                      <Input label="New name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                      <Button
                        type="button"
                        onClick={() => patchMut.mutate()}
                        disabled={patchMut.isPending || !editName.trim()}
                        title="Save"
                      >
                        {patchMut.isPending ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

    </div>
  );
}
