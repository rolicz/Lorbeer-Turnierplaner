import Button from "../../ui/primitives/Button";

export default function AdminPanel({
  secondLegEnabled,
  onEnableSecondLeg,
  onReshuffle,
  onSetLive,
  onFinalize,
  onSetDraft,
  onDeleteTournament,
  onDisableSecondLeg,
  busy,
  error,

  // NEW (optional) date editing
  dateValue,
  onDateChange,
  onSaveDate,
  dateBusy,
}: {
  secondLegEnabled: boolean;
  onEnableSecondLeg: () => void;
  onReshuffle: () => void;
  onSetLive: () => void;
  onFinalize: () => void;
  onSetDraft: () => void;
  onDeleteTournament: () => void;
  onDisableSecondLeg: () => void;
  busy: boolean;
  error: string | null;

  // If these are provided by LiveTournamentPage, we show the date editor.
  // (LiveTournamentPage should only pass them for admins.)
  dateValue?: string;
  onDateChange?: (v: string) => void;
  onSaveDate?: () => void;
  dateBusy?: boolean;
}) {
  const showDateEditor = !!onSaveDate && !!onDateChange;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-2 text-base font-semibold">Admin controls</div>

      <div className="mb-3 text-sm text-zinc-400">
        second leg: <span className="accent">{secondLegEnabled ? "enabled" : "off"}</span>
      </div>

      <div className="flex flex-wrap gap-2">
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

        <Button onClick={onEnableSecondLeg} disabled={busy}>
          Add second leg
        </Button>
        <Button variant="ghost" onClick={onReshuffle} disabled={busy}>
          Reshuffle order
        </Button>
        <Button variant="ghost" onClick={onDeleteTournament} disabled={busy}>
          Delete tournament
        </Button>
        {secondLegEnabled && (
          <Button variant="ghost" onClick={onDisableSecondLeg} disabled={busy}>
            Remove second leg
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

            <Button
              variant="ghost"
              onClick={() => onSaveDate?.()}
              disabled={busy || !!dateBusy || !dateValue}
            >
              {dateBusy ? "Saving…" : "Save date"}
            </Button>
          </div>

          <div className="mt-2 text-xs text-zinc-500">
            Admin-only (for backfilling past tournaments).
          </div>
        </div>
      )}

      {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
    </div>
  );
}
