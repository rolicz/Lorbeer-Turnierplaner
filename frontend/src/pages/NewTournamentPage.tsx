import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import Button from "../ui/primitives/Button";
import SegmentedSwitch from "../ui/primitives/SegmentedSwitch";
import AvatarButton from "../ui/primitives/AvatarButton";
import { ErrorToastOnError } from "../ui/primitives/ErrorToast";

import { listPlayers } from "../api/players.api";
import { createTournament } from "../api/tournaments.api";
import { qk } from "../api/queryKeys";
import { useAuth } from "../auth/AuthContext";
import { usePlayerAvatarMap } from "../hooks/usePlayerAvatarMap";


export default function NewTournamentPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { token } = useAuth();

  const [name, setName] = useState("");
  const [mode, setMode] = useState<"1v1" | "2v2">("1v1");
  const [selected, setSelected] = useState<Record<number, boolean>>({});

  const playersQ = useQuery({ queryKey: qk.players(), queryFn: listPlayers });
  const { avatarUpdatedAtById } = usePlayerAvatarMap();

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)),
    [selected],
  );

  const createMut = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error("Not logged in");
      if (!name.trim()) throw new Error("Name required");
      if (selectedIds.length < 3) throw new Error("Select at least 3 players");
      return createTournament(token, {
        name: name.trim(),
        mode,
        player_ids: selectedIds,
        auto_generate: true,
        randomize: true,
      });
    },
    onSuccess: async (t) => {
      await qc.invalidateQueries({ queryKey: qk.tournaments() });
      nav(`/live/${t.id}`, { replace: true });
    },
  });

  return (
    <div className="page">
      <div className="mb-6">
        <button
          type="button"
          onClick={() => nav("/tournaments")}
          className="mb-3 inline-flex items-center gap-1 text-xs text-text-muted transition hover:text-text-normal"
        >
          <ChevronLeft size={14} />
          All tournaments
        </button>
        <h1 className="text-xl font-bold tracking-tight text-text-normal">New Tournament</h1>
      </div>

      <div className="mx-auto max-w-lg space-y-6">
        <ErrorToastOnError error={createMut.error} title="Could not create tournament" />
        <ErrorToastOnError error={playersQ.error} title="Could not load players" />

        {/* Name */}
        <section className="card-outer space-y-2">
          <h2 className="text-sm font-semibold text-text-normal">Name</h2>
          <input
            className="input-field w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="42. Lorbeerkranz Turnier"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim() && selectedIds.length >= 3) {
                createMut.mutate();
              }
            }}
          />
        </section>

        {/* Mode */}
        <section className="card-outer space-y-2">
          <h2 className="text-sm font-semibold text-text-normal">Mode</h2>
          <SegmentedSwitch<"1v1" | "2v2">
            value={mode}
            onChange={setMode}
            options={[
              { key: "1v1", label: "1v1" },
              { key: "2v2", label: "2v2" },
            ]}
            ariaLabel="Tournament mode"
            title="Tournament mode"
          />
        </section>

        {/* Players */}
        <section className="card-outer space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-text-normal">Players</h2>
            {selectedIds.length > 0 ? (
              <span className="text-xs text-text-muted">{selectedIds.length} selected</span>
            ) : (
              <span className="text-xs text-text-muted">Select at least 3</span>
            )}
          </div>
          {playersQ.isLoading ? (
            <div className="text-sm text-text-muted">Loading…</div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {(playersQ.data ?? []).map((p) => (
                <AvatarButton
                  key={p.id}
                  playerId={p.id}
                  name={p.display_name}
                  updatedAt={avatarUpdatedAtById.get(p.id) ?? null}
                  selected={!!selected[p.id]}
                  onClick={() => setSelected((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                  className="h-12 w-12"
                />
              ))}
            </div>
          )}
        </section>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" type="button" onClick={() => nav("/tournaments")}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || !name.trim() || selectedIds.length < 3}
          >
            {createMut.isPending ? "Creating…" : "Create Tournament"}
          </Button>
        </div>
      </div>
    </div>
  );
}
