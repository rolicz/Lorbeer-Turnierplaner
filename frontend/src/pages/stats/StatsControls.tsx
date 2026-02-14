import type { Player, StatsScope } from "../../api/types";
import AvatarButton from "../../ui/primitives/AvatarButton";
import SegmentedSwitch, { type SegmentedOption } from "../../ui/primitives/SegmentedSwitch";

export type StatsMode = "overall" | "1v1" | "2v2";

const MODE_OPTIONS: ReadonlyArray<SegmentedOption<StatsMode>> = [
  { key: "overall", label: "Overall" },
  { key: "1v1", label: "1v1" },
  { key: "2v2", label: "2v2" },
];

const SCOPE_OPTIONS: ReadonlyArray<SegmentedOption<StatsScope>> = [
  { key: "tournaments", label: "Tourneys", icon: "fa-trophy" },
  { key: "both", label: "Both", icon: "fa-object-group" },
  { key: "friendlies", label: "Friendlies", icon: "fa-handshake" },
];

export function StatsControlLabel({
  icon,
  text,
  widthClass = "w-16 sm:w-20",
}: {
  icon: string;
  text: string;
  widthClass?: string;
}) {
  return (
    <span
      className={
        "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-medium text-text-muted " +
        widthClass
      }
    >
      <i className={"fa-solid " + icon + " text-[11px]"} aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}

export function StatsSegmentedSwitch<T extends string | number | boolean>({
  value,
  onChange,
  options,
  widthClass = "w-14 sm:w-20",
  ariaLabel,
  title,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  widthClass?: string;
  ariaLabel: string;
  title?: string;
}) {
  return (
    <SegmentedSwitch<T>
      value={value}
      onChange={onChange}
      options={options}
      widthClass={widthClass}
      ariaLabel={ariaLabel}
      title={title}
    />
  );
}

export function StatsModeSwitch({
  value,
  onChange,
  ariaLabel = "Filter mode",
  title = "Filter: Overall / 1v1 / 2v2",
}: {
  value: StatsMode;
  onChange: (m: StatsMode) => void;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <StatsSegmentedSwitch<StatsMode>
      value={value}
      onChange={onChange}
      options={MODE_OPTIONS}
      ariaLabel={ariaLabel}
      title={title}
    />
  );
}

export function StatsScopeSwitch({
  value,
  onChange,
  ariaLabel = "Data source",
  title = "Data source: Tournaments / Both / Friendlies",
  widthClass = "w-14 sm:w-20",
}: {
  value: StatsScope;
  onChange: (s: StatsScope) => void;
  ariaLabel?: string;
  title?: string;
  widthClass?: string;
}) {
  return (
    <StatsSegmentedSwitch<StatsScope>
      value={value}
      onChange={onChange}
      options={SCOPE_OPTIONS}
      widthClass={widthClass}
      ariaLabel={ariaLabel}
      title={title}
    />
  );
}

export function StatsFilterDataControls({
  mode,
  onModeChange,
  scope,
  onScopeChange,
}: {
  mode: StatsMode;
  onModeChange: (m: StatsMode) => void;
  scope: StatsScope;
  onScopeChange: (s: StatsScope) => void;
}) {
  return (
    <div className="flex min-w-0 shrink-0 flex-col items-start gap-2">
      <div className="flex flex-nowrap items-center gap-2">
        <StatsControlLabel icon="fa-filter" text="Filter" />
        <StatsModeSwitch value={mode} onChange={onModeChange} />
      </div>
      <div className="flex flex-nowrap items-center gap-2">
        <StatsControlLabel icon="fa-database" text="Data" />
        <StatsScopeSwitch value={scope} onChange={onScopeChange} />
      </div>
    </div>
  );
}

export function StatsAvatarSelector({
  players,
  selectedId,
  onSelect,
  avatarUpdatedAtById,
  includeAll = false,
  allValue = "",
  allLabel = "All players",
  allIconClass = "fa-solid fa-layer-group text-[12px] text-text-muted",
  avatarClassName = "h-8 w-8",
}: {
  players: Player[];
  selectedId: number | "";
  onSelect: (id: number | "") => void;
  avatarUpdatedAtById: ReadonlyMap<number, string>;
  includeAll?: boolean;
  allValue?: number | "";
  allLabel?: string;
  allIconClass?: string;
  avatarClassName?: string;
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 py-0.5">
      <div className="flex min-w-full items-center justify-between gap-2">
        {includeAll ? (
          <AvatarButton
            playerId={null}
            name={allLabel}
            updatedAt={null}
            selected={selectedId === allValue}
            onClick={() => onSelect(allValue)}
            className={avatarClassName}
            fallbackIconClass={allIconClass}
            noOverflowAnchor={true}
          />
        ) : null}
        {players.map((p) => (
          <AvatarButton
            key={p.id}
            playerId={p.id}
            name={p.display_name}
            updatedAt={avatarUpdatedAtById.get(p.id) ?? null}
            selected={selectedId === p.id}
            onClick={() => onSelect(p.id)}
            className={avatarClassName}
            noOverflowAnchor={true}
          />
        ))}
      </div>
    </div>
  );
}
