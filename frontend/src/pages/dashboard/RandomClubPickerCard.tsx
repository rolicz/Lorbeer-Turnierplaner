import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import Input from "../../ui/primitives/Input";
import Button from "../../ui/primitives/Button";
import SelectClubsPanel from "../../ui/SelectClubsPanel";

import { listClubs } from "../../api/clubs.api";
import { listPlayers } from "../../api/players.api";

export default function RandomClubPickerCard() {
  const [open, setOpen] = useState(true);
  const [clubGame, setClubGame] = useState("EA FC 26");

  const [aClub, setAClub] = useState<number | null>(null);
  const [bClub, setBClub] = useState<number | null>(null);

  const [aPlayerId, setAPlayerId] = useState<number | null>(null);
  const [bPlayerId, setBPlayerId] = useState<number | null>(null);

  const clubsQ = useQuery({
    queryKey: ["clubs", clubGame],
    queryFn: () => listClubs(clubGame),
    enabled: open,
  });
  const clubs = clubsQ.data ?? [];

  const playersQ = useQuery({
    queryKey: ["players"],
    queryFn: listPlayers,
    enabled: open,
    staleTime: 60_000,
  });
  const players = playersQ.data ?? [];

  const aPlayerName = aPlayerId ? players.find((p) => p.id === aPlayerId)?.display_name ?? "A" : "A";
  const bPlayerName = bPlayerId ? players.find((p) => p.id === bPlayerId)?.display_name ?? "B" : "B";

  return (
    <CollapsibleCard title="Random club picker" defaultOpen={true} variant="outer" onOpenChange={setOpen}>
      <div className="card-inner space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <Input label="Game" value={clubGame} onChange={(e) => setClubGame(e.target.value)} />
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              setAClub(null);
              setBClub(null);
              setAPlayerId(null);
              setBPlayerId(null);
            }}
            type="button"
            disabled={!open}
            title="Clear selection"
            className="h-10 w-10 p-0 inline-flex items-center justify-center md:w-auto md:px-4 md:py-2"
          >
            <i className="fa-solid fa-eraser md:hidden" aria-hidden="true" />
            <span className="hidden md:inline">Clear</span>
          </Button>

          <Button
            variant="ghost"
            onClick={() => {
              void clubsQ.refetch();
              void playersQ.refetch();
            }}
            type="button"
            disabled={!open || clubsQ.isFetching}
            title="Refresh clubs"
            className="h-10 w-10 p-0 inline-flex items-center justify-center md:w-auto md:px-4 md:py-2"
          >
            <i className="fa-solid fa-rotate-right md:hidden" aria-hidden="true" />
            <span className="hidden md:inline">Refresh</span>
          </Button>
        </div>

        {clubsQ.isLoading && <div className="text-sm text-text-muted">Loading clubs…</div>}
        {clubsQ.error && <div className="text-sm text-red-400">{String(clubsQ.error)}</div>}

        <CollapsibleCard
          title="Players (optional)"
          defaultOpen={true}
          className="panel-subtle"
          right={<span className="text-xs text-text-muted">{players.length ? `${players.length} players` : ""}</span>}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <div className="input-label">Player A</div>
              <select
                className="select-field"
                value={aPlayerId == null ? "" : String(aPlayerId)}
                onChange={(e) => setAPlayerId(e.target.value ? Number(e.target.value) : null)}
                disabled={!open || playersQ.isLoading || !!playersQ.error}
              >
                <option value="">(none)</option>
                {players.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="input-label">Player B</div>
              <select
                className="select-field"
                value={bPlayerId == null ? "" : String(bPlayerId)}
                onChange={(e) => setBPlayerId(e.target.value ? Number(e.target.value) : null)}
                disabled={!open || playersQ.isLoading || !!playersQ.error}
              >
                <option value="">(none)</option>
                {players.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>

            {playersQ.isLoading && <div className="col-span-full text-sm text-text-muted">Loading players…</div>}
            {playersQ.error && <div className="col-span-full text-sm text-red-400">{String(playersQ.error)}</div>}
          </div>
        </CollapsibleCard>

        <div className="panel-subtle p-3">
          <SelectClubsPanel
            wrap={false}
            clubs={clubs}
            disabled={!open || clubsQ.isFetching || !!clubsQ.error}
            showSelectedMeta={true}
            aLabel={`${aPlayerName} — club`}
            bLabel={`${bPlayerName} — club`}
            aClub={aClub}
            bClub={bClub}
            onChangeClubs={(aId, bId) => {
              setAClub(aId);
              setBClub(bId);
            }}
            onChangeAClub={setAClub}
            onChangeBClub={setBClub}
          />
        </div>
      </div>
    </CollapsibleCard>
  );
}

