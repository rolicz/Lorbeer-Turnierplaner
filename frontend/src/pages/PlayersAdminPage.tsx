import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Card from "../ui/primitives/Card";
import Input from "../ui/primitives/Input";
import Button from "../ui/primitives/Button";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";
import AvatarCircle from "../ui/primitives/AvatarCircle";

import { useAuth } from "../auth/AuthContext";
import { createPlayer, listPlayers, patchPlayer } from "../api/players.api";
import { deletePlayerAvatar, putPlayerAvatar } from "../api/playerAvatars.api";
import PlayerAvatarEditor from "./players/PlayerAvatarEditor";
import { usePlayerAvatarMap } from "../hooks/usePlayerAvatarMap";

export default function PlayersAdminPage() {
  const { token } = useAuth();
  const qc = useQueryClient();

  const playersQ = useQuery({ queryKey: ["players"], queryFn: listPlayers });
  const { avatarUpdatedAtById: avatarUpdatedAtByPlayerId } = usePlayerAvatarMap();

  const [newName, setNewName] = useState("");
  const createMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("No token");
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

  const [avatarEditPlayer, setAvatarEditPlayer] = useState<{ id: number; name: string } | null>(null);
  const putAvatarMut = useMutation({
    mutationFn: async (payload: { playerId: number; blob: Blob }) => {
      if (!token) throw new Error("No token");
      return putPlayerAvatar(token, payload.playerId, payload.blob);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["players", "avatars"] });
    },
  });
  const delAvatarMut = useMutation({
    mutationFn: async (playerId: number) => {
      if (!token) throw new Error("No token");
      await deletePlayerAvatar(token, playerId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["players", "avatars"] });
    },
  });

  const players = playersQ.data ?? [];

  return (
    <div className="page">
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <i className="fa-solid fa-screwdriver-wrench text-text-muted" aria-hidden="true" />
            Player maintenance
          </span>
        }
        variant="outer"
        bodyClassName="space-y-3"
      >
        <ErrorToastOnError error={createMut.error} title="Could not create player" />
        <ErrorToastOnError error={playersQ.error} title="Players loading failed" />
        <ErrorToastOnError error={patchMut.error} title="Could not save player" />
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

            return (
              <div key={p.id} className={"border-b border-border-card-inner last:border-b-0 " + zebra}>
                <div className="grid grid-cols-12 items-center gap-2 px-3 py-2">
                  <div className="col-span-8 min-w-0 flex items-center gap-2">
                    <button
                      type="button"
                      className="shrink-0"
                      onClick={() => setAvatarEditPlayer({ id: p.id, name: p.display_name })}
                      title="Edit avatar"
                    >
                      <AvatarCircle playerId={p.id} name={p.display_name} updatedAt={updatedAt} sizeClass="h-10 w-10" />
                    </button>
                    <div className="min-w-0">
                      <div className="truncate text-text-normal font-semibold">{p.display_name}</div>
                      <div className="text-[11px] text-text-muted">id {p.id}</div>
                    </div>
                  </div>

                  <div className="col-span-4 flex items-center justify-end gap-2">
                    {!editing ? (
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
                    ) : (
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
                    )}
                  </div>
                </div>

                {editing ? (
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

      <PlayerAvatarEditor
        open={avatarEditPlayer != null}
        title={avatarEditPlayer ? `Avatar: ${avatarEditPlayer.name}` : "Avatar"}
        canEdit={true}
        onClose={() => setAvatarEditPlayer(null)}
        onSave={async (blob) => {
          if (!avatarEditPlayer) return;
          await putAvatarMut.mutateAsync({ playerId: avatarEditPlayer.id, blob });
        }}
        onDelete={
          avatarEditPlayer && avatarUpdatedAtByPlayerId.has(avatarEditPlayer.id)
            ? async () => {
                await delAvatarMut.mutateAsync(avatarEditPlayer.id);
              }
            : null
        }
      />
    </div>
  );
}
