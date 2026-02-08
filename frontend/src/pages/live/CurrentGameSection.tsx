import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../../ui/primitives/Button";
import type { Club, Match, MatchSide } from "../../api/types";
// import { useTournamentWS } from "../../hooks/useTournamentWS";
import { StarsFA } from "../../ui/primitives/StarsFA";
import { Pill, statusMatchPill } from "../../ui/primitives/Pill";
import SelectClubsPanel from "../../ui/SelectClubsPanel";
import MatchCommentsPanel from "./MatchCommentsPanel";
import {
  GoalStepper,
  clubLabelPartsById,
} from "../../ui/clubControls";


function sideBy(m: Match, side: "A" | "B"): MatchSide | undefined {
  return m.sides.find((s) => s.side === side);
}

function namesStack(side?: MatchSide) {
  const ps = side?.players ?? [];
  if (!ps.length) return ["—"];
  return ps.map((p) => p.display_name);
}

function namesInline(side?: MatchSide) {
  const ps = side?.players ?? [];
  if (!ps.length) return "—";
  return ps.map((p) => p.display_name).join(" + ");
}

function fmtOdd(x: number) {
  return Number.isFinite(x) ? x.toFixed(2) : "—";
}

function OddsInline({ odds }: { odds: { home: number; draw: number; away: number } }) {
  return (
    <div className="mt-2 flex items-center justify-center">
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

type PatchPayload = {
  aGoals: number;
  bGoals: number;
  aClub: number | null;
  bClub: number | null;
};

export default function CurrentGameSection({
  status,
  tournamentId,
  match,
  clubs,
  canControl,
  busy,
  onPatch,
  onSwapSides,
}: {
  status: "draft" | "live" | "done";
  tournamentId?: number | null;
  match: Match | null;
  clubs: Club[];
  canControl: boolean;
  busy: boolean;
  onPatch: (matchId: number, body: any) => Promise<any>;
  onSwapSides?: (matchId: number) => Promise<any>;
}) {
  // const tid = match && (match as any).tournament_id != null ? Number((match as any).tournament_id) : null;
  // useTournamentWS(tid);

  if (status === "done" || !match) return null;

  const tidComments = useMemo(() => {
    if (tournamentId != null && Number.isFinite(tournamentId) && tournamentId > 0) return tournamentId;
    const anyMatch: any = match as any;
    const raw = anyMatch?.tournament_id ?? anyMatch?.tournamentId ?? null;
    const n = typeof raw === "string" ? Number(raw) : raw;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : NaN;
  }, [match, tournamentId]);

  const a = sideBy(match, "A");
  const b = sideBy(match, "B");

  const aNames = useMemo(() => namesStack(a), [a]);
  const bNames = useMemo(() => namesStack(b), [b]);

  const aInline = useMemo(() => namesInline(a), [a]);
  const bInline = useMemo(() => namesInline(b), [b]);

  const playersInMatch = useMemo(() => {
    const out: { id: number; display_name: string }[] = [];
    const seen = new Set<number>();
    for (const p of [...(a?.players ?? []), ...(b?.players ?? [])]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }, [a, b]);

  const [aClub, setAClub] = useState<number | null>(a?.club_id ?? null);
  const [bClub, setBClub] = useState<number | null>(b?.club_id ?? null);
  const [aGoals, setAGoals] = useState<number>(Number(a?.goals ?? 0));
  const [bGoals, setBGoals] = useState<number>(Number(b?.goals ?? 0));

  const aClubParts = useMemo(() => clubLabelPartsById(clubs, aClub), [clubs, aClub]);
  const bClubParts = useMemo(() => clubLabelPartsById(clubs, bClub), [clubs, bClub]);

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
    if (!match) return;

    const nextState = match.state;
    if (nextState == null) return;

    const p = pendingRef.current;
    if (!p) return;

    const key = makeKey(match, p);
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
      await onPatch(match.id, {
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
    if (!match) return;

    const p: PatchPayload = {
      aGoals: override?.aGoals ?? aGoals,
      bGoals: override?.bGoals ?? bGoals,
      aClub: override?.aClub ?? aClub,
      bClub: override?.bClub ?? bClub,
    };

    pendingRef.current = p;

    const key = makeKey(match, p);
    if (key === lastKeyRef.current) return;

    clearAutosave();
    timerRef.current = window.setTimeout(() => {
      void flushAutosave();
    }, 350);
  }

  // Re-sync local editor state whenever backend updates this match
  useEffect(() => {
    const next: PatchPayload = {
      aGoals: Number(a?.goals ?? 0),
      bGoals: Number(b?.goals ?? 0),
      aClub: a?.club_id ?? null,
      bClub: b?.club_id ?? null,
    };

    setAClub(next.aClub);
    setBClub(next.bClub);
    setAGoals(next.aGoals);
    setBGoals(next.bGoals);

    clearAutosave();
    pendingRef.current = next;
    lastKeyRef.current = makeKey(match, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.id, match?.state, a?.club_id, b?.club_id, a?.goals, b?.goals]);

  const isScheduled = match.state === "scheduled";
  const showGoalInputs = canControl && !isScheduled;
  const scoreLeft = isScheduled ? "-" : String(aGoals);
  const scoreRight = isScheduled ? "-" : String(bGoals);
  const leader: "A" | "B" | null = isScheduled || aGoals === bGoals ? null : aGoals > bGoals ? "A" : "B";

  async function save(stateOverride?: "scheduled" | "playing" | "finished", override?: Partial<PatchPayload>) {
    if (!canControl) return;
    if (!match) return;

    clearAutosave();

    const nextState = stateOverride ?? match.state;
    if (nextState == null) return;

    const payload: PatchPayload = {
      aGoals: override?.aGoals ?? aGoals,
      bGoals: override?.bGoals ?? bGoals,
      aClub: override?.aClub ?? aClub,
      bClub: override?.bClub ?? bClub,
    };

    pendingRef.current = payload;
    lastKeyRef.current = makeKey(match, payload);

    await onPatch(match.id, {
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

  return (
    <div className="space-y-3">
      {/* Top row */}
      <div className="flex items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          {canControl && onSwapSides && (
            <Button variant="ghost" onClick={() => onSwapSides(match.id)} disabled={busy} title="Swap home/away (A↔B)">
              <i className="fa fa-arrow-right-arrow-left md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Swap Home/Away</span>
            </Button>
          )}

          {canControl && match.state === "scheduled" && (
            <Button variant="ghost" onClick={() => save("playing")} disabled={busy} title="Start">
              <i className="fa fa-play md:hidden" aria-hidden="true" />
              <span className="hidden md:inline">Start</span>
            </Button>
          )}

          {canControl && match.state !== "scheduled" && (
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
                  match.state === "scheduled"
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

      {/* Match card */}
      <div className="panel-subtle p-3">
        {/* Row 1: Leg, match number, state pill */}
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="text-[11px] sm:text-xs text-text-muted">Match #{match.order_index + 1}</div>
          <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap">
            <Pill>leg {match.leg}</Pill>
            <Pill className={`${statusMatchPill(match.state)}`}>{match.state}</Pill>
          </div>
        </div>

        {/* Odds (scheduled/live only) */}
        {(match.state === "scheduled" || match.state === "playing") && match.odds ? (
          <OddsInline odds={match.odds} />
        ) : null}

        {/* Row 2: NAMES + SCORE (with guide lines for alignment) */}
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
              <span className="text-xl font-semibold tabular-nums">{scoreLeft}</span>
              <span className="text-text-muted">:</span>
              <span className="text-xl font-semibold tabular-nums">{scoreRight}</span>
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

        {/* Row 3: CLUBS */}
        <div className="mt-2 md:mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 md:gap-4 text-xs md:text-sm text-text-muted">
          <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{aClubParts.name}</div>
          <div />
          <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight text-right">{bClubParts.name}</div>
        </div>
        {/* Row 4: LEAGUES */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 md:gap-4 text-xs md:text-sm text-text-muted">
          <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{aClubParts.league_name}</div>
          <div />
          <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight text-right">{bClubParts.league_name}</div>
        </div>

        {/* Row 5: STARS */}
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4 text-[11px] md:text-sm text-text-muted">
          <div className="min-w-0">
            <StarsFA rating={aClubParts.rating ?? 0} textClassName="text-text-muted" />
          </div>
          <div />
          <div className="min-w-0 flex justify-end">
            <StarsFA rating={bClubParts.rating ?? 0} textClassName="text-text-muted" />
          </div>
        </div>

        {/* Row 6: INPUTS (only when NOT scheduled) */}
        {showGoalInputs && (
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4">
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
        )}
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
            wrapClassName="panel-inner"
          />
        )}

        <MatchCommentsPanel
          tournamentId={tidComments}
          matchId={match.id}
          canWrite={canControl}
          playersInMatch={playersInMatch}
        />
      </div>
    </div>
  );
}
