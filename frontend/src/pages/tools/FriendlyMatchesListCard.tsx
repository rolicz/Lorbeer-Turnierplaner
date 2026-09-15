import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { List, Shrink, Trash2 } from "lucide-react";

import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import InlineLoading from "../../ui/primitives/InlineLoading";
import Input from "../../ui/primitives/Input";
import Button from "../../ui/primitives/Button";
import EmptyState from "../../ui/primitives/EmptyState";
import ConfirmDialog from "../../ui/primitives/ConfirmDialog";
import FilterPill, { filterGroup, type FilterPillGroup } from "../../ui/primitives/FilterPill";
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
import type { Club, Match, MatchSide } from "../../api/types";
import FriendlyList, { groupFriendliesByDate, normalizeFriendlyState } from "./FriendlyList";
import MatchH2HPanel from "../live/MatchH2HPanel";
import { teamName } from "../../utils/matchDisplay";
import { useAuth } from "../../auth/AuthContext";
import { readStored, writeStored } from "../../utils/safeStorage";

type ModeFilter = "all" | "1v1" | "2v2";
type ViewFilter = "compact" | "details";

/** The reader's last choice sticks, the `match_list_view` idiom (DESIGN.md §9b). */
const VIEW_KEY = "friendly_list_view";

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
    state: normalizeFriendlyState(f.state),
    started_at: f.created_at,
    finished_at: f.updated_at,
    sides,
    odds: null,
  };
}

/**
 * The friendly's editor — the one thing a row opens, so everything that can be done
 * to a friendly lives in here (Q7): the result, the clubs, the H2H, and **delete**.
 * It renders under its row at full width, behind an accent rail (`DESIGN.md` §9b).
 */
function FriendlyEditor({
  friendlyId,
  match,
  clubs,
  clubsById,
  canDelete,
  onRequestDelete,
  onSaved,
  onCancel,
}: {
  friendlyId: number;
  match: Match;
  clubs: Club[];
  clubsById: Map<number, { game: string }>;
  canDelete: boolean;
  onRequestDelete: () => void;
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

          {/* Delete is here and nowhere else: the row carries no controls, so the
              one place that can destroy a friendly is the editor that row opens. */}
          <div className="flex items-center justify-between gap-2">
            {canDelete ? (
              <Button
                variant="ghost"
                type="button"
                onClick={onRequestDelete}
                disabled={saveMut.isPending}
                title="Delete this friendly"
                className="inline-flex items-center gap-1.5"
              >
                <Trash2 size={14} aria-hidden="true" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
              <Button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {saveMut.isPending ? "Saving…" : "Save result"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function FriendlyMatchesListCard({ onInitialReady }: { onInitialReady?: () => void }) {
  const qc = useQueryClient();
  const { role, token } = useAuth();
  // Coarse gate only. Whether *this* friendly may be edited or deleted is the server's
  // answer, carried per row as `can_edit` / `can_delete` (A10) — an editor keeps their own
  // entry for an hour, an admin always.
  const isEditorOrAdmin = (role === "editor" || role === "admin") && !!token;
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [view, setView] = useState<ViewFilter>(() => (readStored(VIEW_KEY) === "details" ? "details" : "compact"));
  const [expandedFriendlyId, setExpandedFriendlyId] = useState<number | null>(null);
  const initialReadyFiredRef = useRef(false);
  const showMeta = view === "details";

  useEffect(() => {
    writeStored(VIEW_KEY, view);
  }, [view]);

  const clubsQ = useQuery({
    queryKey: qk.clubs(),
    queryFn: () => listClubs(),
    staleTime: 60_000,
  });

  const friendliesQ = useQuery({
    // The rows carry per-caller flags, so the viewer is part of the key.
    queryKey: qk.friendliesList(mode, token),
    queryFn: () => listFriendlies({ mode: mode === "all" ? undefined : mode, limit: 500, token }),
    staleTime: 10_000,
  });

  const clubsById = useMemo(() => {
    const out = new Map<number, { game: string }>();
    for (const c of clubsQ.data ?? []) out.set(c.id, { game: c.game });
    return out;
  }, [clubsQ.data]);

  const groups = useMemo(() => groupFriendliesByDate(friendliesQ.data ?? []), [friendliesQ.data]);

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

  // Mode filters what the list shows; the view only says how densely (so it never
  // marks the pill "filtered" — DESIGN.md §9).
  const filters: FilterPillGroup[] = [
    filterGroup<ModeFilter>({
      label: "Mode",
      value: mode,
      options: [
        { key: "all", label: "All" },
        { key: "1v1", label: "1v1" },
        { key: "2v2", label: "2v2" },
      ],
      onChange: setMode,
      defaultValue: "all",
      token: "text",
    }),
    filterGroup<ViewFilter>({
      label: "View",
      value: view,
      options: [
        { key: "compact", label: "Compact", icon: Shrink },
        { key: "details", label: "Details", icon: List },
      ],
      onChange: setView,
      defaultValue: "compact",
      token: "icon",
      display: true,
    }),
  ];

  const doomedFriendly = pendingDeleteId ? findFriendlyById(pendingDeleteId) : null;
  const doomedMatch = doomedFriendly ? friendlyToMatch(doomedFriendly) : null;
  const doomedSideA = doomedMatch?.sides.find((x) => x.side === "A");
  const doomedSideB = doomedMatch?.sides.find((x) => x.side === "B");

  return (
    // The last row still clears the floating pill (DESIGN.md §9).
    <div className="space-y-3 pb-16">
      <ErrorToastOnError error={friendliesQ.error} title="Friendly matches loading failed" />
      <ErrorToastOnError error={clubsQ.error} title="Clubs loading failed" />
      <ErrorToastOnError error={deleteMut.error} title="Could not delete friendly" />

      {friendliesQ.isLoading && !friendliesQ.data ? <InlineLoading label="Loading…" /> : null}

      {!friendliesQ.isLoading && groups.length === 0 ? (
        // The filter lives in the pill now, so an empty list has to say whether it is
        // empty or filtered — otherwise "no friendlies yet" is simply untrue.
        mode === "all" ? (
          <EmptyState title="No friendlies yet." className="py-8" />
        ) : (
          <EmptyState title={`No ${mode} friendlies.`} hint="Change Mode in the filter." className="py-8" />
        )
      ) : null}

      {groups.length ? (
        <div style={{ overflowAnchor: "none" }}>
          <FriendlyList
            groups={groups}
            clubs={clubsQ.data ?? []}
            showMeta={showMeta}
            expandedId={expandedFriendlyId}
            canEditRow={(f) => isEditorOrAdmin && !!f.can_edit}
            onToggleRow={(id) => setExpandedFriendlyId((cur) => (cur === id ? null : id))}
            renderEditor={(f) => (
              <FriendlyEditor
                friendlyId={f.id}
                match={friendlyToMatch(f, 0)}
                clubs={clubsQ.data ?? []}
                clubsById={clubsById}
                canDelete={!!f.can_delete}
                onRequestDelete={() => setPendingDeleteId(f.id)}
                onSaved={() => setExpandedFriendlyId(null)}
                onCancel={() => setExpandedFriendlyId(null)}
              />
            )}
          />
        </div>
      ) : null}

      <FilterPill groups={filters} ariaLabel="Friendlies filters" pulseKey="lk:friendlies-filter-pulsed" />

      <ConfirmDialog
        open={!!doomedFriendly}
        title="Delete this friendly?"
        subtitle="It disappears from the friendlies list and from every stat built on it."
        confirmLabel="Delete friendly"
        busy={deleteMut.isPending}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (!pendingDeleteId) return;
          if (expandedFriendlyId === pendingDeleteId) setExpandedFriendlyId(null);
          const fid = pendingDeleteId;
          setPendingDeleteId(null);
          deleteMut.mutate(fid);
        }}
      >
        <div>
          {teamName(doomedSideA)} {doomedSideA?.goals ?? 0}–{doomedSideB?.goals ?? 0}{" "}
          {teamName(doomedSideB)}
        </div>
        <div>Played on {doomedFriendly?.date ?? "—"}.</div>
        <div>This cannot be undone.</div>
      </ConfirmDialog>
    </div>
  );
}
