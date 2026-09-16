import type { ReactNode } from "react";

import AvatarCircle from "./AvatarCircle";

/**
 * One player in a picker row: their avatar as a toggle.
 *
 * `showName` prints the name under the face (A7). Without it the name is `sr-only`,
 * which means a sighted reader picks a teammate by photograph — fine for the five
 * faces Roli knows by heart, useless for anyone else and impossible at the 32px the
 * friendly setup uses. Every picker that *assigns* a player (new tournament, the
 * friendly setup's two sides, the stats/What-if player picker, the duo picker) shows
 * the name; the label is a single truncating line, so a long name cannot widen the
 * slot and break the row.
 */
export default function AvatarButton({
  playerId,
  name,
  updatedAt,
  selected,
  onClick,
  className = "h-9 w-9",
  disabled = false,
  fallbackIcon,
  noOverflowAnchor = false,
  showName = false,
}: {
  playerId: number | null;
  name: string;
  updatedAt: string | null;
  selected: boolean;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  fallbackIcon?: ReactNode;
  noOverflowAnchor?: boolean;
  /** Print the name under the avatar instead of hiding it for screen readers only. */
  showName?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={noOverflowAnchor ? { overflowAnchor: "none" } : undefined}
      className={
        "relative shrink-0 transition-colors " +
        (showName ? "flex flex-col items-center gap-1 rounded-xl px-1 pb-0.5 pt-1 " : "rounded-full ") +
        (selected ? "" : "hover:bg-bg-card-chip/20") +
        (disabled ? " opacity-45" : "")
      }
      aria-pressed={selected}
      title={name}
    >
      <AvatarCircle
        playerId={playerId}
        name={name}
        updatedAt={updatedAt}
        sizeClass={className}
        className={selected ? "ring-2 ring-[color:rgb(var(--color-accent)/0.85)]" : ""}
        fallbackIcon={playerId == null ? fallbackIcon : undefined}
      />
      {showName ? (
        <span
          className={
            "max-w-16 truncate text-xs leading-none " +
            (selected ? "font-medium text-text-normal" : "text-text-muted")
          }
        >
          {name}
        </span>
      ) : (
        <span className="sr-only">{name}</span>
      )}
    </button>
  );
}
