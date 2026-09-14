import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import Button from "../../ui/primitives/Button";
import Input from "../../ui/primitives/Input";
import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";
import { ErrorToastOnError, showErrorToast } from "../../ui/primitives/ErrorToast";
import PageLoadingScreen from "../../ui/primitives/PageLoadingScreen";
import MatchOverviewPanel from "../../ui/primitives/MatchOverviewPanel";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";
import PageLayout from "../../ui/layout/PageLayout";
import SelectClubsPanel from "../../ui/SelectClubsPanel";
import { GoalStepper, useClubSelection } from "../../ui/clubControls";
import InlineBack from "../../ui/shell/InlineBack";
import { useTabParam } from "../../ui/shell/useTabParam";
import { usePageTitle } from "../../ui/layout/PageTitleContext";

import { getTournament } from "../../api/tournaments.api";
import { patchMatch, swapMatchSides } from "../../api/matches.api";
import { listClubs } from "../../api/clubs.api";
import { qk } from "../../api/queryKeys";
import type { Match } from "../../api/types";
import { sideBy } from "../../helpers";
import { teamName } from "../../utils/matchDisplay";
import { useAuth } from "../../auth/AuthContext";
import { useRouteEntryLoading } from "../../ui/layout/useRouteEntryLoading";
import { useTournamentWS } from "../../hooks/useTournamentWS";

import MatchH2HPanel from "./MatchH2HPanel";
import TournamentCommentsCard from "./TournamentCommentsCard";
import {
  conflictFields,
  draftFromMatch,
  draftWithEdits,
  patchBodyForEdits,
  sameDraft,
  withEdit,
  type MatchDraft,
  type MatchDraftField,
  type MatchEdits,
} from "./matchDraft";

type Tab = "h2h" | "comments" | "edit";
const TAB_KEYS = ["h2h", "comments", "edit"] as const satisfies readonly Tab[];

const STATE_LABEL: Record<Match["state"], string> = {
  scheduled: "Scheduled",
  playing: "Playing",
  finished: "Finished",
};

/** Stable empties, so an untouched form keeps its identity across renders. */
const NO_EDITS: MatchEdits = {};
const BLANK_DRAFT: MatchDraft = {
  state: "scheduled",
  aGoals: 0,
  bGoals: 0,
  aClub: null,
  bClub: null,
};

function conflictLabel(f: MatchDraftField, aName: string, bName: string): string {
  if (f === "state") return "Status";
  if (f === "aGoals") return `Goals ${aName}`;
  if (f === "bGoals") return `Goals ${bName}`;
  if (f === "aClub") return `Club ${aName}`;
  return `Club ${bName}`;
}

function conflictValue(
  f: MatchDraftField,
  d: MatchDraft,
  clubName: (id: number | null) => string,
): string {
  if (f === "state") return STATE_LABEL[d.state];
  if (f === "aGoals") return String(d.aGoals);
  if (f === "bGoals") return String(d.bGoals);
  if (f === "aClub") return clubName(d.aClub);
  return clubName(d.bClub);
}

export default function MatchDetailPage() {
  const { id, mid } = useParams();
  const tid = id ? Number(id) : null;
  const matchId = mid ? Number(mid) : null;

  const nav = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const pageEntered = useRouteEntryLoading();
  const { role, token } = useAuth();
  const canEdit = role === "admin" || role === "editor";
  const isAdmin = role === "admin";

  // Where "back" returns to: the tab we came from (default Matches), at this match.
  const fromTab = (location.state as { fromTab?: string } | null)?.fromTab ?? "matches";
  const backTo = `/live/${tid}?tab=${fromTab}`;
  usePageTitle(matchId ? `Match #${matchId}` : "Match");

  const [rawTab, setActiveTab] = useTabParam<Tab>(TAB_KEYS, "h2h");
  const [clubGame, setClubGame] = useState("EA FC 26");

  const tQ = useQuery({
    queryKey: qk.tournament(tid!),
    queryFn: () => getTournament(tid!, token),
    enabled: !!tid,
  });

  // This page is a sibling route of the live page, so it needs its own
  // subscription — without it the match here is a snapshot from page load (A2).
  useTournamentWS(tid);

  const clubsQ = useQuery({
    queryKey: qk.clubs(clubGame),
    queryFn: () => listClubs(clubGame),
    enabled: !!tid,
  });

  const match = useMemo<Match | null>(() => {
    if (!tQ.data || !matchId) return null;
    return tQ.data.matches.find((m) => Number(m.id) === matchId) ?? null;
  }, [tQ.data, matchId]);

  // The server answers "may this caller change this result?" and ships the answer in the
  // payload (A10) — this page renders it instead of keeping its own copy of the rule. The
  // role check stays as the coarse gate, so an admin previewing as reader still sees a
  // reader's page.
  const canEditResult = canEdit && !!tQ.data?.can_edit;
  // `?tab=edit` only sticks while the result is actually editable.
  const activeTab: Tab = rawTab === "edit" && !canEditResult ? "h2h" : rawTab;

  // Form state (A2): only the fields THIS editor changed. Everything else
  // renders the server's current value, so a realtime update lands in the form
  // without ever re-seeding it under someone's hands.
  const [edits, setEdits] = useState<{ matchId: number | null; byField: MatchEdits }>({
    matchId: null,
    byField: {},
  });
  /** The conflicting server state this editor was last shown when a save was refused. */
  const [ack, setAck] = useState<MatchDraft | null>(null);

  const serverDraft = useMemo(() => (match ? draftFromMatch(match) : null), [match]);
  const activeEdits: MatchEdits = edits.matchId === matchId ? edits.byField : NO_EDITS;
  const draft = useMemo<MatchDraft>(
    () => (serverDraft ? draftWithEdits(serverDraft, activeEdits) : BLANK_DRAFT),
    [activeEdits, serverDraft],
  );

  const setField = useCallback(
    <K extends MatchDraftField>(field: K, value: MatchDraft[K]) => {
      if (!serverDraft || !matchId) return;
      setEdits((prev) => ({
        matchId,
        byField: withEdit(prev.matchId === matchId ? prev.byField : {}, serverDraft, field, value),
      }));
    },
    [matchId, serverDraft],
  );

  const dropEdits = useCallback(() => {
    setEdits({ matchId, byField: {} });
    setAck(null);
  }, [matchId]);

  /** Fields somebody else moved after we started changing them — shown, never resolved silently. */
  const conflicts = useMemo(
    () => (serverDraft ? conflictFields(activeEdits, serverDraft) : []),
    [activeEdits, serverDraft],
  );

  const previewMatch = useMemo<Match | null>(() => {
    if (!match) return null;
    const a = sideBy(match, "A");
    const b = sideBy(match, "B");
    return {
      ...match,
      state: draft.state,
      sides: [
        { id: a?.id ?? -11, side: "A", players: a?.players ?? [], club_id: draft.aClub, goals: draft.aGoals },
        { id: b?.id ?? -12, side: "B", players: b?.players ?? [], club_id: draft.bClub, goals: draft.bGoals },
      ],
    };
  }, [draft, match]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!token || !matchId || !tid) throw new Error("Not logged in");

      // The socket can be dead (backgrounded phone, flaky wifi), so read the
      // match once more right before writing: a save must never land on a
      // server state this editor was never shown.
      const fresh = await qc.fetchQuery({
        queryKey: qk.tournament(tid),
        queryFn: () => getTournament(tid, token),
        staleTime: 0,
      });
      const freshMatch = fresh.matches.find((m) => Number(m.id) === matchId) ?? null;
      const freshDraft = freshMatch ? draftFromMatch(freshMatch) : null;
      if (
        freshDraft &&
        conflictFields(activeEdits, freshDraft).length > 0 &&
        !sameDraft(ack, freshDraft)
      ) {
        return { outcome: "conflict" as const, server: freshDraft };
      }

      // Only what this editor changed: an untouched field keeps whatever the
      // other editor put there instead of being reverted to our snapshot.
      const body = patchBodyForEdits(activeEdits);
      if (!body) return { outcome: "unchanged" as const };
      await patchMatch(token, matchId, body);
      return { outcome: "saved" as const };
    },
    onSuccess: async (res) => {
      if (res.outcome === "conflict") {
        setAck(res.server);
        showErrorToast(
          "Someone else changed this match while you had it open. Nothing was sent — check the values on the page and press Save again to overwrite them.",
          "Not saved",
        );
        return;
      }
      if (res.outcome === "saved") {
        await qc.invalidateQueries({ queryKey: qk.tournament(tid!) });
        await qc.invalidateQueries({ queryKey: qk.cupAll() }).catch(() => {});
      }
      // `ownsScroll`: the Matches tab scrolls to (and flashes) this row itself, so
      // the shell must not restore the scroll over it (A9). Only there — returning
      // to any other tab nothing claims the scroll, and a push belongs at the top.
      nav(backTo, { state: { focusMatchId: matchId, ownsScroll: fromTab === "matches" } });
    },
  });

  const swapMut = useMutation({
    mutationFn: async () => {
      if (!token || !matchId) throw new Error("Not logged in");
      return swapMatchSides(token, matchId);
    },
    onSuccess: async () => {
      // The sides traded places, so pending per-side edits now mean the
      // opposite of what they meant — start from the server again.
      dropEdits();
      await qc.invalidateQueries({ queryKey: qk.tournament(tid!) });
    },
  });

  const aSide = match ? sideBy(match, "A") : undefined;
  const bSide = match ? sideBy(match, "B") : undefined;
  const aPlayers = teamName(aSide);
  const bPlayers = teamName(bSide);

  const clubName = useCallback(
    (id: number | null) => {
      if (id == null) return "no club";
      return (clubsQ.data ?? []).find((c) => c.id === id)?.name ?? `#${id}`;
    },
    [clubsQ.data],
  );

  // Clubs: one panel under the preview holds the whole job — both slots, the
  // filters and the two random actions (T9 / DESIGN.md §9b).
  const clubSelection = useClubSelection({
    clubs: clubsQ.data ?? [],
    disabled: saveMut.isPending,
    aLabel: aPlayers,
    bLabel: bPlayers,
    aClub: draft.aClub,
    bClub: draft.bClub,
    onChangeAClub: (v) => setField("aClub", v),
    onChangeBClub: (v) => setField("bClub", v),
  });

  if (!tid || !matchId) {
    return <div className="inset px-3 py-2 text-sm text-text-muted">Invalid match URL.</div>;
  }

  const initialLoading = !pageEntered || (!tQ.error && !tQ.data && tQ.isLoading);
  if (initialLoading) {
    return <div className="page"><PageLoadingScreen sectionCount={3} /></div>;
  }

  if (!match && tQ.data) {
    return (
      <div className="page">
        <div className="inset px-3 py-2 text-sm text-text-muted">
          Match not found in tournament.
          <button type="button" className="ml-2 text-accent" onClick={() => nav(`/live/${tid}`)}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const tabs: SectionTab<Tab>[] = [
    { key: "h2h", label: "Head-to-Head" },
    { key: "comments", label: "Comments" },
    ...(canEditResult ? [{ key: "edit" as Tab, label: "Edit result" }] : []),
  ];

  return (
    <PageLayout
      title={`Match #${matchId}`}
      back={<InlineBack />}
      meta={
        match ? (
          <span className="truncate text-sm text-text-muted">
            {aPlayers} vs {bPlayers}
          </span>
        ) : null
      }
    >
      <ErrorToastOnError error={tQ.error} title="Tournament loading failed" />
      <ErrorToastOnError error={saveMut.error} title="Could not save match" />
      <ErrorToastOnError error={clubsQ.error} title="Could not load clubs" />

      {match ? (
        <>
          <SectionTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

          {activeTab === "h2h" ? (
            <MatchH2HPanel match={match} clubs={clubsQ.data ?? []} />
          ) : null}

          {activeTab === "comments" ? (
            <TournamentCommentsCard
              tournamentId={tid}
              matches={tQ.data?.matches ?? []}
              clubs={clubsQ.data ?? []}
              players={tQ.data?.players ?? []}
              canWrite={canEdit}
              canDelete={isAdmin}
              onlyMatchId={matchId}
            />
          ) : null}

          {activeTab === "edit" && canEditResult ? (
            <div className="space-y-4">
              {/* Someone else edited the same match while this form was open (A2).
                  Their values are on the page; ours are still in the controls. */}
              {conflicts.length > 0 && serverDraft ? (
                <div
                  data-testid="match-conflict"
                  className="space-y-2 rounded-xl border border-draw/40 bg-draw/10 p-3 text-xs text-draw"
                >
                  <div className="text-sm font-semibold">Someone else changed this match</div>
                  <ul className="space-y-1">
                    {conflicts.map((f) => (
                      <li key={f}>
                        {conflictLabel(f, aPlayers, bPlayers)}: now{" "}
                        <span className="font-semibold">{conflictValue(f, serverDraft, clubName)}</span>{" "}
                        on the server — you have{" "}
                        <span className="font-semibold">{conflictValue(f, draft, clubName)}</span>.
                      </li>
                    ))}
                  </ul>
                  <div>
                    {ack
                      ? "Your save was not sent. Press Save again to overwrite the values above with yours."
                      : "Your edits are untouched. Saving asks you to confirm before it overwrites the values above."}
                  </div>
                  <Button variant="ghost" type="button" onClick={dropEdits}>
                    Use their values
                  </Button>
                </div>
              ) : null}

              {/* Live preview */}
              <section className="card space-y-3">
                <h2 className="text-sm font-semibold text-text-normal">Result</h2>

                <div>
                  <div className="mb-1 text-xs font-medium text-text-muted">Status</div>
                  <SegmentedSwitch<"scheduled" | "playing" | "finished">
                    value={draft.state}
                    onChange={(v) => setField("state", v)}
                    options={[
                      { key: "scheduled", label: "Scheduled" },
                      { key: "playing", label: "Playing" },
                      { key: "finished", label: "Finished" },
                    ]}
                    widthClass="w-[98px]"
                    ariaLabel="Match state"
                    title="Match state"
                  />
                </div>

                {previewMatch ? (
                  <MatchOverviewPanel
                    match={previewMatch}
                    clubs={clubsQ.data ?? []}
                    aGoals={draft.aGoals}
                    bGoals={draft.bGoals}
                    showOdds={true}
                    showOddsWhenFinished={true}
                  />
                ) : null}

                <div
                  className={
                    "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 " +
                    (draft.state === "scheduled" ? "opacity-55" : "")
                  }
                >
                  <div className="flex justify-start">
                    <GoalStepper
                      value={draft.aGoals}
                      onChange={(v) => setField("aGoals", v)}
                      disabled={saveMut.isPending || draft.state === "scheduled"}
                      ariaLabel="Goals left"
                    />
                  </div>
                  <div />
                  <div className="flex justify-end">
                    <GoalStepper
                      value={draft.bGoals}
                      onChange={(v) => setField("bGoals", v)}
                      disabled={saveMut.isPending || draft.state === "scheduled"}
                      ariaLabel="Goals right"
                    />
                  </div>
                </div>
              </section>

              {/* Clubs — the panel *is* the card here: its header names the job and
                  both clubs, and everything the job needs lives inside it (T9). */}
              <SelectClubsPanel
                selection={clubSelection}
                storageKey="match-detail"
                extraTop={
                  <div className="space-y-2">
                    <Input label="Game" value={clubGame} onChange={(e) => setClubGame(e.target.value)} />
                    {clubsQ.isLoading && <div className="text-sm text-text-muted">Loading clubs…</div>}
                  </div>
                }
                extraBottom={
                  <div className="text-xs text-text-muted">
                    Tip: nothing is saved until you press Save.
                  </div>
                }
              />

              {/* Swap sides (admin only) */}
              {isAdmin ? (
                <section className="card">
                  <h2 className="mb-2 text-sm font-semibold text-text-normal">Advanced</h2>
                  <Button
                    variant="ghost"
                    type="button"
                    disabled={swapMut.isPending}
                    onClick={() => {
                      if (!window.confirm("Swap sides A and B? This cannot be undone.")) return;
                      swapMut.mutate();
                    }}
                  >
                    {swapMut.isPending ? "Swapping…" : "Swap sides"}
                  </Button>
                </section>
              ) : null}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3">
                <Button variant="ghost" type="button" onClick={() => nav(`/live/${tid}`)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending}
                >
                  {saveMut.isPending
                    ? "Saving…"
                    : ack && conflicts.length > 0
                      ? "Save my changes anyway"
                      : "Save result"}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </PageLayout>
  );
}
