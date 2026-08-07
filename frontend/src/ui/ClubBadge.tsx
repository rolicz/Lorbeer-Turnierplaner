/* eslint-disable react-refresh/only-export-components */
import { clubCrestUrl } from "../api/clubs.api";
import { cn } from "./cn";
import NationFlag from "./NationFlag";

/**
 * Deterministic monogram badge for a club.
 *
 * Real crests are trademarked and there are hundreds of clubs, so the symbol is
 * generated: the club's initials on a colored disc whose color is a pure
 * function of the club name (same name → same color, forever, on every device).
 *
 * Exception: national teams are countries, so passing a `nation` code renders
 * that country's flag as the symbol instead (see `nationalTeams.ts`).
 */
export type ClubBadgeSize = "sm" | "md";

const SIZE_CLASS: Record<ClubBadgeSize, string> = {
  sm: "h-4 w-4 text-[8px]", // 16px
  md: "h-[22px] w-[22px] text-[10px]",
};

const IMG_SIZE_CLASS: Record<ClubBadgeSize, string> = {
  sm: "h-4 w-4",
  md: "h-[22px] w-[22px]",
};

/**
 * Muted, mid-lightness discs that stay readable with light text on both the
 * dark and the light surfaces of the app. Full class strings so Tailwind's
 * scanner picks them up.
 */
export const CLUB_BADGE_COLORS: string[] = [
  "bg-[hsl(4,45%,42%)]",
  "bg-[hsl(24,45%,38%)]",
  "bg-[hsl(45,42%,34%)]",
  "bg-[hsl(96,34%,34%)]",
  "bg-[hsl(150,38%,32%)]",
  "bg-[hsl(178,42%,31%)]",
  "bg-[hsl(198,45%,36%)]",
  "bg-[hsl(215,45%,42%)]",
  "bg-[hsl(243,36%,45%)]",
  "bg-[hsl(268,34%,44%)]",
  "bg-[hsl(300,30%,39%)]",
  "bg-[hsl(332,38%,42%)]",
];

/** FNV-1a — small, stable across engines, and no dependency on `hashCode` quirks. */
export function clubBadgeHash(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Index into {@link CLUB_BADGE_COLORS} for a club name. */
export function clubBadgeColorIndex(name: string): number {
  return clubBadgeHash((name ?? "").trim()) % CLUB_BADGE_COLORS.length;
}

/**
 * Initials: first letters of the first two words, or the first two letters of a
 * single-word name.
 */
export function clubInitials(name: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0].slice(0, 1) + words[1].slice(0, 1)).toUpperCase();
}

export default function ClubBadge({
  name,
  nation,
  clubId,
  crestVersion,
  size = "sm",
  className,
}: {
  name?: string | null;
  nation?: string | null;
  /** Together with `crestVersion`, renders the real crest image instead. */
  clubId?: number | null;
  /** `crest_updated_at` from the clubs payload; null/undefined = no crest stored. */
  crestVersion?: string | null;
  size?: ClubBadgeSize;
  className?: string;
}) {
  // Real crest (synced/uploaded, served by our backend) beats everything.
  if (clubId && crestVersion) {
    return (
      <img
        src={clubCrestUrl(clubId, crestVersion)}
        alt=""
        loading="lazy"
        draggable={false}
        aria-hidden="true"
        className={cn("shrink-0 self-center object-contain", IMG_SIZE_CLASS[size], className)}
      />
    );
  }

  // National teams: the flag *is* the club symbol. Same size scale, so the
  // footprint stays in line with the monogram discs next to it.
  const code = typeof nation === "string" ? nation.trim() : "";
  if (code) return <NationFlag nation={code} size={size} className={className} />;

  const label = (name ?? "").trim();
  if (!label) return null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none text-white/95",
        SIZE_CLASS[size],
        CLUB_BADGE_COLORS[clubBadgeColorIndex(label)],
        className,
      )}
      aria-hidden="true"
    >
      {clubInitials(label)}
    </span>
  );
}
