import Sheet from "../../ui/primitives/Sheet";
import Input from "../../ui/primitives/Input";
import Button from "../../ui/primitives/Button";
import CollapsibleCard from "../../ui/primitives/CollapsibleCard";
import type { Club, Match } from "../../api/types";
import { sideBy } from "../../helpers";
import { useMemo, useState } from "react";
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

  const aPlayers = aSide?.players.map((p) => p.display_name).join(" + ") ?? "—";
  const bPlayers = bSide?.players.map((p) => p.display_name).join(" + ") ?? "—";

  const aClubParts = useMemo(() => clubLabelPartsById(clubs, aClub), [clubs, aClub]);
  const bClubParts = useMemo(() => clubLabelPartsById(clubs, bClub), [clubs, bClub]);

  const clubsSorted = useMemo(() => sortClubsForDropdown(clubs), [clubs]);
  const [starFilter, setStarFilter] = useState<number | null>(null);

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

  const clubsForA = useMemo(
    () => ensureSelectedClubVisible(clubsFiltered, clubsSorted, aClub),
    [clubsFiltered, clubsSorted, aClub]
  );
  const clubsForB = useMemo(
    () => ensureSelectedClubVisible(clubsFiltered, clubsSorted, bClub),
    [clubsFiltered, clubsSorted, bClub]
  );

  const aGoalsNum = parseGoal(aGoals);
  const bGoalsNum = parseGoal(bGoals);
  const showGoalInputs = state !== "scheduled";

  return (
    <Sheet open={open} title={`Edit Match #${match?.id ?? "—"}`} onClose={onClose}>
      {!match ? (
        <div className="text-sm text-zinc-400">No match selected.</div>
      ) : (
        <div className="flex max-h-[80vh] flex-col">
          {/* Scroll area */}
          <div className="flex-1 space-y-4 overflow-y-auto pr-1 [-webkit-overflow-scrolling:touch]">
            <div className="rounded-xl border border-zinc-800 p-3">
              <div className="mb-2 text-sm font-medium">Match State</div>
              <div className="grid grid-cols-3 gap-2">
                {(["scheduled", "playing", "finished"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      state === s
                        ? "border-zinc-600 bg-zinc-900"
                        : "border-zinc-800 hover:bg-zinc-900/40"
                    }`}
                    onClick={() => setState(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="mt-2 text-xs text-zinc-500">
                <span className="break-anywhere">{aPlayers}</span>{" "}
                <span className="text-zinc-600">vs</span>{" "}
                <span className="break-anywhere">{bPlayers}</span>
              </div>
            </div>

            {/* Goals (players + club) */}
            <div className="rounded-xl border border-zinc-800 p-3">
              <div className="mb-2 text-sm font-medium">Score</div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-zinc-800 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{aPlayers}</div>
                    <div className="truncate text-xs text-zinc-500">{aClubParts.name}</div>
                  </div>

                  {showGoalInputs && (
                    <div className="mt-3 flex items-center gap-2 md:justify-start">
                      <GoalStepper
                        value={aGoalsNum}
                        onChange={(v) => setAGoals(String(v))}
                        disabled={saving}
                        ariaLabel="Goals left"
                      />
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-zinc-800 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{bPlayers}</div>
                    <div className="truncate text-xs text-zinc-500">{bClubParts.name}</div>
                  </div>

                  {showGoalInputs && (
                    <div className="mt-3 flex items-center gap-2 md:justify-start">
                      <GoalStepper
                        value={bGoalsNum}
                        onChange={(v) => setBGoals(String(v))}
                        disabled={saving}
                        ariaLabel="Goals right"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Clubs (filters + dropdowns) */}
            <CollapsibleCard title="Select Clubs" defaultOpen={false}>
              <div className="grid grid-cols-1 gap-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input
                    label="Game"
                    value={clubGame}
                    onChange={(e) => setClubGame(e.target.value)}
                  />
                  <div className="hidden md:block" />
                </div>

                {clubsLoading && (
                  <div className="mt-2 text-sm text-zinc-400">Loading clubs…</div>
                )}
                {clubsError && (
                  <div className="mt-2 text-sm text-red-400">{clubsError}</div>
                )}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <StarFilter value={starFilter} onChange={setStarFilter} disabled={saving} />
                  <LeagueFilter
                    value={leagueFilter}
                    onChange={setLeagueFilter}
                    disabled={saving}
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
                    }}
                    disabled={saving}
                    className="whitespace-nowrap"
                  >
                    <i className="fa fa-rotate-left" aria-hidden="true" />
                    <span className="ml-2 hidden sm:inline">Random Club</span>
                    <span className="ml-2 sm:hidden">Random</span>
                  </Button>
                </div>

                <ClubSelect
                  label={`${aPlayers} — club`}
                  value={aClub}
                  onChange={setAClub}
                  disabled={saving}
                  clubs={clubsForA}
                  placeholder="Select club…"
                />

                <ClubSelect
                  label={`${bPlayers} — club`}
                  value={bClub}
                  onChange={setBClub}
                  disabled={saving}
                  clubs={clubsForB}
                  placeholder="Select club…"
                />

                <div className="mt-2 text-xs text-zinc-500">
                  Tip: change clubs anytime before saving results.
                </div>
              </div>
            </CollapsibleCard>

            {saveError && <div className="text-sm text-red-400">{saveError}</div>}
            <div className="h-2" />
          </div>

          {/* Fixed footer */}
          <div
            className="sticky bottom-0 shrink-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur"
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
