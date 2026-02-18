import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import Input from "../../ui/primitives/Input";
import Button from "../../ui/primitives/Button";
import AvatarButton from "../../ui/primitives/AvatarButton";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import SelectClubsPanel from "../../ui/SelectClubsPanel";
import { GoalStepper } from "../../ui/clubControls";
import MatchOverviewPanel from "../../ui/primitives/MatchOverviewPanel";
import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";

import { listClubs } from "../../api/clubs.api";
import { listPlayers } from "../../api/players.api";
import { createFriendlyMatch } from "../../api/friendlies.api";
import { getStatsOdds, type StatsOddsRequest } from "../../api/stats.api";
import type { Match } from "../../api/types";
import { usePlayerAvatarMap } from "../../hooks/usePlayerAvatarMap";
import { useAuth } from "../../auth/AuthContext";

const FRIENDLY_MATCH_STORAGE_KEY = "friendly_match_state_v1";

type FriendlyMatchPersistedState = {
  clubGame: string;
  mode: "1v1" | "2v2";
  a1: number | null;
  a2: number | null;
  b1: number | null;
  b2: number | null;
  aClub: number | null;
  bClub: number | null;
  aGoals: number;
  bGoals: number;
};

function toNullableInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.trunc(n));
}

function toNonNegativeInt(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.trunc(n));
}

function loadFriendlyState(): FriendlyMatchPersistedState {
  const defaults: FriendlyMatchPersistedState = {
    clubGame: "EA FC 26",
    mode: "2v2",
    a1: null,
    a2: null,
    b1: null,
    b2: null,
    aClub: null,
    bClub: null,
    aGoals: 0,
    bGoals: 0,
  };
  try {
    if (typeof window === "undefined") return defaults;
    const raw = window.localStorage.getItem(FRIENDLY_MATCH_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<FriendlyMatchPersistedState>;
    const mode = parsed.mode === "1v1" || parsed.mode === "2v2" ? parsed.mode : defaults.mode;
    return {
      clubGame: typeof parsed.clubGame === "string" && parsed.clubGame.trim() ? parsed.clubGame : defaults.clubGame,
      mode,
      a1: toNullableInt(parsed.a1),
      a2: mode === "2v2" ? toNullableInt(parsed.a2) : null,
      b1: toNullableInt(parsed.b1),
      b2: mode === "2v2" ? toNullableInt(parsed.b2) : null,
      aClub: toNullableInt(parsed.aClub),
      bClub: toNullableInt(parsed.bClub),
      aGoals: toNonNegativeInt(parsed.aGoals, 0),
      bGoals: toNonNegativeInt(parsed.bGoals, 0),
    };
  } catch {
    return defaults;
  }
}

function saveFriendlyState(state: FriendlyMatchPersistedState) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FRIENDLY_MATCH_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
}

function AvatarPlayerSelect({
  label,
  value,
  onChange,
  disabled,
  players,
  usedIds,
  avatarUpdatedAtById,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
  players: { id: number; display_name: string }[];
  usedIds: Set<number>;
  avatarUpdatedAtById: Map<number, string>;
}) {
  const currentName = value != null ? (players.find((p) => p.id === value)?.display_name ?? "Unassigned") : "Unassigned";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="input-label">{label}</div>
        <div className="text-[11px] text-text-muted truncate">{currentName}</div>
      </div>
      <div className="-mx-1 overflow-x-auto px-1 py-0.5">
        <div className="flex min-w-full items-center justify-between gap-2">
          <AvatarButton
            playerId={null}
            name="None"
            updatedAt={null}
            selected={value == null}
            disabled={disabled}
            onClick={() => onChange(null)}
            className="h-8 w-8"
            fallbackIconClass="fa-solid fa-ban text-[11px] text-text-muted"
            noOverflowAnchor={true}
          />
          {players.map((p) => {
            const takenElsewhere = usedIds.has(p.id) && value !== p.id;
            return (
              <AvatarButton
                key={p.id}
                playerId={p.id}
                name={p.display_name}
                updatedAt={avatarUpdatedAtById.get(p.id) ?? null}
                selected={value === p.id}
                disabled={disabled || takenElsewhere}
                onClick={() => onChange(p.id)}
                className="h-8 w-8"
                noOverflowAnchor={true}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function FriendlyMatchCard({
  embedded = false,
  onInitialReady,
}: {
  embedded?: boolean;
  onInitialReady?: () => void;
}) {
  const qc = useQueryClient();
  const { role, token } = useAuth();
  const canStore = role === "editor" || role === "admin";
  const [initialState] = useState<FriendlyMatchPersistedState>(() => loadFriendlyState());

  const [collapsibleOpen, setCollapsibleOpen] = useState(false);
  const open = embedded || collapsibleOpen;
  const [clubGame, setClubGame] = useState(initialState.clubGame);

  const [mode, setMode] = useState<"1v1" | "2v2">(initialState.mode);

  const [a1, setA1] = useState<number | null>(initialState.a1);
  const [a2, setA2] = useState<number | null>(initialState.a2);
  const [b1, setB1] = useState<number | null>(initialState.b1);
  const [b2, setB2] = useState<number | null>(initialState.b2);

  const [aClub, setAClub] = useState<number | null>(initialState.aClub);
  const [bClub, setBClub] = useState<number | null>(initialState.bClub);

  const [aGoals, setAGoals] = useState(initialState.aGoals);
  const [bGoals, setBGoals] = useState(initialState.bGoals);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const initialReadyFiredRef = useRef(false);

  const clubsQ = useQuery({
    queryKey: ["clubs", clubGame],
    queryFn: () => listClubs(clubGame),
    enabled: open,
  });
  const clubs = useMemo(() => clubsQ.data ?? [], [clubsQ.data]);

  const playersQ = useQuery({
    queryKey: ["players"],
    queryFn: listPlayers,
    enabled: open,
    staleTime: 60_000,
  });
  const { avatarUpdatedAtById } = usePlayerAvatarMap({ enabled: open });
  const players = useMemo(() => playersQ.data ?? [], [playersQ.data]);

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
  const neededPerTeam = mode === "1v1" ? 1 : 2;
  const canSave = aTeamIds.length === neededPerTeam && bTeamIds.length === neededPerTeam;

  const previewMatch = useMemo<Match>(() => {
    const aPlayers = aTeamIds
      .map((id) => players.find((p) => p.id === id))
      .filter((p): p is { id: number; display_name: string } => !!p)
      .map((p) => ({ id: p.id, display_name: p.display_name }));
    const bPlayers = bTeamIds
      .map((id) => players.find((p) => p.id === id))
      .filter((p): p is { id: number; display_name: string } => !!p)
      .map((p) => ({ id: p.id, display_name: p.display_name }));

    return {
      id: -1,
      tournament_id: -1,
      order_index: 0,
      leg: 1,
      state: aGoals !== 0 || bGoals !== 0 ? "playing" : "scheduled",
      sides: [
        { id: -11, side: "A", players: aPlayers, club_id: aClub, goals: aGoals },
        { id: -12, side: "B", players: bPlayers, club_id: bClub, goals: bGoals },
      ],
      odds,
    };
  }, [aTeamIds, bTeamIds, players, aClub, bClub, aGoals, bGoals, odds]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Missing token");
      return createFriendlyMatch(token, {
        mode,
        teamA_player_ids: aTeamIds,
        teamB_player_ids: bTeamIds,
        clubA_id: aClub,
        clubB_id: bClub,
        a_goals: aGoals,
        b_goals: bGoals,
      });
    },
    onSuccess: () => {
      setLastSavedAt(new Date().toISOString());
      clearAll();
      void qc.invalidateQueries({ queryKey: ["friendlies"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  useEffect(() => {
    saveFriendlyState({
      clubGame,
      mode,
      a1,
      a2: mode === "2v2" ? a2 : null,
      b1,
      b2: mode === "2v2" ? b2 : null,
      aClub,
      bClub,
      aGoals,
      bGoals,
    });
  }, [clubGame, mode, a1, a2, b1, b2, aClub, bClub, aGoals, bGoals]);

  useEffect(() => {
    if (initialReadyFiredRef.current) return;
    if (!open) return;
    if (playersQ.isLoading || clubsQ.isLoading) return;
    initialReadyFiredRef.current = true;
    onInitialReady?.();
  }, [open, playersQ.isLoading, clubsQ.isLoading, onInitialReady]);

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

  const content = (
    <div className="card-inner space-y-3">
        <ErrorToastOnError error={oddsQ.error} title="Odds loading failed" />
        <ErrorToastOnError error={playersQ.error} title="Players loading failed" />
        <ErrorToastOnError error={clubsQ.error} title="Clubs loading failed" />
        <ErrorToastOnError error={saveMut.error} title="Could not save friendly match" />
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

          <Button
            variant="solid"
            onClick={() => saveMut.mutate()}
            type="button"
            disabled={!open || !canStore || !token || !canSave || saveMut.isPending}
            title={canStore && token ? "Save friendly match" : "Login as editor/admin to save"}
            className="h-10 w-10 p-0 inline-flex items-center justify-center md:w-auto md:px-4 md:py-2"
          >
            <i className="fa-solid fa-floppy-disk md:hidden" aria-hidden="true" />
            <span className="hidden md:inline">{saveMut.isPending ? "Saving…" : "Save"}</span>
          </Button>
        </div>
        {lastSavedAt ? (
          <div className="text-xs text-text-muted">Saved {new Date(lastSavedAt).toLocaleTimeString()}.</div>
        ) : null}
        {!canStore ? (
          <div className="text-xs text-text-muted">Login as editor/admin to store friendlies for stats.</div>
        ) : null}

        <div className="panel-subtle p-3 space-y-2">
          <MatchOverviewPanel
            match={previewMatch}
            clubs={clubs}
            mode={mode}
            aGoals={aGoals}
            bGoals={bGoals}
            showModePill={true}
            showOdds={true}
            scoreBoxStyle="inner"
            surface="panel"
          />

          <div className="pt-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4">
              <div className="flex justify-start">
                <GoalStepper value={aGoals} onChange={setAGoals} disabled={!open} ariaLabel="Goals left" />
              </div>
              <div />
              <div className="flex justify-end">
                <GoalStepper value={bGoals} onChange={setBGoals} disabled={!open} ariaLabel="Goals right" />
              </div>
            </div>
          </div>

          {oddsQ.isFetching ? <div className="text-xs text-text-muted">Computing odds…</div> : null}
        </div>

        <div className="panel-subtle p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-text-normal">Setup</div>
            <SegmentedSwitch<"1v1" | "2v2">
              value={mode}
              onChange={(m) => {
                setMode(m);
                // Keep the first players if possible, but clear the extra slots when switching.
                if (m === "1v1") {
                  setA2(null);
                  setB2(null);
                }
              }}
              options={[
                { key: "1v1", label: "1v1", icon: "fa-user" },
                { key: "2v2", label: "2v2", icon: "fa-users" },
              ]}
              ariaLabel="Match mode"
              title="Mode: 1v1 / 2v2"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <AvatarPlayerSelect
                label={mode === "2v2" ? "Team A (1)" : "Team A"}
                value={a1}
                onChange={setA1}
                disabled={!open || playersQ.isLoading || !!playersQ.error}
                players={players}
                usedIds={usedIds}
                avatarUpdatedAtById={avatarUpdatedAtById}
              />
              {mode === "2v2" ? (
                <AvatarPlayerSelect
                  label="Team A (2)"
                  value={a2}
                  onChange={setA2}
                  disabled={!open || playersQ.isLoading || !!playersQ.error}
                  players={players}
                  usedIds={usedIds}
                  avatarUpdatedAtById={avatarUpdatedAtById}
                />
              ) : null}
            </div>

            <div className="space-y-2">
              <AvatarPlayerSelect
                label={mode === "2v2" ? "Team B (1)" : "Team B"}
                value={b1}
                onChange={setB1}
                disabled={!open || playersQ.isLoading || !!playersQ.error}
                players={players}
                usedIds={usedIds}
                avatarUpdatedAtById={avatarUpdatedAtById}
              />
              {mode === "2v2" ? (
                <AvatarPlayerSelect
                  label="Team B (2)"
                  value={b2}
                  onChange={setB2}
                  disabled={!open || playersQ.isLoading || !!playersQ.error}
                  players={players}
                  usedIds={usedIds}
                  avatarUpdatedAtById={avatarUpdatedAtById}
                />
              ) : null}
            </div>

            {playersQ.isLoading && <div className="col-span-full text-sm text-text-muted">Loading players…</div>}
          </div>
        </div>

        {clubsQ.isLoading && <div className="text-sm text-text-muted">Loading clubs…</div>}

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
  );

  if (embedded) return content;

  return (
    <CollapsibleCard
      title="New Friendly"
      defaultOpen={false}
      variant="outer"
      onOpenChange={setCollapsibleOpen}
      bodyVariant="none"
    >
      {content}
    </CollapsibleCard>
  );
}
