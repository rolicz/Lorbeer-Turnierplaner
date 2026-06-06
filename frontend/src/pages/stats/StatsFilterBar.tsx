import type { Player, StatsScope } from "../../api/types";
import type { StatsMode } from "./StatsControls";
import SegmentedSwitch from "../../ui/primitives/SegmentedSwitch";
import AvatarButton from "../../ui/primitives/AvatarButton";

export type StatsPlayerNeed = "none" | "optional" | "required";

export type StatsFilterConfig = {
  mode: boolean;
  scope: boolean;
  player: StatsPlayerNeed;
};

const MODE_OPTIONS = [
  { key: "overall" as StatsMode, label: "Overall" },
  { key: "1v1" as StatsMode, label: "1v1" },
  { key: "2v2" as StatsMode, label: "2v2" },
];

const SCOPE_OPTIONS = [
  { key: "tournaments" as StatsScope, label: "Tournaments" },
  { key: "both" as StatsScope, label: "Both" },
  { key: "friendlies" as StatsScope, label: "Friendlies" },
];

/** Field row: a clear label above a control (no cryptic icons). */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</span>
        {hint ? <span className="text-[11px] text-text-muted/80">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * One unified, clearly-labelled filter bar shared across all stats sections.
 * Only the fields the active section actually uses are shown.
 */
export default function StatsFilterBar({
  config,
  mode,
  onModeChange,
  scope,
  onScopeChange,
  playerId,
  onPlayerChange,
  players,
  avatarUpdatedAtById,
}: {
  config: StatsFilterConfig;
  mode: StatsMode;
  onModeChange: (m: StatsMode) => void;
  scope: StatsScope;
  onScopeChange: (s: StatsScope) => void;
  playerId: number | "";
  onPlayerChange: (id: number | "") => void;
  players: Player[];
  avatarUpdatedAtById: ReadonlyMap<number, string>;
}) {
  if (!config.mode && !config.scope && config.player === "none") return null;

  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-border-card-chip/40 bg-bg-card-outer/50 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {config.mode ? (
          <Field label="Mode">
            <SegmentedSwitch<StatsMode>
              value={mode}
              onChange={onModeChange}
              options={MODE_OPTIONS}
              ariaLabel="Mode"
              widthClass="w-[72px]"
            />
          </Field>
        ) : null}
        {config.scope ? (
          <Field label="Source">
            <SegmentedSwitch<StatsScope>
              value={scope}
              onChange={onScopeChange}
              options={SCOPE_OPTIONS}
              ariaLabel="Data source"
              widthClass="w-[96px]"
            />
          </Field>
        ) : null}
      </div>

      {config.player !== "none" ? (
        <Field
          label="Player"
          hint={config.player === "required" && playerId === "" ? "select a player" : undefined}
        >
          <div className="-mx-1 overflow-x-auto px-1 py-0.5">
            <div className="flex items-center gap-2">
              {config.player === "optional" ? (
                <AvatarButton
                  playerId={null}
                  name="All players"
                  updatedAt={null}
                  selected={playerId === ""}
                  onClick={() => onPlayerChange("")}
                  className="h-9 w-9"
                  fallbackIconClass="fa-solid fa-layer-group text-[12px] text-text-muted"
                  noOverflowAnchor
                />
              ) : null}
              {players.map((p) => (
                <AvatarButton
                  key={p.id}
                  playerId={p.id}
                  name={p.display_name}
                  updatedAt={avatarUpdatedAtById.get(p.id) ?? null}
                  selected={playerId === p.id}
                  onClick={() => onPlayerChange(p.id)}
                  className="h-9 w-9"
                  noOverflowAnchor
                />
              ))}
            </div>
          </div>
        </Field>
      ) : null}
    </div>
  );
}
