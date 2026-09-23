import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";

import { useProfileAccess } from "../../hooks/useProfileAccess";
import { cn } from "../cn";
import { LIST_ROW_OVERLAY_CLASS } from "./List";

const NOT_IN_YOUR_GROUP = "Not in your group";

/**
 * Identity → profile: the one way a player's avatar or name becomes a door to
 * their profile page (N4). It is always a plain `<a>`, so it must never be
 * rendered inside another link — rows whose own action is a link use the
 * stretched-overlay pattern (`ListRow`) and place this in the content layer.
 *
 * Click and Enter are kept from bubbling to a surrounding row handler, so a row
 * with its own `onClick` (a table row, a stretched button) keeps that action for
 * everything except the identity itself.
 *
 * **It is also the one place the browser decides who may open a profile** (L11), through
 * `useProfileAccess`: a player who shares a group with the caller is a link as always; one
 * who does not is plain text titled "Not in your group" — unless the caller is the site
 * admin, who may open anyone — and a player from another group wears the `Users` mark
 * after the name either way. The server refuses the profile independently
 * (`ensure_shared_group`); this only decides what is drawn.
 *
 * `stretched` renders the door as a row's stretched overlay (`LIST_ROW_OVERLAY_CLASS`,
 * the `ListRow` pattern) with no children, so a whole row can open the profile without an
 * `<a>` inside an `<a>`; when the profile may not be opened it renders nothing and the row
 * is simply not a door.
 */
export default function PlayerLink({
  playerId,
  name,
  className,
  title,
  decorative = false,
  stretched = false,
  onClick,
  children,
}: {
  playerId: number;
  /** Used for the default tooltip/label; the visible content is `children`. */
  name: string;
  className?: string;
  title?: string;
  /**
   * The link only duplicates a neighbouring one (an avatar next to the linked
   * name): keep it tappable but out of the tab order and the accessibility tree.
   */
  decorative?: boolean;
  /**
   * The whole row is the door: render the stretched overlay (no children, labelled
   * "Open <name>'s profile") as the row's first child, content above it at `z-10`.
   */
  stretched?: boolean;
  /** Runs before navigation; call `preventDefault()` to suppress it (e.g. after a drag). */
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  children?: ReactNode;
}) {
  const { canOpen, foreign } = useProfileAccess(playerId);
  const to = `/profiles/${playerId}`;
  const label = `Open ${name}'s profile`;

  if (stretched) {
    if (!canOpen) return null;
    return (
      <Link
        to={to}
        aria-label={label}
        title={title ?? label}
        onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
        className={LIST_ROW_OVERLAY_CLASS}
      />
    );
  }

  // The mark says "another group" once per identity — never on a decorative duplicate
  // (the avatar beside the name), or a byline would carry it twice.
  const mark = foreign && !decorative ? (
    <Users size={12} className="ml-1 inline-block shrink-0 align-middle text-text-muted" role="img" aria-label="From another group" />
  ) : null;

  if (!canOpen) {
    return (
      <span
        title={NOT_IN_YOUR_GROUP}
        aria-hidden={decorative || undefined}
        className={cn("rounded-xl no-underline", className)}
      >
        {children}
        {mark}
      </span>
    );
  }

  return (
    <Link
      to={to}
      title={title ?? label}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      onKeyDown={(e) => e.stopPropagation()}
      aria-hidden={decorative || undefined}
      tabIndex={decorative ? -1 : undefined}
      className={cn("focus-ring rounded-xl no-underline transition hover:text-accent", className)}
    >
      {children}
      {mark}
    </Link>
  );
}
