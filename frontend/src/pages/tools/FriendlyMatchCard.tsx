import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import Input from "../../ui/primitives/Input";
import Button from "../../ui/primitives/Button";
import SelectClubsPanel from "../../ui/SelectClubsPanel";
import { GoalStepper } from "../../ui/clubControls";
import { StarsFA } from "../../ui/primitives/StarsFA";
import { clubLabelPartsById } from "../../ui/clubControls";

import { listClubs } from "../../api/clubs.api";
import { listPlayers } from "../../api/players.api";
import { getStatsOdds, type StatsOddsRequest } from "../../api/stats.api";

function fmtOdd(x: number) {
  return Number.isFinite(x) ? x.toFixed(2) : "—";
}

function OddsInline({ odds }: { odds: { home: number; draw: number; away: number } }) {
  return (
    <div className="flex items-center justify-center">
      <div className="inline-flex items-center gap-2 text-[11px] sm:text-xs">
        <span className="inline-flex items-baseline gap-1">
          <span className="text-text-muted font-semibold">1</span>
          <span className="font-mono tabular-nums text-text-normal">{fmtOdd(Number(odds.home))}</span>
        </span>
        <span className="text-text-muted/60">|</span>
        <span className="inline-flex items-baseline gap-1">
          <span className="text-text-muted font-semibold">X</span>
          <span className="font-mono tabular-nums text-text-normal">{fmtOdd(Number(odds.draw))}</span>
        </span>
        <span className="text-text-muted/60">|</span>
        <span className="inline-flex items-baseline gap-1">
          <span className="text-text-muted font-semibold">2</span>
          <span className="font-mono tabular-nums text-text-normal">{fmtOdd(Number(odds.away))}</span>
        </span>
      </div>
    </div>
  );
}

function ModeSwitch({
  value,
  onChange,
}: {
  value: "1v1" | "2v2";
  onChange: (m: "1v1" | "2v2") => void;
}) {
  const idx = value === "1v1" ? 0 : 1;
  const wCls = "w-16 sm:w-24";
  return (
    <div
      className="relative inline-flex shrink-0 rounded-2xl p-1"
      style={{ backgroundColor: "rgb(var(--color-bg-card-chip) / 0.35)" }}
      role="group"
      aria-label="Match mode"
      title="Mode: 1v1 / 2v2"
    >
      <span
        className={"absolute inset-y-1 left-1 rounded-xl shadow-sm transition-transform duration-200 ease-out " + wCls}
        style={{
          backgroundColor: "rgb(var(--color-bg-card-inner))",
          transform: `translateX(${idx * 100}%)`,
        }}
        aria-hidden="true"
      />
      {(
        [
          { k: "1v1" as const, label: "1v1", icon: "fa-user" },
          { k: "2v2" as const, label: "2v2", icon: "fa-users" },
        ] as const
      ).map((x) => (
        <button
          key={x.k}
          type="button"
          onClick={() => onChange(x.k)}
          className={
            "relative z-10 inline-flex h-9 items-center justify-center gap-2 rounded-xl text-[11px] transition-colors " +
            wCls +
            " " +
            (value === x.k ? "text-text-normal" : "text-text-muted hover:text-text-normal")
          }
          aria-pressed={value === x.k}
        >
          <i className={"fa-solid " + x.icon + " hidden sm:inline"} aria-hidden="true" />
          <span>{x.label}</span>
        </button>
      ))}
    </div>
  );
}

function PlayerSelect({
  label,
  value,
  onChange,
  disabled,
  players,
  usedIds,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
  players: { id: number; display_name: string }[];
  usedIds: Set<number>;
}) {
  return (
    <label className="block">
      <div className="input-label">{label}</div>
      <select
        className="select-field"
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        disabled={disabled}
      >
        <option value="">(select)</option>
        {players.map((p) => {
          const dis = usedIds.has(p.id) && p.id !== value;
          return (
            <option key={p.id} value={String(p.id)} disabled={dis}>
              {p.display_name}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export default function FriendlyMatchCard() {
  const [open, setOpen] = useState(true);
  const [clubGame, setClubGame] = useState("EA FC 26");

  const [mode, setMode] = useState<"1v1" | "2v2">("2v2");

  const [a1, setA1] = useState<number | null>(null);
  const [a2, setA2] = useState<number | null>(null);
  const [b1, setB1] = useState<number | null>(null);
  const [b2, setB2] = useState<number | null>(null);

  const [aClub, setAClub] = useState<number | null>(null);
  const [bClub, setBClub] = useState<number | null>(null);

  const [aGoals, setAGoals] = useState(0);
  const [bGoals, setBGoals] = useState(0);

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

  const usedIds = useMemo(() => {
    const s = new Set<number>();
    for (const v of [a1, a2, b1, b2]) if (v != null) s.add(v);
    return s;
  }, [a1, a2, b1, b2]);

  const aTeamIds = useMemo(() => [a1, mode === "2v2" ? a2 : null].filter((x): x is number => x != null), [a1, a2, mode]);
  const bTeamIds = useMemo(() => [b1, mode === "2v2" ? b2 : null].filter((x): x is number => x != null), [b1, b2, mode]);

  const aLabel = useMemo(() => {
    const names = aTeamIds.map((id) => players.find((p) => p.id === id)?.display_name).filter(Boolean);
    return names.length ? names.join("/") : "Team A";
  }, [aTeamIds, players]);
  const bLabel = useMemo(() => {
    const names = bTeamIds.map((id) => players.find((p) => p.id === id)?.display_name).filter(Boolean);
    return names.length ? names.join("/") : "Team B";
  }, [bTeamIds, players]);

  const aNames = useMemo(() => {
    const names = aTeamIds.map((id) => players.find((p) => p.id === id)?.display_name).filter(Boolean) as string[];
    return names.length ? names : ["—"];
  }, [aTeamIds, players]);
  const bNames = useMemo(() => {
    const names = bTeamIds.map((id) => players.find((p) => p.id === id)?.display_name).filter(Boolean) as string[];
    return names.length ? names : ["—"];
  }, [bTeamIds, players]);

  const leader: "A" | "B" | null = aGoals === bGoals ? null : aGoals > bGoals ? "A" : "B";

  const aClubParts = useMemo(() => clubLabelPartsById(clubs, aClub), [clubs, aClub]);
  const bClubParts = useMemo(() => clubLabelPartsById(clubs, bClub), [clubs, bClub]);

  const oddsReq = useMemo<StatsOddsRequest | null>(() => {
    const need = mode === "1v1" ? 1 : 2;
    if (aTeamIds.length !== need || bTeamIds.length !== need) return null;
    return {
      mode,
      teamA_player_ids: aTeamIds,
      teamB_player_ids: bTeamIds,
      clubA_id: aClub,
      clubB_id: bClub,
      state: aGoals !== 0 || bGoals !== 0 ? "playing" : "scheduled",
      a_goals: aGoals,
      b_goals: bGoals,
    };
  }, [mode, aTeamIds, bTeamIds, aClub, bClub, aGoals, bGoals]);

  const oddsQ = useQuery({
    queryKey: ["stats", "odds", oddsReq],
    queryFn: () => getStatsOdds(oddsReq as StatsOddsRequest),
    enabled: open && oddsReq != null,
    staleTime: 2_000,
    refetchOnWindowFocus: false,
  });
  const odds = oddsQ.data?.odds ?? null;

  function clearAll() {
    setA1(null);
    setA2(null);
    setB1(null);
    setB2(null);
    setAClub(null);
    setBClub(null);
    setAGoals(0);
    setBGoals(0);
  }

  return (
    <CollapsibleCard
      title="Friendly match"
      defaultOpen={true}
      variant="outer"
      onOpenChange={setOpen}
      bodyVariant="none"
    >
      <div className="card-inner space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <Input label="Game" value={clubGame} onChange={(e) => setClubGame(e.target.value)} />
          </div>

          <Button
            variant="ghost"
            onClick={clearAll}
            type="button"
            disabled={!open}
            title="Clear"
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
            title="Refresh"
            className="h-10 w-10 p-0 inline-flex items-center justify-center md:w-auto md:px-4 md:py-2"
          >
            <i className="fa-solid fa-rotate-right md:hidden" aria-hidden="true" />
            <span className="hidden md:inline">Refresh</span>
          </Button>
        </div>

        {/* Match card (styled like "Current game") */}
        <div className="panel-subtle p-3">
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-[11px] sm:text-xs text-text-muted">Friendly match</div>
            <div className="text-[11px] sm:text-xs text-text-muted">{mode}</div>
          </div>

          {odds ? <OddsInline odds={odds} /> : null}

          <div className="mt-3 border-y border-border-card-inner/60 py-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4">
              <div className="min-w-0">
                {aNames.map((n, i) => (
                  <div
                    key={`${n}-${i}`}
                    className={
                      "text-[15px] md:text-lg text-text-normal whitespace-normal md:truncate break-words leading-tight " +
                      (leader === "A" ? "font-black" : "font-medium")
                    }
                  >
                    {n}
                  </div>
                ))}
              </div>

              <div className="card-chip justify-self-center flex items-center justify-center gap-2">
                <span className="text-xl font-semibold tabular-nums">{String(aGoals)}</span>
                <span className="text-text-muted">:</span>
                <span className="text-xl font-semibold tabular-nums">{String(bGoals)}</span>
              </div>

              <div className="min-w-0 text-right">
                {bNames.map((n, i) => (
                  <div
                    key={`${n}-${i}`}
                    className={
                      "text-[15px] md:text-lg text-text-normal whitespace-normal md:truncate break-words leading-tight " +
                      (leader === "B" ? "font-black" : "font-medium")
                    }
                  >
                    {n}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Clubs */}
          <div className="mt-2 md:mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 md:gap-4 text-xs md:text-sm text-text-muted">
            <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{aClubParts.name}</div>
            <div />
            <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight text-right">{bClubParts.name}</div>
          </div>
          {/* Leagues */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 md:gap-4 text-xs md:text-sm text-text-muted">
            <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{aClubParts.league_name}</div>
            <div />
            <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight text-right">{bClubParts.league_name}</div>
          </div>
          {/* Stars */}
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4 text-[11px] md:text-sm text-text-muted">
            <div className="min-w-0">
              <StarsFA rating={aClubParts.rating ?? 0} textClassName="text-text-muted" />
            </div>
            <div />
            <div className="min-w-0 flex justify-end">
              <StarsFA rating={bClubParts.rating ?? 0} textClassName="text-text-muted" />
            </div>
          </div>

          {/* Inputs */}
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4">
            <div className="flex justify-start">
              <GoalStepper value={aGoals} onChange={setAGoals} disabled={!open} ariaLabel="Goals left" />
            </div>
            <div />
            <div className="flex justify-end">
              <GoalStepper value={bGoals} onChange={setBGoals} disabled={!open} ariaLabel="Goals right" />
            </div>
          </div>

          {oddsQ.isFetching ? <div className="mt-2 text-xs text-text-muted">Computing odds…</div> : null}
          {oddsQ.error ? <div className="mt-2 text-xs text-red-400">{String(oddsQ.error)}</div> : null}
        </div>

        <div className="panel-subtle p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-text-normal">Setup</div>
            <ModeSwitch
              value={mode}
              onChange={(m) => {
                setMode(m);
                // Keep the first players if possible, but clear the extra slots when switching.
                if (m === "1v1") {
                  setA2(null);
                  setB2(null);
                }
              }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <PlayerSelect
                label={mode === "2v2" ? "Team A (1)" : "Team A"}
                value={a1}
                onChange={setA1}
                disabled={!open || playersQ.isLoading || !!playersQ.error}
                players={players}
                usedIds={usedIds}
              />
              {mode === "2v2" ? (
                <PlayerSelect
                  label="Team A (2)"
                  value={a2}
                  onChange={setA2}
                  disabled={!open || playersQ.isLoading || !!playersQ.error}
                  players={players}
                  usedIds={usedIds}
                />
              ) : null}
            </div>

            <div className="space-y-2">
              <PlayerSelect
                label={mode === "2v2" ? "Team B (1)" : "Team B"}
                value={b1}
                onChange={setB1}
                disabled={!open || playersQ.isLoading || !!playersQ.error}
                players={players}
                usedIds={usedIds}
              />
              {mode === "2v2" ? (
                <PlayerSelect
                  label="Team B (2)"
                  value={b2}
                  onChange={setB2}
                  disabled={!open || playersQ.isLoading || !!playersQ.error}
                  players={players}
                  usedIds={usedIds}
                />
              ) : null}
            </div>

            {playersQ.isLoading && <div className="col-span-full text-sm text-text-muted">Loading players…</div>}
            {playersQ.error && <div className="col-span-full text-sm text-red-400">{String(playersQ.error)}</div>}
          </div>
        </div>

        {clubsQ.isLoading && <div className="text-sm text-text-muted">Loading clubs…</div>}
        {clubsQ.error && <div className="text-sm text-red-400">{String(clubsQ.error)}</div>}

        <SelectClubsPanel
          clubs={clubs}
          disabled={!open || clubsQ.isFetching || !!clubsQ.error}
          showSelectedMeta={true}
          aLabel={`${aLabel} — club`}
          bLabel={`${bLabel} — club`}
          aClub={aClub}
          bClub={bClub}
          onChangeClubs={(aId, bId) => {
            setAClub(aId);
            setBClub(bId);
          }}
          onChangeAClub={setAClub}
          onChangeBClub={setBClub}
          defaultOpen={true}
          // In Tools, this sits inside a `card-inner` already, so `panel-inner` would blend in.
          // Use the subtle chip surface for a clear, consistent separation like in live views.
          wrapClassName="panel-subtle"
        />
      </div>
    </CollapsibleCard>
  );
}
