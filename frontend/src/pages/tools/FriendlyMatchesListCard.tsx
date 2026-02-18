import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import InlineLoading from "../../ui/primitives/InlineLoading";
import MatchEditorSheet from "../live/MatchEditorSheet";

import { listClubs } from "../../api/clubs.api";
import {
  deleteFriendlyMatch,
  listFriendlies,
  patchFriendlyMatch,
  type FriendlyMatchResponse,
} from "../../api/friendlies.api";
import type { Match, MatchSide, StatsPlayerMatchesTournament } from "../../api/types";
import { MatchHistoryList } from "../stats/MatchHistoryList";
import { useAuth } from "../../auth/AuthContext";

type ModeFilter = "all" | "1v1" | "2v2";

function normalizeState(state: string): "scheduled" | "playing" | "finished" {
  const s = String(state || "").trim().toLowerCase();
  if (s === "scheduled" || s === "playing" || s === "finished") return s;
  return "finished";
}

function parseGoal(v: string): number {
  const x = Number.parseInt(String(v ?? "").trim(), 10);
  if (!Number.isFinite(x) || Number.isNaN(x)) return 0;
  return Math.max(0, x);
}

function friendlyToMatch(f: FriendlyMatchResponse, orderIndex = 0): Match {
  const sides: MatchSide[] = [...(f.sides ?? [])]
    .sort((a, b) => a.side.localeCompare(b.side))
    .map((s) => ({
      id: s.id,
      side: s.side,
      players: s.players ?? [],
      club_id: s.club_id,
      goals: Number.isFinite(Number(s.goals)) ? Number(s.goals) : 0,
    }));
  return {
    id: f.id,
    tournament_id: 0,
    order_index: orderIndex,
    leg: 1,
    state: normalizeState(f.state),
    started_at: f.created_at,
    finished_at: f.updated_at,
    sides,
  };
}

export default function FriendlyMatchesListCard({
  embedded = false,
  onInitialReady,
}: {
  embedded?: boolean;
  onInitialReady?: () => void;
}) {
  const qc = useQueryClient();
  const { role, token } = useAuth();
  const canDelete = role === "admin" && !!token;
  const canEdit = role === "admin" && !!token;
  const [mode, setMode] = useState<ModeFilter>("all");
  const [showMeta, setShowMeta] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedFriendlyId, setSelectedFriendlyId] = useState<number | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [clubGame, setClubGame] = useState("EA FC 26");
  const [aClub, setAClub] = useState<number | null>(null);
  const [bClub, setBClub] = useState<number | null>(null);
  const [aGoals, setAGoals] = useState("0");
  const [bGoals, setBGoals] = useState("0");
  const [mState, setMState] = useState<"scheduled" | "playing" | "finished">("finished");
  const initialReadyFiredRef = useRef(false);

  const clubsQ = useQuery({
    queryKey: ["clubs"],
    queryFn: () => listClubs(),
    staleTime: 60_000,
  });

  const friendliesQ = useQuery({
    queryKey: ["friendlies", mode],
    queryFn: () => listFriendlies({ mode: mode === "all" ? undefined : mode, limit: 500 }),
    staleTime: 10_000,
  });

  const editorClubsQ = useQuery({
    queryKey: ["clubs", clubGame],
    queryFn: () => listClubs(clubGame),
    enabled: open,
    staleTime: 60_000,
  });

  const clubsById = useMemo(() => {
    const out = new Map<number, { game: string }>();
    for (const c of clubsQ.data ?? []) out.set(c.id, { game: c.game });
    return out;
  }, [clubsQ.data]);

  const tournaments = useMemo<StatsPlayerMatchesTournament[]>(() => {
    const rows = friendliesQ.data ?? [];
    const byDate = new Map<string, typeof rows>();
    for (const f of rows) {
      const key = String(f.date || "");
      const arr = byDate.get(key) ?? [];
      arr.push(f);
      byDate.set(key, arr);
    }

    const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

    return dates.map((dateKey) => {
      const groupRows = [...(byDate.get(dateKey) ?? [])].sort((a, b) => {
        const at = Date.parse(a.created_at);
        const bt = Date.parse(b.created_at);
        if (Number.isFinite(at) && Number.isFinite(bt) && bt !== at) return bt - at;
        return b.id - a.id;
      });
      const matches: Match[] = groupRows.map((f, idx) => friendlyToMatch(f, idx));

      const numericDate = Number.parseInt(dateKey.replace(/-/g, ""), 10);
      const fallbackId = groupRows[0]?.id ?? 0;
      const groupId = Number.isFinite(numericDate) && numericDate > 0 ? -(3_000_000 + numericDate) : -(3_000_000 + fallbackId);
      const groupMode: "1v1" | "2v2" = groupRows.every((r) => r.mode === "2v2") ? "2v2" : "1v1";

      return {
        id: groupId,
        name: "Friendlies",
        date: dateKey,
        mode: groupMode,
        status: "friendly",
        matches,
      };
    });
  }, [friendliesQ.data]);

  const deleteMut = useMutation({
    mutationFn: (friendlyId: number) => {
      if (!token) throw new Error("Missing token");
      return deleteFriendlyMatch(token, friendlyId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["friendlies"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const saveMut = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Missing token");
      if (!selectedFriendlyId) throw new Error("No friendly selected");
      return patchFriendlyMatch(token, selectedFriendlyId, {
        state: mState,
        sideA: { club_id: aClub, goals: parseGoal(aGoals) },
        sideB: { club_id: bClub, goals: parseGoal(bGoals) },
      });
    },
    onSuccess: async (updated) => {
      setSelectedMatch(friendlyToMatch(updated, 0));
      await qc.invalidateQueries({ queryKey: ["friendlies"] });
      await qc.invalidateQueries({ queryKey: ["stats"] });
      setOpen(false);
    },
  });

  const pendingDeleteId = deleteMut.variables ?? null;

  useEffect(() => {
    if (initialReadyFiredRef.current) return;
    if (friendliesQ.isLoading || clubsQ.isLoading) return;
    initialReadyFiredRef.current = true;
    onInitialReady?.();
  }, [friendliesQ.isLoading, clubsQ.isLoading, onInitialReady]);

  function findFriendlyById(fid: number): FriendlyMatchResponse | null {
    const rows = friendliesQ.data ?? [];
    return rows.find((f) => Number(f.id) === Number(fid)) ?? null;
  }

  function openEditorForFriendly(fid: number) {
    const row = findFriendlyById(fid);
    if (!row) return;
    const m = friendlyToMatch(row, 0);
    const aSide = m.sides.find((s) => s.side === "A");
    const bSide = m.sides.find((s) => s.side === "B");

    const gameFromClubs = [aSide?.club_id, bSide?.club_id]
      .filter((id): id is number => Number.isFinite(Number(id)) && Number(id) > 0)
      .map((id) => clubsById.get(id)?.game)
      .find((x): x is string => !!x);

    if (gameFromClubs) setClubGame(gameFromClubs);
    setSelectedFriendlyId(fid);
    setSelectedMatch(m);
    setAClub(aSide?.club_id ?? null);
    setBClub(bSide?.club_id ?? null);
    setAGoals(String(Math.max(0, Number(aSide?.goals ?? 0))));
    setBGoals(String(Math.max(0, Number(bSide?.goals ?? 0))));
    setMState(m.state);
    setOpen(true);
  }

  const content = (
    <>
      <ErrorToastOnError error={friendliesQ.error} title="Friendly matches loading failed" />
      <ErrorToastOnError error={clubsQ.error} title="Clubs loading failed" />
      <ErrorToastOnError error={editorClubsQ.error} title="Editor clubs loading failed" />
      <ErrorToastOnError error={deleteMut.error} title="Could not delete friendly" />
      <ErrorToastOnError error={saveMut.error} title="Could not save friendly" />

      <div className="rounded-xl bg-bg-card-inner p-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="inline-flex h-9 w-16 sm:w-20 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
              <i className="fa-solid fa-filter text-[11px]" aria-hidden="true" />
              Filter
            </div>
            <SegmentedSwitch<ModeFilter>
              value={mode}
              onChange={setMode}
              options={[
                { key: "all", label: "All" },
                { key: "1v1", label: "1v1" },
                { key: "2v2", label: "2v2" },
              ]}
              ariaLabel="Friendly mode filter"
              title="Filter mode"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="inline-flex h-9 w-16 sm:w-20 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted">
              <i className="fa-solid fa-sliders text-[11px]" aria-hidden="true" />
              View
            </div>
            <SegmentedSwitch<boolean>
              value={showMeta}
              onChange={setShowMeta}
              options={[
                { key: false, label: "Compact", icon: "fa-compress" },
                { key: true, label: "Details", icon: "fa-list" },
              ]}
              ariaLabel="Friendly details toggle"
              title="View details"
            />
          </div>
        </div>
      </div>

      {friendliesQ.isLoading && !friendliesQ.data ? (
        <InlineLoading label="Loading…" />
      ) : null}

      {!friendliesQ.isLoading && tournaments.length === 0 ? (
        <div className="rounded-xl bg-bg-card-inner p-2 text-sm text-text-muted">No friendlies yet.</div>
      ) : null}

      {tournaments.length ? (
        <div style={{ overflowAnchor: "none" }}>
          <MatchHistoryList
            tournaments={tournaments}
            clubs={clubsQ.data ?? []}
            showMeta={showMeta}
            nameColorByResult
            hideModePill
            renderMatchActions={(_t, m) => {
              if (!canDelete && !canEdit) return null;
              const fid = Number(m.id);
              if (!fid) return null;
              const pendingDelete = deleteMut.isPending && pendingDeleteId === fid;
              const pendingSave = saveMut.isPending && selectedFriendlyId === fid;
              return (
                <div className="inline-flex items-center gap-1">
                  {canEdit ? (
                    <button
                      type="button"
                      className="btn-base btn-ghost inline-flex h-8 w-8 items-center justify-center p-0"
                      title={`Edit friendly #${fid}`}
                      disabled={pendingSave || pendingDelete}
                      onClick={() => openEditorForFriendly(fid)}
                    >
                      <i className={"fa-solid " + (pendingSave ? "fa-spinner fa-spin" : "fa-pen")} aria-hidden="true" />
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      className="btn-base btn-ghost inline-flex h-8 w-8 items-center justify-center p-0"
                      title={`Delete friendly #${fid}`}
                      disabled={pendingDelete}
                      onClick={() => {
                        if (!window.confirm(`Delete friendly #${fid}?`)) return;
                        deleteMut.mutate(fid);
                      }}
                    >
                      <i className={"fa-solid " + (pendingDelete ? "fa-spinner fa-spin" : "fa-trash-can")} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              );
            }}
          />
        </div>
      ) : null}

      <MatchEditorSheet
        open={open}
        onClose={() => setOpen(false)}
        match={selectedMatch}
        showState={false}
        clubs={editorClubsQ.data ?? []}
        clubsLoading={editorClubsQ.isLoading}
        clubsError={editorClubsQ.error ? String(editorClubsQ.error) : null}
        clubGame={clubGame}
        setClubGame={setClubGame}
        aClub={aClub}
        bClub={bClub}
        setAClub={setAClub}
        setBClub={setBClub}
        aGoals={aGoals}
        bGoals={bGoals}
        setAGoals={setAGoals}
        setBGoals={setBGoals}
        state={mState}
        setState={setMState}
        onSave={() => saveMut.mutate()}
        saving={saveMut.isPending}
        saveError={saveMut.error ? String(saveMut.error) : null}
      />
    </>
  );

  if (embedded) {
    return <div className="rounded-xl border border-border-card-inner/45 bg-bg-card-inner p-2 space-y-3">{content}</div>;
  }

  return (
    <CollapsibleCard
      title={
        <span className="inline-flex items-center gap-2">
          <i className="fa-solid fa-list text-text-muted" aria-hidden="true" />
          All Friendlies
        </span>
      }
      defaultOpen={true}
      variant="outer"
      bodyVariant="none"
      bodyClassName="space-y-3"
    >
      {content}
    </CollapsibleCard>
  );
}
