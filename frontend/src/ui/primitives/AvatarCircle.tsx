import type { ReactNode } from "react";

import { playerAvatarUrl } from "../../api/playerAvatars.api";

export default function AvatarCircle({
  playerId,
  name,
  updatedAt,
  sizeClass = "h-10 w-10",
  className = "",
  imgClassName = "h-full w-full object-cover",
  fallbackClassName = "text-sm font-semibold text-text-muted",
  fallbackIcon,
  alt = "",
}: {
  playerId?: number | null;
  name: string;
  updatedAt?: string | null;
  sizeClass?: string;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
  fallbackIcon?: ReactNode;
  alt?: string;
}) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <span
      className={
        "panel-subtle inline-flex items-center justify-center overflow-hidden rounded-full shrink-0 " +
        sizeClass +
        " " +
        className
      }
    >
      {playerId != null && updatedAt ? (
        <img src={playerAvatarUrl(playerId, updatedAt)} alt={alt} className={imgClassName} loading="lazy" decoding="async" />
      ) : fallbackIcon ? (
        fallbackIcon
      ) : (
        <span className={fallbackClassName}>{initial}</span>
      )}
    </span>
  );
}
