import { useEffect, useState } from "react";
import { atLeast, type Role } from "../../auth/AuthContext";
import Button from "../../ui/primitives/Button";
import ConfirmDialog from "../../ui/primitives/ConfirmDialog";
import { fmtCount } from "../../utils/format";
import FormLabel from "../../ui/primitives/FormLabel";
import Input from "../../ui/primitives/Input";
import FilterSelect from "../../ui/FilterSelect";
import { ErrorToastOnError } from "../../ui/primitives/ErrorToast";
import { deciderTypeLabel } from "../../ui/theme";

type Status = "draft" | "live" | "done";
type DeciderType = "none" | "penalties" | "match" | "scheresteinpapier";

type Candidate = { id: number; name: string };

export default function AdminPanel({
  role,
  status,
  mode,

  // What the server says this caller may do right now (A10). The panel renders these
  // instead of re-deriving "editor and not done" — that copy is how the rule drifted.
  canEdit,
  canDelete,
  canSetDecider,

  // tournament actions (editor OR admin)
  secondLegEnabled,
  onEnableSecondLeg,
  onDisableSecondLeg,
  canDisableSecondLeg,
  secondLegMatchCount,
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
}: {
  role: Role;
  status: Status;

  /** From `TournamentDetailOut.can_edit` / `can_delete` / `can_set_decider`, already role-gated. */
  canEdit: boolean;
  canDelete: boolean;
  canSetDecider: boolean;

  secondLegEnabled: boolean;
  onEnableSecondLeg: () => void;
  onDisableSecondLeg: () => void;
  /** If false, "Remove second leg" is hidden (e.g. leg2 already started). */
  canDisableSecondLeg?: boolean;
  /** How many leg-2 matches "Remove second leg" deletes — named in its confirm dialog (Q5). */
  secondLegMatchCount: number;
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
}) {
  const isAdmin = role === "admin";
  const isEditorOrAdmin = atLeast(role, "editor");
  const done = status === "done";

  // Editors: allow second-leg always (even if done) — that endpoint has its own rule.
  const canSecondLeg = isEditorOrAdmin;
  // Everything else is the server's answer, unchanged.
  const canReorder = canEdit;

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

  const canEditDecider = !!showDeciderEditor && !!onSaveDecider && canSetDecider;

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

  // Every irreversible action here asks first (C7): one `pendingX` per site, the
  // dialog itself opened only on tap and firing the existing callback on confirm.
  const [pendingRemoveSecondLeg, setPendingRemoveSecondLeg] = useState<true | null>(null);
  const [pendingReopenLastMatch, setPendingReopenLastMatch] = useState<true | null>(null);
  const [pendingReshuffle, setPendingReshuffle] = useState<true | null>(null);
  const [pendingClearDecider, setPendingClearDecider] = useState<true | null>(null);

  const content = (
    <div className="space-y-5">
      <ErrorToastOnError error={error} title="Admin action failed" />

      {/* Status summary */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="chip">
          status <span className="font-semibold text-text-normal">{status}</span>
        </span>
        <span className="chip">
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
                <Button variant="ghost" onClick={() => setPendingRemoveSecondLeg(true)} disabled={busy}>
                  Remove second leg
                </Button>
              ) : null
            )}
          </>
        )}

        {canReorder && status === "draft" && (
          <Button variant="ghost" onClick={() => setPendingReshuffle(true)} disabled={busy}>
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
            onClick={() => setPendingReopenLastMatch(true)}
            disabled={busy || !!setLastMatchPlayingBusy}
            title="If someone finished the last match by accident and the tournament became done."
          >
            {setLastMatchPlayingBusy ? "Reopening…" : "Set last match to playing"}
          </Button>
        )}

        {canDelete && (
          <Button variant="ghost" onClick={onDeleteTournament} disabled={busy}>
            Delete tournament
          </Button>
        )}

        {/* Why a control is missing, in the muted idiom the panel already uses. `basis-full`
            because these are sentences, not chips: they take their own row and wrap. */}
        {!canEdit && role === "editor" && done && (
          <div className="basis-full px-1 text-sm text-text-muted">
            Tournament is done — the hour an editor has to fix it has passed.
          </div>
        )}

        {!canDelete && role === "editor" && (
          <div className="basis-full px-1 text-sm text-text-muted">
            Only an admin can delete this tournament — an editor can delete one they created,
            within its first hour.
          </div>
        )}
      </div>
      </div>

      {showDateEditor && (
      <div>
          <div className="section-head"><span className="section-label">Tournament date</span></div>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              label="Date"
              type="date"
              className="w-[170px]"
              value={dateValue ?? ""}
              onChange={(e) => onDateChange?.(e.target.value)}
            />

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
            <div className="flex-1 min-w-[220px]">
              <Input
                label="Name"
                type="text"
                className="w-full"
                value={nameValue ?? ""}
                onChange={(e) => onNameChange?.(e.target.value)}
                placeholder="e.g. Sauna Turnier"
              />
            </div>

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

          {isEditorOrAdmin && !canSetDecider && (
            <div className="text-xs text-text-muted">
              The hour to set a decider has passed — only an admin can change it now.
            </div>
          )}

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
                      {deciderTypeLabel(k)}
                    </button>
                  );
                })}
              </div>

              {dType !== "none" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="block">
                    <FormLabel>Winner</FormLabel>
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
                    <FormLabel>Loser</FormLabel>
                    <FilterSelect
                      value={loserId == null ? "" : String(loserId)}
                      onChange={(val) => setLoserId(val ? Number(val) : null)}
                      disabled={busy || !!deciderBusy}
                      ariaLabel="Decider loser"
                      placeholder="—"
                      options={[{ value: "", label: "—" }, ...candidates.map((c) => ({ value: String(c.id), label: c.name }))]}
                    />
                  </div>

                  <Input
                    label="Winner goals"
                    inputMode="numeric"
                    className="w-full"
                    value={wGoals}
                    onChange={(e) => setWGoals(e.target.value)}
                    disabled={busy || !!deciderBusy}
                    placeholder="e.g. 5"
                  />

                  <Input
                    label="Loser goals"
                    inputMode="numeric"
                    className="w-full"
                    value={lGoals}
                    onChange={(e) => setLGoals(e.target.value)}
                    disabled={busy || !!deciderBusy}
                    placeholder="e.g. 4"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSaveDecider} disabled={deciderFormInvalid}>
                  {deciderBusy ? "Saving…" : dType === "none" ? "Remove decider / keep draw" : "Save decider"}
                </Button>

                {deciderHasValue && (
                  <Button
                    variant="ghost"
                    onClick={() => setPendingClearDecider(true)}
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

      <ConfirmDialog
        open={!!pendingRemoveSecondLeg}
        title="Remove the second leg?"
        subtitle="The tournament goes back to one leg; Add second leg puts a new, unplayed one back."
        confirmLabel="Remove second leg"
        busy={busy}
        busyLabel="Removing…"
        onCancel={() => setPendingRemoveSecondLeg(null)}
        onConfirm={() => {
          setPendingRemoveSecondLeg(null);
          onDisableSecondLeg();
        }}
      >
        <div>
          {`${fmtCount(secondLegMatchCount, "scheduled leg-2 match", "scheduled leg-2 matches")} ${secondLegMatchCount === 1 ? "is" : "are"} deleted, and any comments on ${secondLegMatchCount === 1 ? "it" : "them"} go with ${secondLegMatchCount === 1 ? "it" : "them"} (Q5).`}
        </div>
      </ConfirmDialog>

      {/* Nothing is lost — the tournament simply goes live again, and finishing the
          match closes it a second time (its own inverse) — so no red block. */}
      <ConfirmDialog
        open={!!pendingReopenLastMatch}
        title="Reopen the tournament?"
        subtitle="The last match goes back to playing and the tournament is live again; standings, cup ownership and stats follow. Finishing the match closes it again."
        confirmLabel="Set last match to playing"
        busy={!!setLastMatchPlayingBusy}
        busyLabel="Reopening…"
        onCancel={() => setPendingReopenLastMatch(null)}
        onConfirm={() => {
          setPendingReopenLastMatch(null);
          onSetLastMatchPlaying?.();
        }}
      />

      {/* Nothing recorded changes — the tournament has no results yet — so no red block. */}
      <ConfirmDialog
        open={!!pendingReshuffle}
        title="Reshuffle the match order?"
        subtitle="Every match gets a new random position. Nothing recorded changes — the tournament has no results yet."
        confirmLabel="Reshuffle order"
        busy={busy}
        busyLabel="Reshuffling…"
        onCancel={() => setPendingReshuffle(null)}
        onConfirm={() => {
          setPendingReshuffle(null);
          onReshuffle();
        }}
      />

      <ConfirmDialog
        open={!!pendingClearDecider}
        title="Remove the decider?"
        subtitle="The tournament ends in a draw; the cup stays with its holder."
        confirmLabel="Remove decider"
        busy={!!deciderBusy}
        busyLabel="Removing…"
        onCancel={() => setPendingClearDecider(null)}
        onConfirm={() => {
          setPendingClearDecider(null);
          onSaveDecider?.({
            type: "none",
            winner_player_id: null,
            loser_player_id: null,
            winner_goals: null,
            loser_goals: null,
          });
        }}
      >
        <div>The saved decider ({deciderTypeLabel(currentDecider?.type ?? "none")}) is removed.</div>
      </ConfirmDialog>

    </div>
  );

  return content;
}
