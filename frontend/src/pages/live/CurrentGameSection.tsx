import { ArrowRightLeft, Flag, MessagesSquare, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import Button from "../../ui/primitives/Button";
import ConfirmDialog from "../../ui/primitives/ConfirmDialog";
import type { Club, Match, MatchSide, Player, TournamentMode } from "../../api/types";
import { teamName } from "../../utils/matchDisplay";
import { sideBy } from "../../helpers";
import MatchOverviewPanel from "../../ui/primitives/MatchOverviewPanel";
import SelectClubsPanel from "../../ui/SelectClubsPanel";
import { GoalStepper, useClubSelection } from "../../ui/clubControls";
import { scrollToSectionById } from "../../ui/scrollToSection";
import TournamentCommentsCard from "./TournamentCommentsCard";


function namesInline(side?: MatchSide) {
  return teamName(side);
}

type PatchPayload = {
  aGoals: number;
  bGoals: number;
  aClub: number | null;
  bClub: number | null;
};
type MatchPatchBody = {
  state: Match["state"];
  sideA: { club_id: number | null; goals: number };
  sideB: { club_id: number | null; goals: number };
};

export default function CurrentGameSection({
  status,
  tournamentMode,
  match,
  clubs,
  players = [],
  canControl,
  canDeleteComments,
  busy,
  onPatch,
  onSwapSides,
  onOpenMatch,
}: {
  status: "draft" | "live" | "done";
  tournamentMode?: TournamentMode | null;
  match: Match | null;
  clubs: Club[];
  players?: Player[];
  canControl: boolean;
  canDeleteComments: boolean;
  busy: boolean;
  onPatch: (matchId: number, body: MatchPatchBody) => Promise<unknown>;
  onSwapSides?: (matchId: number) => Promise<unknown>;
  onOpenMatch?: (match: Match) => void;
}) {
  // const tid = match && (match as any).tournament_id != null ? Number((match as any).tournament_id) : null;
  // useTournamentWS(tid);
  const activeMatch = match;
  const isVisible = status !== "done" && !!activeMatch;

  const a = activeMatch ? sideBy(activeMatch, "A") : undefined;
  const b = activeMatch ? sideBy(activeMatch, "B") : undefined;

  const aInline = useMemo(() => namesInline(a), [a]);
  const bInline = useMemo(() => namesInline(b), [b]);

  const [aClub, setAClub] = useState<number | null>(a?.club_id ?? null);
  const [bClub, setBClub] = useState<number | null>(b?.club_id ?? null);
  const [aGoals, setAGoals] = useState<number>(Number(a?.goals ?? 0));
  const [bGoals, setBGoals] = useState<number>(Number(b?.goals ?? 0));
  /** Reset wipes a real result, finishing an unplayed match records one: both ask (R2). */
  const [resetAsked, setResetAsked] = useState(false);
  const [finishAsked, setFinishAsked] = useState(false);

  // Clubs: `SelectClubsPanel` below holds the whole job — both slots, the
  // filters and the two random actions — behind one disclosure (T9).
  const clubSelection = useClubSelection({
    clubs,
    disabled: busy || !canControl,
    aLabel: aInline,
    bLabel: bInline,
    aClub,
    bClub,
    onChangeClubs: (aId, bId) => {
      setAClub(aId);
      setBClub(bId);
      queueAutosave({ aClub: aId, bClub: bId });
    },
    onChangeAClub: (v) => {
      if (v === aClub) return;
      setAClub(v);
      queueAutosave({ aClub: v });
    },
    onChangeBClub: (v) => {
      if (v === bClub) return;
      setBClub(v);
      queueAutosave({ bClub: v });
    },
  });

  // -------------------------
  // AUTO-SAVE (debounced)
  // -------------------------
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<PatchPayload | null>(null);
  const lastKeyRef = useRef<string>("");

  function makeKey(m: Match, p: PatchPayload) {
    return JSON.stringify({
      matchId: m.id,
      state: m.state,
      aGoals: p.aGoals,
      bGoals: p.bGoals,
      aClub: p.aClub,
      bClub: p.bClub,
    });
  }

  function clearAutosave() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  async function flushAutosave() {
    if (!canControl) return;
    if (!activeMatch) return;

    const nextState = activeMatch.state;
    if (nextState == null) return;

    const p = pendingRef.current;
    if (!p) return;

    const key = makeKey(activeMatch, p);
    if (key === lastKeyRef.current) return;

    if (busy) {
      clearAutosave();
      timerRef.current = window.setTimeout(() => {
        void flushAutosave();
      }, 250);
      return;
    }

    lastKeyRef.current = key;

    try {
      await onPatch(activeMatch.id, {
        state: nextState,
        sideA: { club_id: p.aClub, goals: p.aGoals },
        sideB: { club_id: p.bClub, goals: p.bGoals },
      });
    } catch {
      lastKeyRef.current = "";
    }
  }

  function queueAutosave(override?: Partial<PatchPayload>) {
    if (!canControl) return;
    if (!activeMatch) return;

    const p: PatchPayload = {
      aGoals: override?.aGoals ?? aGoals,
      bGoals: override?.bGoals ?? bGoals,
      aClub: override?.aClub ?? aClub,
      bClub: override?.bClub ?? bClub,
    };

    pendingRef.current = p;

    const key = makeKey(activeMatch, p);
    if (key === lastKeyRef.current) return;

    clearAutosave();
    timerRef.current = window.setTimeout(() => {
      void flushAutosave();
    }, 350);
  }

  // Re-sync local editor state whenever backend updates this match
  useEffect(() => {
    if (!activeMatch) return;
    const next: PatchPayload = {
      aGoals: Number(a?.goals ?? 0),
      bGoals: Number(b?.goals ?? 0),
      aClub: a?.club_id ?? null,
      bClub: b?.club_id ?? null,
    };

    // Sync local draft UI with server snapshot for this match.
    /* eslint-disable react-hooks/set-state-in-effect */
    setAClub(next.aClub);
    setBClub(next.bClub);
    setAGoals(next.aGoals);
    setBGoals(next.bGoals);
    /* eslint-enable react-hooks/set-state-in-effect */

    clearAutosave();
    pendingRef.current = next;
    lastKeyRef.current = makeKey(activeMatch, next);
  }, [activeMatch, a?.club_id, b?.club_id, a?.goals, b?.goals]);

  const isScheduled = activeMatch?.state === "scheduled";
  const showGoalInputs = canControl && !isScheduled;

  async function save(stateOverride?: "scheduled" | "playing" | "finished", override?: Partial<PatchPayload>) {
    if (!canControl) return;
    if (!activeMatch) return;

    clearAutosave();

    const nextState = stateOverride ?? activeMatch.state;
    if (nextState == null) return;

    const payload: PatchPayload = {
      aGoals: override?.aGoals ?? aGoals,
      bGoals: override?.bGoals ?? bGoals,
      aClub: override?.aClub ?? aClub,
      bClub: override?.bClub ?? bClub,
    };

    pendingRef.current = payload;
    lastKeyRef.current = makeKey(activeMatch, payload);

    await onPatch(activeMatch.id, {
      state: nextState,
      sideA: { club_id: payload.aClub, goals: payload.aGoals },
      sideB: { club_id: payload.bClub, goals: payload.bGoals },
    });
  }

  async function reset() {
    if (!canControl) return;
    setAGoals(0);
    setBGoals(0);
    await save("scheduled", { aGoals: 0, bGoals: 0 });
  }

  if (!isVisible || !activeMatch) return null;

  return (
    <div className="space-y-3">
      {/* Live score editor: the MatchOverviewPanel below is the single surface. */}
      <div className="space-y-2">
        <div className="flex items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                scrollToSectionById(`current-match-comments-${activeMatch.id}`, 16, 0, "smooth");
              }}
              title="Open comments for this match"
            >
              <MessagesSquare size={14} className="md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Comments</span>
            </Button>

            {canControl && onSwapSides && (
              <Button
                variant="ghost"
                onClick={() => {
                  void onSwapSides(activeMatch.id);
                }}
                disabled={busy}
                title="Swap home/away (A↔B)"
              >
                <ArrowRightLeft size={14} className="md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">Swap Home/Away</span>
              </Button>
            )}

            {canControl && activeMatch.state === "scheduled" && (
              <Button
                variant="ghost"
                onClick={() => {
                  void save("playing");
                }}
                disabled={busy}
                title="Start"
              >
                <Play size={14} className="md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">Start</span>
              </Button>
            )}

            {canControl && activeMatch.state !== "scheduled" && (
              <Button
                variant="ghost"
                onClick={() => setResetAsked(true)}
                disabled={busy}
                title="Reset"
              >
                <RotateCcw size={14} className="md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">Reset</span>
              </Button>
            )}

            {canControl && (
              <Button
                disabled={busy}
                onClick={() => {
                  // Finishing a match that was never started records a result nobody
                  // played — the one case worth asking about.
                  if (activeMatch.state === "scheduled") {
                    setFinishAsked(true);
                    return;
                  }
                  void save("finished");
                }}
                title="Finish match"
              >
                <Flag size={14} className="md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">Finish</span>
              </Button>
            )}
          </div>
        </div>

        {/* The panel is read-only and opens the match detail; the clubs are set
            in the club panel below it (T9). */}
        <div className="relative">
          <MatchOverviewPanel
            match={activeMatch}
            clubs={clubs}
            mode={tournamentMode}
            aGoals={aGoals}
            bGoals={bGoals}
            showOdds={true}
          />
          {onOpenMatch ? (
            <button
              type="button"
              className="focus-ring absolute inset-0 rounded-xl"
              onClick={() => onOpenMatch(activeMatch)}
              aria-label="Open match details"
              title="Open match details"
            />
          ) : null}
        </div>

        {showGoalInputs ? (
          <div className="pt-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4">
              <div className="flex justify-start">
                <GoalStepper
                  value={aGoals}
                  onChange={(v) => {
                    setAGoals(v);
                    queueAutosave({ aGoals: v });
                  }}
                  disabled={busy}
                  ariaLabel="Goals left"
                />
              </div>
              <div />
              <div className="flex justify-end">
                <GoalStepper
                  value={bGoals}
                  onChange={(v) => {
                    setBGoals(v);
                    queueAutosave({ bGoals: v });
                  }}
                  disabled={busy}
                  ariaLabel="Goals right"
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-2 space-y-2">
        {/* One panel for the whole club job: collapsed it is a single "Clubs" row
            naming both clubs, open it holds the slots, the filters and the
            randomisers. The choice sticks per surface (T9). */}
        {canControl && <SelectClubsPanel selection={clubSelection} storageKey="live-current" />}

        {Number.isFinite(Number(activeMatch.tournament_id)) && activeMatch.tournament_id > 0 ? (
          <div id={`current-match-comments-${activeMatch.id}`} className="scroll-mt-28 sm:scroll-mt-32">
            <TournamentCommentsCard
              tournamentId={activeMatch.tournament_id}
              matches={[activeMatch]}
              clubs={clubs}
              players={players}
              canWrite={canControl}
              canDelete={canDeleteComments}
              onlyMatchId={activeMatch.id}
              showMatchHeader={false}
              title="Match comments"
            />
          </div>
        ) : null}
      </div>

      {/* Reset throws a played result away, so it names the score it wipes (DESIGN.md §7). */}
      <ConfirmDialog
        open={resetAsked}
        title="Reset this match?"
        subtitle="It goes back to scheduled, ready to be played again."
        confirmLabel="Reset match"
        busyLabel="Resetting…"
        busy={busy}
        onCancel={() => setResetAsked(false)}
        onConfirm={() => {
          setResetAsked(false);
          void reset();
        }}
      >
        <div>
          {aInline} {aGoals}–{bGoals} {bInline} is wiped.
        </div>
        <div>The clubs stay; the standings drop this match until it is played again.</div>
      </ConfirmDialog>

      {/* Nothing is lost by finishing — Reset puts it back — so no red block. */}
      <ConfirmDialog
        open={finishAsked}
        title={`Finish this match at ${aGoals}:${bGoals}?`}
        subtitle="It was never started. It counts as a played result in the standings, and Reset puts it back."
        confirmLabel="Finish match"
        busyLabel="Finishing…"
        busy={busy}
        onCancel={() => setFinishAsked(false)}
        onConfirm={() => {
          setFinishAsked(false);
          void save("finished");
        }}
      />
    </div>
  );
}
