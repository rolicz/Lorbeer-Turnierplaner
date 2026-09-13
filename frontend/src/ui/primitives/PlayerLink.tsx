import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { cn } from "../cn";

/**
 * Identity → profile: the one way a player's avatar or name becomes a door to
 * their profile page (N4). It is always a plain `<a>`, so it must never be
 * rendered inside another link — rows whose own action is a link use the
 * stretched-overlay pattern (`ListRow`) and place this in the content layer.
 *
 * Click and Enter are kept from bubbling to a surrounding row handler, so a row
 * with its own `onClick` (a table row, a stretched button) keeps that action for
 * everything except the identity itself.
 */
export default function PlayerLink({
  playerId,
  name,
  className,
  title,
  children,
}: {
  playerId: number;
  /** Used for the default tooltip/label; the visible content is `children`. */
  name: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={`/profiles/${playerId}`}
      title={title ?? `Open ${name}'s profile`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn("focus-ring rounded-lg no-underline transition hover:text-accent", className)}
    >
      {children}
    </Link>
  );
}
