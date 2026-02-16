import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../../ui/primitives/Button";
import type { Club, Match, MatchSide, TournamentMode } from "../../api/types";
// import { useTournamentWS } from "../../hooks/useTournamentWS";
import MatchOverviewPanel from "../../ui/primitives/MatchOverviewPanel";
import SelectClubsPanel from "../../ui/SelectClubsPanel";
import { GoalStepper } from "../../ui/clubControls";
import { scrollToSectionById } from "../../ui/scrollToSection";


function sideBy(m: Match, side: "A" | "B"): MatchSide | undefined {
  return m.sides.find((s) => s.side === side);
}

function namesInline(side?: MatchSide) {
  const ps = side?.players ?? [];
  if (!ps.length) return "—";
  return ps.map((p) => p.display_name).join(" + ");
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
  canControl,
  busy,
  onPatch,
  onSwapSides,
}: {
  status: "draft" | "live" | "done";
  tournamentMode?: TournamentMode | null;
  match: Match | null;
  clubs: Club[];
  canControl: boolean;
  busy: boolean;
  onPatch: (matchId: number, body: MatchPatchBody) => Promise<unknown>;
  onSwapSides?: (matchId: number) => Promise<unknown>;
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
      {/* Match container: score card + score input */}
      <div className="card-inner space-y-2">
        <div className="flex items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                scrollToSectionById(`comments-block-match-${activeMatch.id}`, 16, 0, "smooth");
              }}
              title="Open comments for this match"
            >
              <i className="fa fa-comments md:hidden" aria-hidden="true" />
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
                <i className="fa fa-arrow-right-arrow-left md:hidden" aria-hidden="true" />
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
                <i className="fa fa-play md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">Start</span>
              </Button>
            )}

            {canControl && activeMatch.state !== "scheduled" && (
              <Button
                variant="ghost"
                onClick={() => {
                  const text = "This will reset the match to 0:0 and scheduled state. Are you sure?";
                  if (!window.confirm(text)) return;
                  void reset();
                }}
                disabled={busy}
                title="Reset"
              >
                <i className="fa fa-rotate-left md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">Reset</span>
              </Button>
            )}

            {canControl && (
              <Button
                disabled={busy}
                onClick={() => {
                  const text =
                    activeMatch.state === "scheduled"
                      ? "Match not started. Are you sure you want to finish this match (0:0)?"
                      : undefined;
                  if (text && !window.confirm(text)) return;
                  void save("finished");
                }}
                title="Finish match"
              >
                <i className="fa fa-flag-checkered md:hidden" aria-hidden="true" />
                <span className="hidden md:inline">Finish</span>
              </Button>
            )}
          </div>
        </div>

        <MatchOverviewPanel
          match={activeMatch}
          clubs={clubs}
          mode={tournamentMode}
          aGoals={aGoals}
          bGoals={bGoals}
          showModePill={true}
          showOdds={true}
          surface="panel"
        />

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

      <div className="mt-3 space-y-2">
        {/* Filter + clubs */}
        {canControl && (
          <SelectClubsPanel
            clubs={clubs}
            disabled={busy || !canControl}
            aLabel={`${aInline} — club`}
            bLabel={`${bInline} — club`}
            aClub={aClub}
            bClub={bClub}
            onChangeClubs={(aId, bId) => {
              setAClub(aId);
              setBClub(bId);
              queueAutosave({ aClub: aId, bClub: bId });
            }}
            onChangeAClub={(v) => {
              if (v === aClub) return;
              setAClub(v);
              queueAutosave({ aClub: v });
            }}
            onChangeBClub={(v) => {
              if (v === bClub) return;
              setBClub(v);
              queueAutosave({ bClub: v });
            }}
            defaultOpen={false}
            wrapClassName="card-inner"
          />
        )}
      </div>
    </div>
  );
}
