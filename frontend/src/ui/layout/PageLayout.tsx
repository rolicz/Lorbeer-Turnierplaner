import React from "react";

/**
 * Standard page shell: the desktop title row plus the `.page` content column.
 *
 * The title row sits **outside** `.page` (T10). A `hidden lg:flex` element is
 * still a `space-y-*` sibling, so on a phone it used to push the page's first
 * block down by one rhythm gap for nothing — that was the empty band above
 * every tab strip. Outside, every page starts at exactly `main`'s padding,
 * with or without a tab strip.
 *
 * The row is also the only place a page titles itself: `back` (detail pages),
 * the title, `meta` right next to it (the tournament's mode/date pills, a
 * match's "A vs B") and right-aligned `actions`. It is a fixed 2rem tall, so a
 * page with a back chevron starts its content at the same y as one without.
 *
 * Pages with a hero of their own (LiveTournamentPage, ProfilePage) use the same
 * component — nothing renders a header block above its tab strip any more.
 */
export default function PageLayout({
  title,
  back,
  meta,
  actions,
  children,
  className,
}: {
  title?: string;
  /** Desktop back chevron (`InlineBack`), on detail pages only. */
  back?: React.ReactNode;
  /** Small metadata that belongs to the title (pills, a subtitle). */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const cls = className ? `page ${className}` : "page";
  return (
    <>
      {title !== undefined && (
        <div className="mb-4 hidden min-h-8 items-center justify-between gap-3 lg:flex">
          <div className="flex min-w-0 items-center gap-2">
            {back}
            <h1 className="truncate text-xl font-bold tracking-tight text-text-normal">{title}</h1>
            {meta}
          </div>
          {actions}
        </div>
      )}
      <div className={cls}>{children}</div>
    </>
  );
}
