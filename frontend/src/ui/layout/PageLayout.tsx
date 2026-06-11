import React from "react";

/**
 * Standard page shell: wraps content in the `.page` class and renders
 * the desktop-only title heading when `title` is provided.
 *
 * Live pages with custom bleed/hero layouts (LiveTournamentPage, ProfilePage)
 * keep their own structure and do not use this component.
 */
export default function PageLayout({
  title,
  actions,
  children,
  className,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const cls = className ? `page ${className}` : "page";
  return (
    <div className={cls}>
      {title !== undefined && (
        <div className="mb-4 hidden lg:flex lg:items-center lg:justify-between">
          <h1 className="text-xl font-bold tracking-tight text-text-normal">{title}</h1>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
