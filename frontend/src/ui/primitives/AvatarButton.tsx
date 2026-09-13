import type { ReactNode } from "react";

import AvatarCircle from "./AvatarCircle";

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
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={noOverflowAnchor ? { overflowAnchor: "none" } : undefined}
      className={
        "relative shrink-0 rounded-full transition-colors " +
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
      <span className="sr-only">{name}</span>
    </button>
  );
}
