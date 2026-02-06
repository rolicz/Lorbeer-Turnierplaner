import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../../ui/primitives/Button";
import type { Club, Match, MatchSide } from "../../api/types";
// import { useTournamentWS } from "../../hooks/useTournamentWS";
import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import { StarsFA } from "../../ui/primitives/StarsFA";
import { Pill, statusMatchPill } from "../../ui/primitives/Pill";
import ClubStarsEditor from "../../ui/ClubStarsEditor";
import {
  ClubSelect,
  GoalStepper,
  LeagueFilter,
  type LeagueOpt,
  StarFilter,
  clubLabelPartsById,
  ensureSelectedClubVisible,
  leagueInfo,
  randomClubAssignmentOk,
  sortClubsForDropdown,
  toHalfStep,
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

type PatchPayload = {
  aGoals: number;
  bGoals: number;
  aClub: number | null;
  bClub: number | null;
};

export default function CurrentGameSection({
  status,
  match,
  clubs,
  canControl,
  busy,
  onPatch,
  onSwapSides,
}: {
  status: "draft" | "live" | "done";
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

  const a = sideBy(match, "A");
  const b = sideBy(match, "B");

  const aNames = useMemo(() => namesStack(a), [a]);
  const bNames = useMemo(() => namesStack(b), [b]);

  const aInline = useMemo(() => namesInline(a), [a]);
  const bInline = useMemo(() => namesInline(b), [b]);

  const clubsSorted = useMemo(() => sortClubsForDropdown(clubs), [clubs]);

  // ⭐ filter (does NOT change selected club; only changes what you can pick next)
  const [starFilter, setStarFilter] = useState<number | null>(null);

  // 🏆 league filter (does NOT change selected club; only changes what you can pick next)
  const leagueOptions = useMemo<LeagueOpt[]>(() => {
    const byId = new Map<number, string>();
    for (const c of clubsSorted) {
      const li = leagueInfo(c);
      if (li.id == null) continue;
      if (!byId.has(li.id)) byId.set(li.id, li.name ?? `League #${li.id}`);
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((x, y) => x.name.localeCompare(y.name));
  }, [clubsSorted]);

  const [leagueFilter, setLeagueFilter] = useState<number | null>(null);

  const clubsFiltered = useMemo(() => {
    let out = clubsSorted;

    if (starFilter != null) {
      out = out.filter((c) => toHalfStep(c.star_rating) === starFilter);
    }
    if (leagueFilter != null) {
      out = out.filter((c) => leagueInfo(c).id === leagueFilter);
    }

    return out;
  }, [clubsSorted, starFilter, leagueFilter]);

  const [aClub, setAClub] = useState<number | null>(a?.club_id ?? null);
  const [bClub, setBClub] = useState<number | null>(b?.club_id ?? null);
  const [aGoals, setAGoals] = useState<number>(Number(a?.goals ?? 0));
  const [bGoals, setBGoals] = useState<number>(Number(b?.goals ?? 0));

  const aClubParts = useMemo(() => clubLabelPartsById(clubs, aClub), [clubs, aClub]);
  const bClubParts = useMemo(() => clubLabelPartsById(clubs, bClub), [clubs, bClub]);

  // Make sure current clubs remain visible even if filter excludes them
  const clubsForA = useMemo(
    () => ensureSelectedClubVisible(clubsFiltered, clubsSorted, aClub),
    [clubsFiltered, clubsSorted, aClub]
  );
  const clubsForB = useMemo(
    () => ensureSelectedClubVisible(clubsFiltered, clubsSorted, bClub),
    [clubsFiltered, clubsSorted, bClub]
  );

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

      {/* MOBILE */}
      <div className="space-y-3 md:hidden">
        <div className="card-subtle">
          {/* Row 1: Leg, match number, state pill */}
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-[11px] sm:text-xs text-text-muted">
              Match #{match.order_index + 1}
            </div>
            <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap">
              <Pill>
                leg {match.leg}
              </Pill>
              <Pill
                className={`${statusMatchPill(
                  match.state
                )}`}
              >
                {match.state}
              </Pill>
              
            </div>
          </div>

          {/* Row 2: NAMES + SCORE */}
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
            <div className="min-w-0">
              {aNames.map((n, i) => (
                <div
                  key={`${n}-${i}`}
                  className="text-[15px] font-semibold text-text-normal whitespace-normal break-words leading-tight"
                >
                  {n}
                </div>
              ))}
            </div>

            <div className="card-chip flex items-center justify-center gap-2">
              <span className="text-xl font-semibold tabular-nums">{scoreLeft}</span>
              <span className="text-text-muted">:</span>
              <span className="text-xl font-semibold tabular-nums">{scoreRight}</span>
            </div>

            <div className="min-w-0 text-right">
              {bNames.map((n, i) => (
                <div
                  key={`${n}-${i}`}
                  className="text-[15px] font-semibold text-text-normal whitespace-normal break-words leading-tight"
                >
                  {n}
                </div>
              ))}
            </div>
          </div>

          {/* Row 3: CLUBS */}
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-xs text-text-muted">
            <div className="min-w-0 whitespace-normal break-words leading-tight">{aClubParts.name}</div>
            <div />
            <div className="min-w-0 whitespace-normal break-words leading-tight text-right">{bClubParts.name}</div>
          </div>
          {/* Row 4: LEAGUES */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 text-xs text-text-muted">
            <div className="min-w-0 whitespace-normal break-words leading-tight">{aClubParts.league_name}</div>
            <div />
            <div className="min-w-0 whitespace-normal break-words leading-tight text-right">{bClubParts.league_name}</div>
          </div>

          {/* Row 5: STARS */}
          <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-[11px] text-text-muted">
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
            <div className="mt-3 flex items-center justify-center gap-4">
              <GoalStepper
                value={aGoals}
                onChange={(v) => {
                  setAGoals(v);
                  queueAutosave({ aGoals: v });
                }}
                disabled={busy}
                ariaLabel="Goals left"
              />
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
          )}
        </div>

        {/* Filter + Clubs */}
        {canControl && (
          <CollapsibleCard title="Select Clubs" defaultOpen={false} className="panel-subtle">
            <div className="grid grid-cols-1 gap-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <StarFilter value={starFilter} onChange={setStarFilter} disabled={busy} />
                <LeagueFilter
                  value={leagueFilter}
                  onChange={setLeagueFilter}
                  disabled={busy}
                  options={leagueOptions}
                />
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!clubsFiltered.length) return;

                    const clubA = clubsFiltered[Math.floor(Math.random() * clubsFiltered.length)];
                    let clubB = clubsFiltered[Math.floor(Math.random() * clubsFiltered.length)];

                    if (clubsFiltered.length > 1) {
                      while (!randomClubAssignmentOk(clubA, clubB)) {
                        clubB = clubsFiltered[Math.floor(Math.random() * clubsFiltered.length)];
                      }
                    }

                    setAClub(clubA.id);
                    setBClub(clubB.id);
                    queueAutosave({ aClub: clubA.id, bClub: clubB.id });
                  }}
                  disabled={busy}
                  className="whitespace-nowrap"
                >
                  <i className="fa fa-rotate-left" aria-hidden="true" />
                  <span className="ml-2 hidden sm:inline">Random Club</span>
                  <span className="ml-2 sm:hidden">Random</span>
                </Button>
              </div>

              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <div className="min-w-0">
                  <ClubSelect
                    label={`${aInline} — club`}
                    value={aClub}
                    onChange={(v) => {
                      if (v === aClub) return; // only save on actual change
                      setAClub(v);
                      queueAutosave({ aClub: v });
                    }}
                    disabled={!canControl || busy}
                    clubs={clubsForA}
                    placeholder="Select club…"
                  />
                </div>
                <ClubStarsEditor clubId={aClub} clubs={clubs} disabled={!canControl || busy} />
              </div>

              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <div className="min-w-0">
                  <ClubSelect
                    label={`${bInline} — club`}
                    value={bClub}
                    onChange={(v) => {
                      if (v === bClub) return; // only save on actual change
                      setBClub(v);
                      queueAutosave({ bClub: v });
                    }}
                    disabled={!canControl || busy}
                    clubs={clubsForB}
                    placeholder="Select club…"
                  />
                </div>
                <ClubStarsEditor clubId={bClub} clubs={clubs} disabled={!canControl || busy} />
              </div>
            </div>
          </CollapsibleCard>
        )}
      </div>

      {/* DESKTOP/TABLET */}
      <div className="hidden md:block space-y-3">
        <div className="card-subtle">
          {/* Row 1: Leg, match number, state pill */}
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-[11px] sm:text-xs text-text-muted">
              Match #{match.order_index + 1}
            </div>
            <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap">
              <Pill>
                leg {match.leg}
              </Pill>
              <Pill
                className={`${statusMatchPill(
                  match.state
                )}`}
              >
                {match.state}
              </Pill>
              
            </div>
          </div>

          {/* Row 2: NAMES + SCORE */}
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="min-w-0">
              {aNames.map((n, i) => (
                <div key={`${n}-${i}`} className="truncate text-lg font-semibold text-text-normal leading-tight">
                  {n}
                </div>
              ))}
            </div>

            <div className="card-chip flex items-center justify-center gap-2">
              <span className="text-xl font-semibold tabular-nums">{scoreLeft}</span>
              <span className="text-text-muted">:</span>
              <span className="text-xl font-semibold tabular-nums">{scoreRight}</span>
            </div>

            <div className="min-w-0 text-right">
              {bNames.map((n, i) => (
                <div key={`${n}-${i}`} className="truncate text-lg font-semibold text-text-normal leading-tight">
                  {n}
                </div>
              ))}
            </div>
          </div>

          {/* Row 3: CLUBS */}
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-4 text-sm text-text-muted">
            <div className="min-w-0 truncate">{aClubParts.name}</div>
            <div />
            <div className="min-w-0 truncate text-right">{bClubParts.name}</div>
          </div>
          {/* Row 4: CLUBS */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4 text-sm text-text-muted">
            <div className="min-w-0 truncate">{aClubParts.league_name}</div>
            <div />
            <div className="min-w-0 truncate text-right">{bClubParts.league_name}</div>
          </div>

          {/* Row 5: STARS */}
          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-sm text-text-muted">
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
            <div className="mt-3 flex items-center justify-center gap-4">
              <GoalStepper
                value={aGoals}
                onChange={(v) => {
                  setAGoals(v);
                  queueAutosave({ aGoals: v });
                }}
                disabled={busy}
                ariaLabel="Goals left"
              />
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
          )}
        </div>

        {canControl && (
          <CollapsibleCard title="Select Clubs" defaultOpen={false} className="panel-subtle">
            <div className="grid gap-4">
              {/* Row 1: filters + random */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_auto_1fr] md:items-end">
                <StarFilter value={starFilter} onChange={setStarFilter} disabled={busy} compact />

                <LeagueFilter
                  value={leagueFilter}
                  onChange={setLeagueFilter}
                  disabled={busy}
                  options={leagueOptions}
                  compact
                />

                <div className="flex md:justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (!clubsFiltered.length) return;

                      // pick two distinct clubs (optional but nicer)
                      const clubA = clubsFiltered[Math.floor(Math.random() * clubsFiltered.length)];
                      let clubB = clubsFiltered[Math.floor(Math.random() * clubsFiltered.length)];
                      if (clubsFiltered.length > 1) {
                        while (!randomClubAssignmentOk(clubA, clubB)) {
                          clubB = clubsFiltered[Math.floor(Math.random() * clubsFiltered.length)];
                        }
                      }

                      setAClub(clubA.id);
                      setBClub(clubB.id);
                      queueAutosave({ aClub: clubA.id, bClub: clubB.id });
                    }}
                    disabled={busy}
                    className="w-full whitespace-nowrap md:w-auto"
                  >
                    <i className="fa fa-rotate-left md:hidden" aria-hidden="true" />
                    <span className="hidden md:inline">Random Club</span>
                    <span className="md:hidden">Random</span>
                  </Button>
                </div>
              </div>

              {/* Row 2: club dropdowns (+ inline star edit for editor/admin) */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-end">
                <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                  <div className="min-w-0">
                    <ClubSelect
                      label={`${aInline} — club`}
                      value={aClub}
                      onChange={(v) => {
                        if (v === aClub) return;
                        setAClub(v);
                        queueAutosave({ aClub: v });
                      }}
                      disabled={!canControl || busy}
                      clubs={clubsForA}
                      placeholder="Select club…"
                    />
                  </div>
                  <ClubStarsEditor clubId={aClub} clubs={clubs} disabled={!canControl || busy} />
                </div>

                <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                  <div className="min-w-0">
                    <ClubSelect
                      label={`${bInline} — club`}
                      value={bClub}
                      onChange={(v) => {
                        if (v === bClub) return;
                        setBClub(v);
                        queueAutosave({ bClub: v });
                      }}
                      disabled={!canControl || busy}
                      clubs={clubsForB}
                      placeholder="Select club…"
                    />
                  </div>
                  <ClubStarsEditor clubId={bClub} clubs={clubs} disabled={!canControl || busy} />
                </div>
              </div>
            </div>


          </CollapsibleCard>
        )}
      </div>
    </div>
  );
}
