import { useLocation } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { useLiveTournament } from "../../hooks/useLiveTournament";
import { resolveDestination } from "./lastLocation";
import { activeDest, visibleDests, type NavDest } from "./navConfig";

export type DestinationLink = {
  dest: NavDest;
  /** Where the item points: remembered page → fallback (live shortcut) → root. */
  to: string;
  /** Whether the item owns the current page (aria-current + active styling). */
  isActive: boolean;
};

/**
 * The primary destinations with their resolved targets — the single place the
 * bottom tab bar, the desktop sidebar and the mobile drawer agree on, so the
 * three shells cannot drift apart.
 */
export function useDestinationLinks(
  options: {
    /** Destination keys to leave out (the bottom bar drops Clubs). */
    exclude?: readonly string[];
    /**
     * Shells that render their own "Live now" entry (sidebar, drawer): that entry
     * owns the active state on the live page, and Tournaments keeps its plain root
     * fallback instead of the live shortcut.
     */
    hasLiveEntry?: boolean;
  } = {},
): DestinationLink[] {
  const { role } = useAuth();
  const loc = useLocation();
  const active = activeDest(loc.pathname);

  const liveT = useLiveTournament().data ?? null;
  const onLivePage =
    !!liveT && (loc.pathname === `/live/${liveT.id}` || loc.pathname.startsWith(`/live/${liveT.id}/`));

  return visibleDests(role)
    .filter((d) => !options.exclude?.includes(d.key))
    .map((d) => {
      // Precedence for Tournaments: remembered page → live shortcut → /tournaments.
      const fallback = !options.hasLiveEntry && d.key === "tournaments" && liveT ? `/live/${liveT.id}` : null;
      return {
        dest: d,
        to: resolveDestination(d, loc.pathname, fallback),
        isActive: active?.key === d.key && !(options.hasLiveEntry && onLivePage),
      };
    });
}
