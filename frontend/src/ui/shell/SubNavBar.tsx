import { Link } from "react-router-dom";
import { useSubNavContext } from "../layout/SubNavContext";

/**
 * Renders the page's registered in-page section tabs as a clean, horizontally
 * scrollable strip inside the content area (replacing the old top-bar sub-nav).
 * Pages still register items via usePageSubNav; Phase D migrates them to a
 * direct <SectionTabs> and retires SubNavContext.
 */
export default function SubNavBar() {
  const { items } = useSubNavContext();
  if (!items.length) return null;

  return (
    <div className="page-x-bleed lg:sticky lg:top-0 lg:z-20 mb-3 lg:bg-bg-default/80 lg:backdrop-blur-md">
      <div className="no-scrollbar flex items-center gap-1 overflow-x-auto py-2">
        {items.map((it) => {
          const base =
            "inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition focus-ring " +
            (it.active
              ? "bg-bg-card-chip/70 text-text-normal font-medium"
              : "text-text-muted hover:bg-hover-default/40 hover:text-text-normal");
          const label = it.iconOnly ? null : <span className="truncate">{it.label}</span>;
          const icon = it.icon ? <i className={`fa-solid ${it.icon} text-[12px]`} aria-hidden="true" /> : null;
          const content = (
            <>
              {icon}
              {label}
            </>
          );

          if (it.to) {
            return (
              <Link key={it.key} to={it.to} title={it.title ?? it.label} className={base}>
                {content}
              </Link>
            );
          }
          return (
            <button
              key={it.key}
              type="button"
              onClick={it.onClick}
              disabled={it.disabled}
              title={it.title ?? it.label}
              className={`${base} disabled:opacity-50`}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
