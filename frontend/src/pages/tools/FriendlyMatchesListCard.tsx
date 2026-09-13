import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { List, Loader2, Pencil, Shrink, Trash2, X } from "lucide-react";

import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import InlineLoading from "../../ui/primitives/InlineLoading";
import Input from "../../ui/primitives/Input";
import Button from "../../ui/primitives/Button";
import EmptyState from "../../ui/primitives/EmptyState";
import MatchOverviewPanel from "../../ui/primitives/MatchOverviewPanel";
import SelectClubsPanel from "../../ui/SelectClubsPanel";
import { GoalStepper, useClubSelection } from "../../ui/clubControls";

import { listClubs } from "../../api/clubs.api";
import { qk } from "../../api/queryKeys";
import {
  deleteFriendlyMatch,
  listFriendlies,
  patchFriendlyMatch,
  type FriendlyMatchResponse,
} from "../../api/friendlies.api";
import type { Club, Match, MatchSide, StatsPlayerMatchesTournament } from "../../api/types";
import { MatchHistoryList } from "../stats/MatchHistoryList";
import MatchH2HPanel from "../live/MatchH2HPanel";
import { teamName } from "../../utils/matchDisplay";
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
    odds: null,
  };
}

/** Inline match editor — shown below a friendly row when its edit button is tapped. */
function FriendlyEditor({
  friendlyId,
  match,
  clubs,
  clubsById,
  onSaved,
  onCancel,
}: {
  friendlyId: number;
  match: Match;
  clubs: Club[];
  clubsById: Map<number, { game: string }>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const { token } = useAuth();

  const aSide = match.sides.find((s) => s.side === "A");
  const bSide = match.sides.find((s) => s.side === "B");

  const [activeView, setActiveView] = useState<"h2h" | "edit">("edit");

  // Derive initial game from existing clubs
  const initialGame = useMemo(() => {
    const id = aSide?.club_id ?? bSide?.club_id;
    if (id) return clubsById.get(id)?.game ?? "EA FC 26";
    return "EA FC 26";
  }, [aSide?.club_id, bSide?.club_id, clubsById]);

  const [clubGame, setClubGame] = useState(initialGame);
  const [aClub, setAClub] = useState<number | null>(aSide?.club_id ?? null);
  const [bClub, setBClub] = useState<number | null>(bSide?.club_id ?? null);
  const [aGoals, setAGoals] = useState(String(Math.max(0, Number(aSide?.goals ?? 0))));
  const [bGoals, setBGoals] = useState(String(Math.max(0, Number(bSide?.goals ?? 0))));

  const aGoalsNum = parseGoal(aGoals);
  const bGoalsNum = parseGoal(bGoals);

  const editorClubsQ = useQuery({
    queryKey: qk.clubs(clubGame),
    queryFn: () => listClubs(clubGame),
    staleTime: 60_000,
  });

  const previewMatch = useMemo<Match>(() => ({
    ...match,
    sides: [
      { id: aSide?.id ?? -11, side: "A", players: aSide?.players ?? [], club_id: aClub, goals: aGoalsNum },
      { id: bSide?.id ?? -12, side: "B", players: bSide?.players ?? [], club_id: bClub, goals: bGoalsNum },
    ],
  }), [aClub, aGoalsNum, bClub, bGoalsNum, match, aSide, bSide]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (!token) throw new Error("Missing token");
      return patchFriendlyMatch(token, friendlyId, {
        state: "finished",
        sideA: { club_id: aClub, goals: aGoalsNum },
        sideB: { club_id: bClub, goals: bGoalsNum },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.friendlies() });
      await qc.invalidateQueries({ queryKey: qk.stats.all() });
      onSaved();
    },
  });

  const aPlayers = teamName(aSide);
  const bPlayers = teamName(bSide);

  // Clubs: one panel under the preview holds slots, filters and randomisers (T9).
  const clubSelection = useClubSelection({
    clubs: editorClubsQ.data ?? clubs,
    disabled: saveMut.isPending,
    aLabel: aPlayers,
    bLabel: bPlayers,
    aClub,
    bClub,
    onChangeAClub: setAClub,
    onChangeBClub: setBClub,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <SegmentedSwitch<"h2h" | "edit">
          value={activeView}
          onChange={setActiveView}
          options={[
            { key: "edit", label: "Edit result" },
            { key: "h2h", label: "H2H" },
          ]}
          ariaLabel="Friendly editor view"
        />
      </div>

      {activeView === "h2h" ? (
        <MatchH2HPanel match={match} clubs={editorClubsQ.data ?? clubs} />
      ) : (
        <>
          <ErrorToastOnError error={saveMut.error} title="Could not save" />

          <MatchOverviewPanel
            match={previewMatch}
            clubs={editorClubsQ.data ?? clubs}
            aGoals={aGoalsNum}
            bGoals={bGoalsNum}
            showOdds={false}
          />

          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            <div className="flex justify-start">
              <GoalStepper
                value={aGoalsNum}
                onChange={(v) => setAGoals(String(v))}
                disabled={saveMut.isPending}
                ariaLabel="Goals left"
              />
            </div>
            <div />
            <div className="flex justify-end">
              <GoalStepper
                value={bGoalsNum}
                onChange={(v) => setBGoals(String(v))}
                disabled={saveMut.isPending}
                ariaLabel="Goals right"
              />
            </div>
          </div>

          <SelectClubsPanel
            selection={clubSelection}
            storageKey="friendly-edit"
            defaultOpen
            extraTop={<Input label="Game" value={clubGame} onChange={(e) => setClubGame(e.target.value)} />}
          />

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
            <Button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : "Save result"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function FriendlyMatchesListCard({ onInitialReady }: { onInitialReady?: () => void }) {
  const qc = useQueryClient();
  const { role, token } = useAuth();
  const canDelete = role === "admin" && !!token;
  const canEdit = role === "admin" && !!token;
  const [mode, setMode] = useState<ModeFilter>("all");
  const [showMeta, setShowMeta] = useState(false);
  const [expandedFriendlyId, setExpandedFriendlyId] = useState<number | null>(null);
  const initialReadyFiredRef = useRef(false);

  const clubsQ = useQuery({
    queryKey: qk.clubs(),
    queryFn: () => listClubs(),
    staleTime: 60_000,
  });

  const friendliesQ = useQuery({
    queryKey: qk.friendlies(mode),
    queryFn: () => listFriendlies({ mode: mode === "all" ? undefined : mode, limit: 500 }),
    staleTime: 10_000,
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
      return { id: groupId, name: "Friendlies", date: dateKey, mode: groupMode, status: "friendly", matches };
    });
  }, [friendliesQ.data]);

  const deleteMut = useMutation({
    mutationFn: (friendlyId: number) => {
      if (!token) throw new Error("Missing token");
      return deleteFriendlyMatch(token, friendlyId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.friendlies() });
      void qc.invalidateQueries({ queryKey: qk.stats.all() });
    },
  });

  useEffect(() => {
    if (initialReadyFiredRef.current) return;
    if (friendliesQ.isLoading || clubsQ.isLoading) return;
    initialReadyFiredRef.current = true;
    onInitialReady?.();
  }, [friendliesQ.isLoading, clubsQ.isLoading, onInitialReady]);

  function findFriendlyById(fid: number): FriendlyMatchResponse | null {
    return (friendliesQ.data ?? []).find((f) => Number(f.id) === Number(fid)) ?? null;
  }

  const content = (
    <>
      <ErrorToastOnError error={friendliesQ.error} title="Friendly matches loading failed" />
      <ErrorToastOnError error={clubsQ.error} title="Clubs loading failed" />
      <ErrorToastOnError error={deleteMut.error} title="Could not delete friendly" />

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="section-label">Mode</span>
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
        <div className="flex items-center gap-2">
          <span className="section-label">View</span>
          <SegmentedSwitch<boolean>
            value={showMeta}
            onChange={setShowMeta}
            options={[
              { key: false, label: "Compact", icon: <Shrink size={14} aria-hidden="true" /> },
              { key: true, label: "Details", icon: <List size={14} aria-hidden="true" /> },
            ]}
            ariaLabel="Friendly details toggle"
            title="View details"
          />
        </div>
      </div>

      {friendliesQ.isLoading && !friendliesQ.data ? <InlineLoading label="Loading…" /> : null}

      {!friendliesQ.isLoading && tournaments.length === 0 ? (
        <EmptyState title="No friendlies yet." className="py-8" />
      ) : null}

      {tournaments.length ? (
        <div style={{ overflowAnchor: "none" }}>
          <MatchHistoryList
            tournaments={tournaments}
            clubs={clubsQ.data ?? []}
            showMeta={showMeta}
            renderMatchActions={(_t, m) => {
              if (!canDelete && !canEdit) return null;
              const fid = Number(m.id);
              if (!fid) return null;
              const isExpanded = expandedFriendlyId === fid;
              const pendingDelete = deleteMut.isPending && deleteMut.variables === fid;

              return (
                <div className="inline-flex items-center gap-1">
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="ghost" size="sm" iconOnly
                      title={isExpanded ? "Close editor" : `Edit friendly #${fid}`}
                      onClick={() => setExpandedFriendlyId(isExpanded ? null : fid)}
                    >
                      {isExpanded ? <X size={14} aria-hidden="true" /> : <Pencil size={14} aria-hidden="true" />}
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      type="button"
                      variant="ghost" size="sm" iconOnly
                      title={`Delete friendly #${fid}`}
                      disabled={pendingDelete}
                      onClick={() => {
                        if (!window.confirm(`Delete friendly #${fid}?`)) return;
                        if (isExpanded) setExpandedFriendlyId(null);
                        deleteMut.mutate(fid);
                      }}
                    >
                      {pendingDelete ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
                    </Button>
                  ) : null}
                </div>
              );
            }}
            /* The editor is a panel, not a row action: full width under its row, so
               nothing is clipped by the action slot's `shrink-0` (T2's finding). */
            renderMatchExpanded={(_t, m) => {
              if (!canEdit) return null;
              const fid = Number(m.id);
              if (!fid || expandedFriendlyId !== fid) return null;
              const row = findFriendlyById(fid);
              if (!row) return null;
              return (
                <FriendlyEditor
                  friendlyId={fid}
                  match={friendlyToMatch(row, 0)}
                  clubs={clubsQ.data ?? []}
                  clubsById={clubsById}
                  onSaved={() => setExpandedFriendlyId(null)}
                  onCancel={() => setExpandedFriendlyId(null)}
                />
              );
            }}
          />
        </div>
      ) : null}
    </>
  );

  return <div className="space-y-3">{content}</div>;
}
