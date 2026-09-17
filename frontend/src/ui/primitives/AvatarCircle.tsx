import type { ReactNode } from "react";

import { playerAvatarUrl } from "../../api/playerAvatars.api";
import { cupMarkColorVarForKey } from "../../cupColors";

/**
 * A cup the pictured player holds **today**. Never a historic reign: an avatar
 * speaks in the present tense, and "who owned the cup going into *this*
 * tournament" is the standings' crown badge (`CupOwnerBadge`), not a ring.
 */
export type AvatarCup = { key: string; name: string };

/**
 * Every avatar wears the same ring; only its colour carries information (T15).
 *
 * - **Neutral** (`1px`, the chip hairline): pure decoration. It gives the disc
 *   an edge on a white `card` in the light theme as well as on a dark page, so
 *   a cropped photo and a fallback initial sit in the same shape everywhere.
 * - **Cup-coloured** (`2.5px`, the cup's own colour; a conic split when a
 *   player holds more than one): this player holds that cup right now.
 *
 * 2.5× the width *and* a saturated colour against a muted hairline is what
 * keeps the two apart at 390px, where the smallest avatar is 24px.
 */
const NEUTRAL_RING = "rgb(var(--color-border-card-chip) / 0.55)";
const HAIRLINE_PX = 1;
const CUP_RING_PX = 2.5;

function cupRingPaint(cups: AvatarCup[]): string {
  // The ring is a mark, not text (C11): it only has to clear the 3:1 non-text
  // floor, so it reads the brighter mark colour rather than the darkened one
  // a holder's name wears.
  const colors = cups.map((c) => `rgb(var(${cupMarkColorVarForKey(c.key)}))`);
  if (colors.length === 1) return colors[0];
  const step = 360 / colors.length;
  return `conic-gradient(${colors.map((col, i) => `${col} ${i * step}deg ${(i + 1) * step}deg`).join(", ")})`;
}

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
  cups,
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
  /** Cups this player holds today — leave unset where a cup means nothing. */
  cups?: AvatarCup[] | null;
}) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase();
  const held = cups ?? [];
  // The ring is drawn *inside* the avatar's own box (padding + background), so
  // adopting it never moves a single pixel of the layout around it.
  return (
    <span
      className={"relative inline-flex shrink-0 rounded-full " + sizeClass + " " + className}
      style={{ background: held.length ? cupRingPaint(held) : NEUTRAL_RING, padding: held.length ? CUP_RING_PX : HAIRLINE_PX }}
      data-avatar-ring={held.length ? "cup" : "neutral"}
    >
      <span className="inset p-0 inline-flex h-full w-full items-center justify-center overflow-hidden rounded-full">
        {playerId != null && updatedAt ? (
          <img src={playerAvatarUrl(playerId, updatedAt)} alt={alt} className={imgClassName} loading="lazy" decoding="async" />
        ) : fallbackIcon ? (
          fallbackIcon
        ) : (
          <span className={fallbackClassName}>{initial}</span>
        )}
      </span>
      {held.length ? (
        // The tooltip rides on its own `aria-hidden` overlay: a `title` on the
        // avatar itself would be pulled into the accessible name of the
        // `PlayerLink` most of these sit in ("Roli" → "Holds Bauernkranz").
        <span
          className="absolute inset-0 rounded-full"
          aria-hidden="true"
          title={`Holds ${held.map((c) => c.name).join(" · ")}`}
        />
      ) : null}
    </span>
  );
}
