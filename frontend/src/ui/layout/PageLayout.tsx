import React from "react";

import InlineBack from "../shell/InlineBack";
import { useBack } from "../shell/backNavigation";

/**
 * Standard page shell: the desktop title row plus the `.page` content column.
 *
 * The title row sits **outside** `.page` (T10). A `hidden lg:flex` element is
 * still a `space-y-*` sibling, so on a phone it used to push the page's first
 * block down by one rhythm gap for nothing — that was the empty band above
 * every tab strip. Outside, every page starts at exactly `main`'s padding,
 * with or without a tab strip.
 *
 * The row is also the only place a page titles itself: the back chevron, the
 * title, `meta` right next to it (the tournament's mode/date pills, a match's
 * "A vs B") and right-aligned `actions`. It is a fixed 2rem tall, so a page with
 * a back chevron starts its content at the same y as one without.
 *
 * **The chevron is not a prop** (Q6). Three pages used to pass `<InlineBack />`
 * themselves — two unconditionally, one behind its own idea of "is this a detail
 * route" — which made the desktop a second source of truth next to the mobile
 * bar's hard-coded route list, and left the stats matchup with a history entry
 * and no way back in the chrome. Both now ask `useBack()`.
 *
 * The row therefore also renders **without a title** when the page is one you went
 * into: the desktop has no top bar, so this row is the only place its back control
 * can live, and a page still loading (or saying "not found") must not be the one
 * screen with no way out. Every such state goes through `PageLayout` for that
 * reason — a bare `<div className="page">` has no chevron.
 *
 * Pages with a hero of their own (LiveTournamentPage, ProfilePage) use the same
 * component — nothing renders a header block above its tab strip any more.
 */
export default function PageLayout({
  title,
  meta,
  actions,
  children,
  className,
}: {
  title?: string;
  /** Small metadata that belongs to the title (pills, a subtitle). */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const { hasBack } = useBack();
  const cls = className ? `page ${className}` : "page";
  return (
    <>
      {title !== undefined || hasBack ? (
        <div className="mb-4 hidden min-h-8 items-center justify-between gap-3 lg:flex">
          <div className="flex min-w-0 items-center gap-2">
            {hasBack ? <InlineBack /> : null}
            {title !== undefined ? (
              <h1 className="truncate text-xl font-bold tracking-tight text-text-normal">{title}</h1>
            ) : null}
            {meta}
          </div>
          {actions}
        </div>
      ) : null}
      <div className={cls}>{children}</div>
    </>
  );
}
