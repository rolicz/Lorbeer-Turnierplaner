import { useEffect, useMemo, useState } from "react";
import Button from "../../ui/primitives/Button";

type Status = "draft" | "live" | "done";
type DeciderType = "none" | "penalties" | "match";

type Candidate = { id: number; name: string };

export default function AdminPanel({
  // auth / visibility
  role,
  status,

  // tournament actions (editor OR admin)
  secondLegEnabled,
  onEnableSecondLeg,
  onDisableSecondLeg,
  onReshuffle,
  onSetLive,
  onFinalize,
  onSetDraft,

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

  // decider editing (editor+admin)
  showDeciderEditor,
  deciderCandidates,
  currentDecider,
  onSaveDecider,
  deciderBusy,
}: {
  role: "reader" | "editor" | "admin";
  status: Status;

  secondLegEnabled: boolean;
  onEnableSecondLeg: () => void;
  onDisableSecondLeg: () => void;
  onReshuffle: () => void;

  onSetLive: () => void;
  onFinalize: () => void;
  onSetDraft: () => void;

  onDeleteTournament: () => void;

  busy: boolean;
  error: string | null;

  dateValue?: string;
  onDateChange?: (v: string) => void;
  onSaveDate?: () => void;
  dateBusy?: boolean;

  showDeciderEditor?: boolean; // show editor UI only if done + top draw (or whatever rule you want)
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
  const isEditorOrAdmin = role === "editor" || role === "admin";

  // We still show controls for editor/admin, but hide most things when tournament is done (admins keep full power)
  const done = status === "done";
  const canUseNonDeciderControls = isAdmin || (!done && role === "editor");

  const showDateEditor = isAdmin && !!onSaveDate && !!onDateChange;

  const candidates = deciderCandidates ?? [];
  const candById = useMemo(() => new Map(candidates.map((c) => [c.id, c.name] as const)), [candidates]);

  // --- local decider form state ---
  const [dType, setDType] = useState<DeciderType>(currentDecider?.type ?? "none");
  const [winnerId, setWinnerId] = useState<number | null>(currentDecider?.winner_player_id ?? null);
  const [loserId, setLoserId] = useState<number | null>(currentDecider?.loser_player_id ?? null);
  const [wGoals, setWGoals] = useState<string>(currentDecider?.winner_goals != null ? String(currentDecider.winner_goals) : "");
  const [lGoals, setLGoals] = useState<string>(currentDecider?.loser_goals != null ? String(currentDecider.loser_goals) : "");

  // keep form in sync with server state when tournament refetches
  useEffect(() => {
    setDType(currentDecider?.type ?? "none");
    setWinnerId(currentDecider?.winner_player_id ?? null);
    setLoserId(currentDecider?.loser_player_id ?? null);
    setWGoals(currentDecider?.winner_goals != null ? String(currentDecider.winner_goals) : "");
    setLGoals(currentDecider?.loser_goals != null ? String(currentDecider.loser_goals) : "");
  }, [
    currentDecider?.type,
    currentDecider?.winner_player_id,
    currentDecider?.loser_player_id,
    currentDecider?.winner_goals,
    currentDecider?.loser_goals,
  ]);

  const canEditDecider = !!showDeciderEditor && isEditorOrAdmin && !!onSaveDecider;
  const deciderHasValue = (currentDecider?.type ?? "none") !== "none";

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

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-2 text-base font-semibold">
        {role === "admin" ? "Admin controls" : "Editor controls"}
      </div>

      <div className="mb-3 text-sm text-zinc-400">
        status: <span className="accent">{status}</span> · second leg:{" "}
        <span className="accent">{secondLegEnabled ? "enabled" : "off"}</span>
      </div>

      {/* Status controls */}
      <div className="flex flex-wrap gap-2">
        {canUseNonDeciderControls ? (
          <>
            <Button onClick={onSetLive} disabled={busy}>
              Set live
            </Button>
            <Button onClick={onFinalize} disabled={busy}>
              Finalize
            </Button>
            <Button variant="ghost" onClick={onSetDraft} disabled={busy}>
              Set draft
            </Button>

            <div className="w-full" />

            {!secondLegEnabled ? (
              <Button onClick={onEnableSecondLeg} disabled={busy}>
                Add second leg
              </Button>
            ) : (
              <Button variant="ghost" onClick={onDisableSecondLeg} disabled={busy}>
                Remove second leg
              </Button>
            )}

            <Button variant="ghost" onClick={onReshuffle} disabled={busy}>
              Reshuffle order
            </Button>

            {isAdmin && (
              <Button variant="ghost" onClick={onDeleteTournament} disabled={busy}>
                Delete tournament
              </Button>
            )}
          </>
        ) : (
          <div className="text-sm text-zinc-500">
            Tournament is done. Only decider editing (if applicable) is available for editors.
          </div>
        )}
      </div>

      {showDateEditor && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/10 p-3">
          <div className="mb-2 text-sm font-medium">Tournament date</div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <div className="mb-1 text-xs text-zinc-400">Date</div>
              <input
                type="date"
                className="w-[170px] rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
                value={dateValue ?? ""}
                onChange={(e) => onDateChange?.(e.target.value)}
              />
            </label>

            <Button variant="ghost" onClick={() => onSaveDate?.()} disabled={busy || !!dateBusy || !dateValue}>
              {dateBusy ? "Saving…" : "Save date"}
            </Button>
          </div>

          <div className="mt-2 text-xs text-zinc-500">Admin-only (for backfilling past tournaments).</div>
        </div>
      )}

      {/* Decider editor UI (only if showDeciderEditor) */}
      {showDeciderEditor && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/10 p-3">
          <div className="mb-2 text-sm font-medium">Decider</div>

          {!isEditorOrAdmin && (
            <div className="text-xs text-zinc-500">Login as editor/admin to set a decider.</div>
          )}

          {canEditDecider && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(["none", "penalties", "match"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`rounded-xl border px-3 py-2 text-sm ${
                      dType === k ? "border-zinc-600 bg-zinc-950" : "border-zinc-800 hover:bg-zinc-950/40"
                    }`}
                    onClick={() => setDType(k)}
                    disabled={busy || !!deciderBusy}
                  >
                    {k === "none" ? "Keep draw" : k}
                  </button>
                ))}
              </div>

              {dType !== "none" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">Winner</div>
                    <select
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
                      value={winnerId ?? ""}
                      onChange={(e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        setWinnerId(v);
                        if (v && (!loserId || loserId === v)) {
                          const other = candidates.find((c) => c.id !== v)?.id ?? null;
                          setLoserId(other);
                        }
                      }}
                      disabled={busy || !!deciderBusy}
                    >
                      <option value="">—</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">Loser</div>
                    <select
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
                      value={loserId ?? ""}
                      onChange={(e) => setLoserId(e.target.value ? Number(e.target.value) : null)}
                      disabled={busy || !!deciderBusy}
                    >
                      <option value="">—</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">Winner goals</div>
                    <input
                      inputMode="numeric"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
                      value={wGoals}
                      onChange={(e) => setWGoals(e.target.value)}
                      disabled={busy || !!deciderBusy}
                      placeholder="e.g. 5"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-1 text-xs text-zinc-400">Loser goals</div>
                    <input
                      inputMode="numeric"
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-600"
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

              <div className="text-xs text-zinc-500">
                Decider should only be used if the standings are tied at the top.
              </div>
            </div>
          )}
        </div>
      )}

      {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
    </div>
  );
}
