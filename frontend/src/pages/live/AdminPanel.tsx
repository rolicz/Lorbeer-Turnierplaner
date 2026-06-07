import { useEffect, useState } from "react";
import Button from "../../ui/primitives/Button";
import FilterSelect from "../../ui/FilterSelect";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";

type Status = "draft" | "live" | "done";
type DeciderType = "none" | "penalties" | "match" | "scheresteinpapier";

type Candidate = { id: number; name: string };

export default function AdminPanel({
  role,
  status,
  mode,

  // tournament actions (editor OR admin)
  secondLegEnabled,
  onEnableSecondLeg,
  onDisableSecondLeg,
  canDisableSecondLeg,
  onReshuffle,
  onReassign2v2,

  // admin-only actions
  onDeleteTournament,

  // busy/error
  busy,
  error,

  // optional: admin-only date editor
  dateValue,
  onDateChange,
  onSaveDate,
  dateBusy,

  nameValue,
  onNameChange,
  onSaveName,
  nameBusy,

  // NEW: emergency button to "re-open" last match if tournament accidentally became done
  onSetLastMatchPlaying,
  setLastMatchPlayingBusy,

  // decider editing (editor+admin)
  showDeciderEditor,
  deciderCandidates,
  currentDecider,
  onSaveDecider,
  deciderBusy,
  wrap = true,
}: {
  role: "reader" | "editor" | "admin";
  status: Status;

  secondLegEnabled: boolean;
  onEnableSecondLeg: () => void;
  onDisableSecondLeg: () => void;
  /** If false, "Remove second leg" is hidden (e.g. leg2 already started). */
  canDisableSecondLeg?: boolean;
  onReshuffle: () => void;

  mode: "1v1" | "2v2";
  onReassign2v2?: () => void;

  onDeleteTournament: () => void;

  busy: boolean;
  error: string | null;

  dateValue?: string;
  onDateChange?: (v: string) => void;
  onSaveDate?: () => void;
  dateBusy?: boolean;

  nameValue?: string;
  onNameChange?: (v: string) => void;
  onSaveName?: () => void;
  nameBusy?: boolean;

  onSetLastMatchPlaying?: () => void;
  setLastMatchPlayingBusy?: boolean;

  showDeciderEditor?: boolean;
  deciderCandidates?: Candidate[];
  currentDecider?: {
    type: DeciderType;
    winner_player_id: number | null;
    loser_player_id: number | null;
    winner_goals: number | null;
    loser_goals: number | null;
  };
  onSaveDecider?: (body: {
    type: DeciderType;
    winner_player_id: number | null;
    loser_player_id: number | null;
    winner_goals: number | null;
    loser_goals: number | null;
  }) => void;
  deciderBusy?: boolean;
  wrap?: boolean;
}) {
  const isAdmin = role === "admin";
  const isEditorOrAdmin = role === "editor" || role === "admin";
  const done = status === "done";

  // Editors: allow second-leg always (even if done). Reorder only if not done.
  const canSecondLeg = isEditorOrAdmin;
  const canReorder = isAdmin || (role === "editor" && !done);

  const showDateEditor = isAdmin && !!onSaveDate && !!onDateChange;
  const showNameEditor = isAdmin && !!onSaveName && !!onNameChange;

  // --- local decider form state ---
  const candidates = deciderCandidates ?? [];
  const [dType, setDType] = useState<DeciderType>(currentDecider?.type ?? "none");
  const [winnerId, setWinnerId] = useState<number | null>(currentDecider?.winner_player_id ?? null);
  const [loserId, setLoserId] = useState<number | null>(currentDecider?.loser_player_id ?? null);
  const [wGoals, setWGoals] = useState<string>(
    currentDecider?.winner_goals != null ? String(currentDecider.winner_goals) : ""
  );
  const [lGoals, setLGoals] = useState<string>(
    currentDecider?.loser_goals != null ? String(currentDecider.loser_goals) : ""
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setDType(currentDecider?.type ?? "none");
    setWinnerId(currentDecider?.winner_player_id ?? null);
    setLoserId(currentDecider?.loser_player_id ?? null);
    setWGoals(currentDecider?.winner_goals != null ? String(currentDecider.winner_goals) : "");
    setLGoals(currentDecider?.loser_goals != null ? String(currentDecider.loser_goals) : "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [
    currentDecider?.type,
    currentDecider?.winner_player_id,
    currentDecider?.loser_player_id,
    currentDecider?.winner_goals,
    currentDecider?.loser_goals,
  ]);

  const canEditDecider = !!showDeciderEditor && isEditorOrAdmin && !!onSaveDecider;

  function normalizeInt(s: string): number | null {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.floor(n));
  }

  function handleSaveDecider() {
    if (!onSaveDecider) return;

    if (dType === "none") {
      onSaveDecider({
        type: "none",
        winner_player_id: null,
        loser_player_id: null,
        winner_goals: null,
        loser_goals: null,
      });
      return;
    }

    if (!winnerId || !loserId || winnerId === loserId) return;

    const wg = normalizeInt(wGoals);
    const lg = normalizeInt(lGoals);
    if (wg == null || lg == null) return;

    onSaveDecider({
      type: dType,
      winner_player_id: winnerId,
      loser_player_id: loserId,
      winner_goals: wg,
      loser_goals: lg,
    });
  }

  const deciderFormInvalid =
    !canEditDecider ||
    (dType !== "none" &&
      (!winnerId ||
        !loserId ||
        winnerId === loserId ||
        normalizeInt(wGoals) == null ||
        normalizeInt(lGoals) == null));

  const deciderHasValue = (currentDecider?.type ?? "none") !== "none";

  const showReopenLastMatch = isEditorOrAdmin && done && !!onSetLastMatchPlaying;

  const content = (
    <div className="space-y-5">
      <ErrorToastOnError error={error} title="Admin action failed" />

      {/* Status summary */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="card-chip">
          status <span className="font-semibold text-text-normal">{status}</span>
        </span>
        <span className="card-chip">
          second leg <span className="font-semibold text-text-normal">{secondLegEnabled ? "on" : "off"}</span>
        </span>
      </div>

      {/* Core controls */}
      <div>
      <div className="section-head"><span className="section-label">Actions</span></div>
      <div className="flex flex-wrap gap-2">
        {canSecondLeg && (
          <>
            {!secondLegEnabled ? (
              <Button onClick={onEnableSecondLeg} disabled={busy}>
                Add second leg
              </Button>
            ) : (
              // Only show "Remove" if it's actually safe/allowed (no leg2 match started)
              canDisableSecondLeg ? (
                <Button variant="ghost" onClick={onDisableSecondLeg} disabled={busy}>
                  Remove second leg
                </Button>
              ) : null
            )}
          </>
        )}

        {canReorder && status === "draft" && (
          <Button variant="ghost" onClick={onReshuffle} disabled={busy}>
            Reshuffle order
          </Button>
        )}

        {isEditorOrAdmin && status === "draft" && mode === "2v2" && onReassign2v2 && (
          <Button variant="ghost" onClick={onReassign2v2} disabled={busy}>
            Re-assign 2v2 schedule
          </Button>
        )}

        {showReopenLastMatch && (
          <Button
            variant="ghost"
            onClick={onSetLastMatchPlaying}
            disabled={busy || !!setLastMatchPlayingBusy}
            title="If someone finished the last match by accident and the tournament became done."
          >
            {setLastMatchPlayingBusy ? "Reopening…" : "Set last match to playing"}
          </Button>
        )}

        {isAdmin && (
          <Button variant="ghost" onClick={onDeleteTournament} disabled={busy}>
            Delete tournament
          </Button>
        )}

        {!canReorder && role === "editor" && done && (
          <div className="inline-flex h-10 items-center px-1 text-sm text-text-muted">
            Tournament is done.
          </div>
        )}
      </div>
      </div>

      {showDateEditor && (
      <div>
          <div className="section-head"><span className="section-label">Tournament date</span></div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <div className="input-label">Date</div>
              <input
                type="date"
                className="input-field w-[170px]"
                value={dateValue ?? ""}
                onChange={(e) => onDateChange?.(e.target.value)}
              />
            </label>

            <Button variant="ghost" onClick={() => onSaveDate?.()} disabled={busy || !!dateBusy || !dateValue}>
              {dateBusy ? "Saving…" : "Save date"}
            </Button>
          </div>

          <div className="input-hint">Admin-only (for backfilling past tournaments).</div>
        </div>
      )}

      {showNameEditor && (
      <div>
          <div className="section-head"><span className="section-label">Tournament name</span></div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="block flex-1 min-w-[220px]">
              <div className="input-label">Name</div>
              <input
                type="text"
                className="input-field w-full"
                value={nameValue ?? ""}
                onChange={(e) => onNameChange?.(e.target.value)}
                placeholder="e.g. Sauna Turnier"
              />
            </label>

            <Button
              variant="ghost"
              onClick={() => onSaveName?.()}
              disabled={busy || !!nameBusy || !(nameValue ?? "").trim()}
            >
              {nameBusy ? "Saving…" : "Save name"}
            </Button>
          </div>

          <div className="input-hint">Admin-only.</div>
        </div>
      )}

      {/* Decider editor */}
      {showDeciderEditor && (
      <div>
          <div className="section-head"><span className="section-label">Decider</span></div>

          {!isEditorOrAdmin && <div className="text-xs text-text-muted">Login as editor/admin to set a decider.</div>}

          {canEditDecider && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(["none", "penalties", "match", "scheresteinpapier"] as const).map((k) => {
                  const on = dType === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      className={
                        "rounded-full px-3 py-1.5 text-xs transition focus-ring " +
                        (on
                          ? "bg-accent/15 font-medium text-accent ring-1 ring-inset ring-accent/40"
                          : "bg-bg-card-chip/50 text-text-muted hover:text-text-normal")
                      }
                      onClick={() => setDType(k)}
                      disabled={busy || !!deciderBusy}
                    >
                      {k === "none"
                        ? "Keep draw"
                        : k === "scheresteinpapier"
                          ? "Schere-Stein-Papier Turnier"
                          : k === "match"
                            ? "Match"
                            : k === "penalties"
                              ? "Penalties"
                              : k}
                    </button>
                  );
                })}
              </div>

              {dType !== "none" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="block">
                    <div className="input-label">Winner</div>
                    <FilterSelect
                      value={winnerId == null ? "" : String(winnerId)}
                      onChange={(val) => {
                        const v = val ? Number(val) : null;
                        setWinnerId(v);
                        if (v && (!loserId || loserId === v)) {
                          const other = candidates.find((c) => c.id !== v)?.id ?? null;
                          setLoserId(other);
                        }
                      }}
                      disabled={busy || !!deciderBusy}
                      ariaLabel="Decider winner"
                      placeholder="—"
                      options={[{ value: "", label: "—" }, ...candidates.map((c) => ({ value: String(c.id), label: c.name }))]}
                    />
                  </div>

                  <div className="block">
                    <div className="input-label">Loser</div>
                    <FilterSelect
                      value={loserId == null ? "" : String(loserId)}
                      onChange={(val) => setLoserId(val ? Number(val) : null)}
                      disabled={busy || !!deciderBusy}
                      ariaLabel="Decider loser"
                      placeholder="—"
                      options={[{ value: "", label: "—" }, ...candidates.map((c) => ({ value: String(c.id), label: c.name }))]}
                    />
                  </div>

                  <label className="block">
                    <div className="input-label">Winner goals</div>
                    <input
                      inputMode="numeric"
                      className="input-field w-full"
                      value={wGoals}
                      onChange={(e) => setWGoals(e.target.value)}
                      disabled={busy || !!deciderBusy}
                      placeholder="e.g. 5"
                    />
                  </label>

                  <label className="block">
                    <div className="input-label">Loser goals</div>
                    <input
                      inputMode="numeric"
                      className="input-field w-full"
                      value={lGoals}
                      onChange={(e) => setLGoals(e.target.value)}
                      disabled={busy || !!deciderBusy}
                      placeholder="e.g. 4"
                    />
                  </label>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSaveDecider} disabled={deciderFormInvalid}>
                  {deciderBusy ? "Saving…" : dType === "none" ? "Remove decider / keep draw" : "Save decider"}
                </Button>

                {deciderHasValue && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      onSaveDecider?.({
                        type: "none",
                        winner_player_id: null,
                        loser_player_id: null,
                        winner_goals: null,
                        loser_goals: null,
                      })
                    }
                    disabled={busy || !!deciderBusy}
                  >
                    Clear to draw
                  </Button>
                )}
              </div>

              <div className="input-hint">Decider should only be used if the standings are tied at the top.</div>
            </div>
          )}
        </div>
      )}

    </div>
  );

  if (!wrap) return content;

  // `wrap` is a flat panel fallback; the live page already supplies its own
  // section header, so it passes wrap={false}.
  return <div className="panel-subtle p-3">{content}</div>;
}
