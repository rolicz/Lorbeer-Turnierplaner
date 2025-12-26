import Button from "../../ui/primitives/Button";

export default function AdminPanel({
  secondLegEnabled,
  onEnableSecondLeg,
  onReshuffle,
  onSetLive,
  onFinalize,
  onSetDraft,
  busy,
  error,
}: {
  secondLegEnabled: boolean;
  onEnableSecondLeg: () => void;
  onReshuffle: () => void;
  onSetLive: () => void;
  onFinalize: () => void;
  onSetDraft: () => void;
  busy: boolean;
  error: string | null;
}) {
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
      </div>

      {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
    </div>
  );
}
