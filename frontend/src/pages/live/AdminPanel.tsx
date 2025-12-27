import Button from "../../ui/primitives/Button";

type Status = "draft" | "live" | "done";

export default function AdminPanel({
  // auth/visibility
  isAdmin,
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
}: {
  isAdmin: boolean;
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
}) {
  const showDateEditor = isAdmin && !!onSaveDate && !!onDateChange;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-2 text-base font-semibold">{isAdmin ? "Admin controls" : "Editor controls"}</div>

      <div className="mb-3 text-sm text-zinc-400">
        status: <span className="accent">{status}</span> · second leg:{" "}
        <span className="accent">{secondLegEnabled ? "enabled" : "off"}</span>
      </div>

      {/* Status controls */}
      <div className="flex flex-wrap gap-2">
        {isAdmin ? (
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
          </>
        ) : (
          <>
            {status === "draft" && (
              <Button onClick={onSetLive} disabled={busy}>
                Start (set live)
              </Button>
            )}
            {status === "live" && (
              <Button onClick={onFinalize} disabled={busy}>
                Finalize (set done)
              </Button>
            )}
            {status === "done" && (
              <div className="text-sm text-zinc-500">Tournament is done (admins can change status).</div>
            )}
          </>
        )}

        <div className="w-full" />

        {/* Schedule controls (editor + admin) */}
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

        {/* Admin-only */}
        {isAdmin && (
          <Button variant="ghost" onClick={onDeleteTournament} disabled={busy}>
            Delete tournament
          </Button>
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

      {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
    </div>
  );
}
