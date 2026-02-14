import { playerAvatarUrl } from "../../api/playerAvatars.api";

export default function AvatarButton({
  playerId,
  name,
  updatedAt,
  selected,
  onClick,
  className = "h-9 w-9",
  disabled = false,
  fallbackIconClass = "",
  noOverflowAnchor = false,
}: {
  playerId: number | null;
  name: string;
  updatedAt: string | null;
  selected: boolean;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  fallbackIconClass?: string;
  noOverflowAnchor?: boolean;
}) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();

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
      <span
        className={
          `panel-subtle inline-flex items-center justify-center overflow-hidden rounded-full ${className} ` +
          (selected ? "ring-2 ring-[color:rgb(var(--color-accent)/0.85)]" : "")
        }
      >
        {playerId == null ? (
          fallbackIconClass ? (
            <i className={fallbackIconClass} aria-hidden="true" />
          ) : (
            <span className="text-sm font-semibold text-text-muted">{initial}</span>
          )
        ) : updatedAt ? (
          <img src={playerAvatarUrl(playerId, updatedAt)} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <span className="text-sm font-semibold text-text-muted">{initial}</span>
        )}
      </span>
      <span className="sr-only">{name}</span>
    </button>
  );
}

