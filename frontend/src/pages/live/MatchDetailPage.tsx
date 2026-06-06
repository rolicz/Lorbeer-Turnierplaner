import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import Button from "../../ui/primitives/Button";
import Input from "../../ui/primitives/Input";
import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import PageLoadingScreen from "../../ui/primitives/PageLoadingScreen";
import MatchOverviewPanel from "../../ui/primitives/MatchOverviewPanel";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";
import SelectClubsPanel from "../../ui/SelectClubsPanel";
import { GoalStepper } from "../../ui/clubControls";

import { getTournament } from "../../api/tournaments.api";
import { patchMatch, swapMatchSides } from "../../api/matches.api";
import { listClubs } from "../../api/clubs.api";
import type { Match } from "../../api/types";
import { sideBy } from "../../helpers";
import { useAuth } from "../../auth/AuthContext";
import { useRouteEntryLoading } from "../../ui/layout/useRouteEntryLoading";

import MatchH2HPanel from "./MatchH2HPanel";

type Tab = "h2h" | "edit";
const TABS: SectionTab<Tab>[] = [
  { key: "h2h", label: "Head-to-Head" },
  { key: "edit", label: "Edit result" },
];

function parseGoal(v: string): number {
  const x = Number.parseInt(String(v ?? "").trim(), 10);
  if (!Number.isFinite(x) || Number.isNaN(x)) return 0;
  return Math.max(0, x);
}

export default function MatchDetailPage() {
  const { id, mid } = useParams();
  const tid = id ? Number(id) : null;
  const matchId = mid ? Number(mid) : null;

  const nav = useNavigate();
  const qc = useQueryClient();
  const pageEntered = useRouteEntryLoading();
  const { role, token } = useAuth();
  const canEdit = role === "admin" || role === "editor";
  const isAdmin = role === "admin";

  const [activeTab, setActiveTab] = useState<Tab>("h2h");
  const [clubGame, setClubGame] = useState("EA FC 26");

  const tQ = useQuery({
    queryKey: ["tournament", tid],
    queryFn: () => getTournament(tid!),
    enabled: !!tid,
  });

  const clubsQ = useQuery({
    queryKey: ["clubs", clubGame],
    queryFn: () => listClubs(clubGame),
    enabled: !!tid,
  });

  const match = useMemo<Match | null>(() => {
    if (!tQ.data || !matchId) return null;
    return tQ.data.matches.find((m) => Number(m.id) === matchId) ?? null;
  }, [tQ.data, matchId]);

  const isDone = (tQ.data?.status ?? "draft") === "done";
  const canEditResult = canEdit && !isDone;

  // Form state — kept in sync with the match
  const [aClub, setAClub] = useState<number | null>(null);
  const [bClub, setBClub] = useState<number | null>(null);
  const [aGoals, setAGoals] = useState("0");
  const [bGoals, setBGoals] = useState("0");
  const [mState, setMState] = useState<"scheduled" | "playing" | "finished">("scheduled");

  useEffect(() => {
    if (!match) return;
    const a = sideBy(match, "A");
    const b = sideBy(match, "B");
    setAClub(a?.club_id ?? null);
    setBClub(b?.club_id ?? null);
    setAGoals(String(Math.max(0, Number(a?.goals ?? 0))));
    setBGoals(String(Math.max(0, Number(b?.goals ?? 0))));
    setMState(match.state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id]);

  const aGoalsNum = parseGoal(aGoals);
  const bGoalsNum = parseGoal(bGoals);

  const previewMatch = useMemo<Match | null>(() => {
    if (!match) return null;
    const a = sideBy(match, "A");
    const b = sideBy(match, "B");
    return {
      ...match,
      state: mState,
      sides: [
        { id: a?.id ?? -11, side: "A", players: a?.players ?? [], club_id: aClub, goals: aGoalsNum },
        { id: b?.id ?? -12, side: "B", players: b?.players ?? [], club_id: bClub, goals: bGoalsNum },
      ],
    };
  }, [aClub, aGoalsNum, bClub, bGoalsNum, match, mState]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!token || !matchId) throw new Error("Not logged in");
      return patchMatch(token, matchId, {
        state: mState,
        sideA: { club_id: aClub, goals: aGoalsNum },
        sideB: { club_id: bClub, goals: bGoalsNum },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tournament", tid] });
      await qc.invalidateQueries({ queryKey: ["cup"] }).catch(() => {});
      nav(`/live/${tid}`, { state: { scrollTo: "matches" } });
    },
  });

  const swapMut = useMutation({
    mutationFn: async () => {
      if (!token || !matchId) throw new Error("Not logged in");
      return swapMatchSides(token, matchId);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tournament", tid] });
    },
  });

  if (!tid || !matchId) {
    return <div className="panel-subtle px-3 py-2 text-sm text-text-muted">Invalid match URL.</div>;
  }

  const initialLoading = !pageEntered || (!tQ.error && !tQ.data && tQ.isLoading);
  if (initialLoading) {
    return <div className="page"><PageLoadingScreen sectionCount={3} /></div>;
  }

  if (!match && tQ.data) {
    return (
      <div className="page">
        <div className="panel-subtle px-3 py-2 text-sm text-text-muted">
          Match not found in tournament.
          <button type="button" className="ml-2 text-accent" onClick={() => nav(`/live/${tid}`)}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const aSide = match ? sideBy(match, "A") : undefined;
  const bSide = match ? sideBy(match, "B") : undefined;
  const aPlayers = aSide?.players.map((p) => p.display_name).join(" + ") ?? "—";
  const bPlayers = bSide?.players.map((p) => p.display_name).join(" + ") ?? "—";
  const tournamentName = tQ.data?.name ?? `Tournament #${tid}`;

  const tabs = canEditResult ? TABS : TABS.filter((t) => t.key === "h2h");

  return (
    <div className="page">
      {/* Header */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => nav(`/live/${tid}`)}
          className="mb-2 inline-flex items-center gap-1 text-xs text-text-muted transition hover:text-text-normal"
        >
          <ChevronLeft size={14} />
          {tournamentName}
        </button>
        <h1 className="text-xl font-bold tracking-tight text-text-normal">
          Match #{matchId}
        </h1>
        {match ? (
          <p className="mt-1 text-sm text-text-muted">
            {aPlayers} vs {bPlayers}
          </p>
        ) : null}
      </div>

      <ErrorToastOnError error={tQ.error} title="Tournament loading failed" />
      <ErrorToastOnError error={saveMut.error} title="Could not save match" />
      <ErrorToastOnError error={clubsQ.error} title="Could not load clubs" />

      {match ? (
        <>
          {tabs.length > 1 ? (
            <SectionTabs tabs={tabs} active={activeTab} onChange={setActiveTab} className="mb-4" />
          ) : null}

          {activeTab === "h2h" || tabs.length === 1 ? (
            <MatchH2HPanel match={match} clubs={clubsQ.data ?? []} />
          ) : null}

          {activeTab === "edit" && canEditResult ? (
            <div className="space-y-4">
              {/* Live preview */}
              <section className="card-outer space-y-3">
                <h2 className="text-sm font-semibold text-text-normal">Result</h2>

                <div>
                  <div className="mb-1 text-xs font-medium text-text-muted">Status</div>
                  <SegmentedSwitch<"scheduled" | "playing" | "finished">
                    value={mState}
                    onChange={setMState}
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
                    aGoals={aGoalsNum}
                    bGoals={bGoalsNum}
                    showModePill={false}
                    showOdds={true}
                    showOddsWhenFinished={true}
                    surface="panel"
                  />
                ) : null}

                <div
                  className={
                    "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 " +
                    (mState === "scheduled" ? "opacity-55" : "")
                  }
                >
                  <div className="flex justify-start">
                    <GoalStepper
                      value={aGoalsNum}
                      onChange={(v) => setAGoals(String(v))}
                      disabled={saveMut.isPending || mState === "scheduled"}
                      ariaLabel="Goals left"
                    />
                  </div>
                  <div />
                  <div className="flex justify-end">
                    <GoalStepper
                      value={bGoalsNum}
                      onChange={(v) => setBGoals(String(v))}
                      disabled={saveMut.isPending || mState === "scheduled"}
                      ariaLabel="Goals right"
                    />
                  </div>
                </div>
              </section>

              {/* Clubs */}
              <SelectClubsPanel
                clubs={clubsQ.data ?? []}
                disabled={saveMut.isPending}
                aLabel={`${aPlayers} — club`}
                bLabel={`${bPlayers} — club`}
                aClub={aClub}
                bClub={bClub}
                onChangeAClub={setAClub}
                onChangeBClub={setBClub}
                defaultOpen={false}
                wrapClassName="card-outer"
                narrowLayout
                extraTop={
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input label="Game" value={clubGame} onChange={(e) => setClubGame(e.target.value)} />
                    {clubsQ.isLoading && <div className="text-sm text-text-muted">Loading clubs…</div>}
                  </div>
                }
                extraBottom={
                  <div className="text-xs text-text-muted">Tip: change clubs anytime before saving.</div>
                }
              />

              {/* Swap sides (admin only) */}
              {isAdmin ? (
                <section className="card-outer">
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
                  {saveMut.isPending ? "Saving…" : "Save result"}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
