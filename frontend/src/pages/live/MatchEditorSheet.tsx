import Sheet from "../../ui/primitives/Sheet";
import Input from "../../ui/primitives/Input";
import Button from "../../ui/primitives/Button";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import type { Club, Match } from "../../api/types";
import { sideBy } from "../../helpers";
import { useMemo } from "react";
import { StarsFA } from "../../ui/primitives/StarsFA";
import { Pill, statusMatchPill } from "../../ui/primitives/Pill";
import SelectClubsPanel from "../../ui/SelectClubsPanel";
import {
  GoalStepper,
  clubLabelPartsById,
} from "../../ui/clubControls";

export default function MatchEditorSheet({
  open,
  onClose,
  match,
  clubs,
  clubsLoading,
  clubsError,
  clubGame,
  setClubGame,
  aClub,
  bClub,
  setAClub,
  setBClub,
  aGoals,
  bGoals,
  setAGoals,
  setBGoals,
  state,
  setState,
  onSave,
  saving,
  saveError,
}: {
  open: boolean;
  onClose: () => void;
  match: Match | null;
  clubs: Club[];
  clubsLoading: boolean;
  clubsError: string | null;
  clubGame: string;
  setClubGame: (v: string) => void;
  aClub: number | null;
  bClub: number | null;
  setAClub: (v: number | null) => void;
  setBClub: (v: number | null) => void;
  aGoals: string;
  bGoals: string;
  setAGoals: (v: string) => void;
  setBGoals: (v: string) => void;
  state: "scheduled" | "playing" | "finished";
  setState: (v: "scheduled" | "playing" | "finished") => void;
  onSave: () => void;
  saving: boolean;
  saveError: string | null;
}) {
  const aSide = match ? sideBy(match, "A") : undefined;
  const bSide = match ? sideBy(match, "B") : undefined;

  const aNames = useMemo(() => aSide?.players?.map((p) => p.display_name) ?? ["—"], [aSide]);
  const bNames = useMemo(() => bSide?.players?.map((p) => p.display_name) ?? ["—"], [bSide]);

  const aPlayers = aSide?.players.map((p) => p.display_name).join(" + ") ?? "—";
  const bPlayers = bSide?.players.map((p) => p.display_name).join(" + ") ?? "—";

  const aClubParts = useMemo(() => clubLabelPartsById(clubs, aClub), [clubs, aClub]);
  const bClubParts = useMemo(() => clubLabelPartsById(clubs, bClub), [clubs, bClub]);

  const aGoalsNum = parseGoal(aGoals);
  const bGoalsNum = parseGoal(bGoals);
  const showGoalInputs = state !== "scheduled";
  const leader: "A" | "B" | null = !showGoalInputs || aGoalsNum === bGoalsNum ? null : aGoalsNum > bGoalsNum ? "A" : "B";

  const scoreLeft = showGoalInputs ? String(aGoalsNum) : "-";
  const scoreRight = showGoalInputs ? String(bGoalsNum) : "-";

  return (
    <Sheet open={open} title={`Edit Match #${match?.id ?? "—"}`} onClose={onClose}>
      <ErrorToastOnError error={clubsError} title="Clubs loading failed" />
      <ErrorToastOnError error={saveError} title="Could not save match" />
      {!match ? (
        <div className="text-sm text-text-muted">No match selected.</div>
      ) : (
        <div className="flex max-h-[80vh] flex-col">
          {/* Scroll area */}
          <div className="flex-1 space-y-4 overflow-y-auto pr-1 [-webkit-overflow-scrolling:touch]">
            <div className="panel p-3">
              <div className="mb-2 text-sm font-medium">Match State</div>
              <div className="grid grid-cols-3 gap-2">
                {(["scheduled", "playing", "finished"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      state === s
                        ? "border-accent/60 bg-bg-card-inner"
                        : "border-border-card-inner/70 transition hover:bg-hover-default/40"
                    }`}
                    onClick={() => setState(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="mt-2 text-xs text-text-muted">
                <span className="break-anywhere">{aPlayers}</span>{" "}
                <span className="text-text-muted">vs</span>{" "}
                <span className="break-anywhere">{bPlayers}</span>
              </div>
            </div>

            {/* Match display (like Current Game) */}
            <div className="card-subtle">
              {/* Row 1: match number + pills */}
              <div className="mt-1 flex items-center justify-between gap-3">
                <div className="text-[11px] sm:text-xs text-text-muted">Match #{match.order_index + 1}</div>
                <div className="flex items-center gap-2 flex-nowrap whitespace-nowrap">
                  <Pill>leg {match.leg}</Pill>
                  <Pill className={statusMatchPill(state)}>{state}</Pill>
                </div>
              </div>

              {/* Row 2: names + score */}
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

              {/* Row 3: clubs */}
              <div className="mt-2 md:mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 md:gap-4 text-xs md:text-sm text-text-muted">
                <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{aClubParts.name}</div>
                <div />
                <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight text-right">{bClubParts.name}</div>
              </div>

              {/* Row 4: leagues */}
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 md:gap-4 text-xs md:text-sm text-text-muted">
                <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight">{aClubParts.league_name}</div>
                <div />
                <div className="min-w-0 whitespace-normal md:truncate break-words leading-tight text-right">{bClubParts.league_name}</div>
              </div>

              {/* Row 5: stars */}
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4 text-[11px] md:text-sm text-text-muted">
                <div className="min-w-0">
                  <StarsFA rating={aClubParts.rating ?? 0} textClassName="text-text-muted" />
                </div>
                <div />
                <div className="min-w-0 flex justify-end">
                  <StarsFA rating={bClubParts.rating ?? 0} textClassName="text-text-muted" />
                </div>
              </div>

              {/* Row 6: score inputs */}
              {showGoalInputs && (
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4">
                  <div className="flex justify-start">
                    <GoalStepper
                      value={aGoalsNum}
                      onChange={(v) => setAGoals(String(v))}
                      disabled={saving}
                      ariaLabel="Goals left"
                    />
                  </div>
                  <div />
                  <div className="flex justify-end">
                    <GoalStepper
                      value={bGoalsNum}
                      onChange={(v) => setBGoals(String(v))}
                      disabled={saving}
                      ariaLabel="Goals right"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Clubs (re-used from Current Game) */}
            <SelectClubsPanel
              clubs={clubs}
              disabled={saving}
              aLabel={`${aPlayers} — club`}
              bLabel={`${bPlayers} — club`}
              aClub={aClub}
              bClub={bClub}
              onChangeAClub={setAClub}
              onChangeBClub={setBClub}
              defaultOpen={false}
              extraTop={
                <div className="grid grid-cols-1 gap-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input label="Game" value={clubGame} onChange={(e) => setClubGame(e.target.value)} />
                    <div className="hidden md:block" />
                  </div>

                  {clubsLoading && <div className="text-sm text-text-muted">Loading clubs…</div>}
                </div>
              }
              extraBottom={
                <div className="text-xs text-text-muted">Tip: change clubs anytime before saving results.</div>
              }
            />

            <div className="h-2" />
          </div>

          {/* Fixed footer */}
          <div
            className="sticky bottom-0 shrink-0 border-t border-border-card-inner bg-bg-card-outer/95 backdrop-blur"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
          >
            <div className="px-0 pt-3">
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={onClose} type="button" title="Cancel">
                  <i className="fa fa-xmark md:hidden" aria-hidden="true" />
                  <span className="hidden md:inline">Cancel</span>
                </Button>
                <Button onClick={onSave} disabled={saving} type="button" title="Save">
                  <i className="fa fa-check md:hidden" aria-hidden="true" />
                  <span className="hidden md:inline">{saving ? "Saving…" : "Save"}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function parseGoal(v: string): number {
  const x = Number.parseInt(String(v ?? "").trim(), 10);
  if (!Number.isFinite(x) || Number.isNaN(x)) return 0;
  return Math.max(0, x);
}
