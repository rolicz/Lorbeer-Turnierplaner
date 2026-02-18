import Sheet from "../../ui/primitives/Sheet";
import Input from "../../ui/primitives/Input";
import Button from "../../ui/primitives/Button";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import type { Club, Match } from "../../api/types";
import { sideBy } from "../../helpers";
import { useMemo } from "react";
import MatchOverviewPanel from "../../ui/primitives/MatchOverviewPanel";
import SelectClubsPanel from "../../ui/SelectClubsPanel";
import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";
import {
  GoalStepper,
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
  showState = true,
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
  showState?: boolean;
}) {
  const aSide = match ? sideBy(match, "A") : undefined;
  const bSide = match ? sideBy(match, "B") : undefined;

  const aPlayers = aSide?.players.map((p) => p.display_name).join(" + ") ?? "—";
  const bPlayers = bSide?.players.map((p) => p.display_name).join(" + ") ?? "—";

  const aGoalsNum = parseGoal(aGoals);
  const bGoalsNum = parseGoal(bGoals);

  const previewMatch = useMemo<Match | null>(() => {
    if (!match) return null;
    const a = sideBy(match, "A");
    const b = sideBy(match, "B");
    return {
      ...match,
      state,
      sides: [
        {
          id: a?.id ?? -11,
          side: "A",
          players: a?.players ?? [],
          club_id: aClub,
          goals: aGoalsNum,
        },
        {
          id: b?.id ?? -12,
          side: "B",
          players: b?.players ?? [],
          club_id: bClub,
          goals: bGoalsNum,
        },
      ],
    };
  }, [aClub, aGoalsNum, bClub, bGoalsNum, match, state]);

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
            {showState ? (
              <div className="card-inner space-y-2">
                <div className="mb-2 text-sm font-medium">Match State</div>
                <div className="flex">
                  <SegmentedSwitch<"scheduled" | "playing" | "finished">
                    value={state}
                    onChange={setState}
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
              </div>
            ) : null}

            {/* Match panel (shared with live current game/dashboard) */}
            <div className="card-inner space-y-2">
              {previewMatch ? (
                <MatchOverviewPanel
                  match={previewMatch}
                  clubs={clubs}
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
                  "pt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-4 " +
                  (state === "scheduled" ? "opacity-55" : "")
                }
              >
                <div className="flex justify-start">
                  <GoalStepper
                    value={aGoalsNum}
                    onChange={(v) => setAGoals(String(v))}
                    disabled={saving || state === "scheduled"}
                    ariaLabel="Goals left"
                  />
                </div>
                <div />
                <div className="flex justify-end">
                  <GoalStepper
                    value={bGoalsNum}
                    onChange={(v) => setBGoals(String(v))}
                    disabled={saving || state === "scheduled"}
                    ariaLabel="Goals right"
                  />
                </div>
              </div>
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
              wrapClassName="card-inner"
              narrowLayout
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
