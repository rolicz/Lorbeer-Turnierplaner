import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";

import { useLiveTournament } from "../../hooks/useLiveTournament";
import { useDestinationLinks } from "./useDestinationLinks";
import ConnectionIndicator from "./ConnectionIndicator";
import NotificationBell from "./NotificationBell";

/** Desktop-only collapsible left sidebar. */
export default function Sidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const loc = useLocation();
  // Each entry points at the page you last had open in that destination (U6).
  const links = useDestinationLinks({ hasLiveEntry: true });
  const settingsActive = loc.pathname.startsWith("/settings");

  // Shortcut to the live tournament, shown only while one is running. When on
  // its page, this entry owns the active state (not "Tournaments").
  const liveT = useLiveTournament().data ?? null;
  const onLivePage =
    !!liveT && (loc.pathname === `/live/${liveT.id}` || loc.pathname.startsWith(`/live/${liveT.id}/`));

  return (
    <aside
      className={
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border-card-chip/40 bg-bg-card-outer/60 lg:flex " +
        (collapsed ? "w-[68px]" : "w-60")
      }
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-4">
        <img src="/icon-512.png" alt="" className="h-8 w-8 shrink-0 rounded-xl object-cover ring-1 ring-border-card-chip/40" />
        {!collapsed ? <span className="truncate text-sm font-semibold tracking-tight">Lorbeerkranz</span> : null}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-2">
        {liveT ? (
          <Link
            to={`/live/${liveT.id}`}
            title={liveT.name}
            aria-current={onLivePage ? "page" : undefined}
            className={
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition focus-ring " +
              (onLivePage
                ? "bg-bg-card-chip/60 text-text-normal font-medium"
                : "text-text-muted hover:bg-hover-default/40 hover:text-text-normal") +
              (collapsed ? " justify-center px-0" : "")
            }
          >
            {onLivePage ? (
              <motion.span
                layoutId="sidebar-active"
                className="absolute inset-y-0 left-0 my-auto h-5 w-1 rounded-r-full bg-accent"
                aria-hidden="true"
              />
            ) : null}
            <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center" aria-hidden="true">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full live-ping opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full live-dot" />
            </span>
            {!collapsed ? <span className="truncate">Live now</span> : null}
          </Link>
        ) : null}
        {links.map(({ dest: d, to, isActive }) => {
          const Icon = d.icon;
          return (
            <Link
              key={d.key}
              to={to}
              title={d.label}
              aria-current={isActive ? "page" : undefined}
              className={
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition focus-ring " +
                (isActive
                  ? "bg-bg-card-chip/60 text-text-normal font-medium"
                  : "text-text-muted hover:bg-hover-default/40 hover:text-text-normal") +
                (collapsed ? " justify-center px-0" : "")
              }
            >
              {isActive ? (
                // Centred with auto margins, not -translate-y-1/2: framer-motion's
                // layout animation owns `transform` and drops the utility, which
                // left the bar hanging half a row low.
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-y-0 left-0 my-auto h-5 w-1 rounded-r-full bg-accent"
                  aria-hidden="true"
                />
              ) : null}
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              {!collapsed ? <span className="truncate">{d.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      {/* Footer: notifications + connection + settings link + collapse */}
      <div className="space-y-1 border-t border-border-card-chip/40 px-2.5 py-2">
        <div className={"flex items-center gap-1 pb-1 " + (collapsed ? "justify-center" : "justify-between px-2")}>
          {!collapsed ? <ConnectionIndicator /> : null}
          <NotificationBell align="left" placement="top" />
        </div>

        <Link
          to="/settings"
          title="Settings"
          aria-current={settingsActive ? "page" : undefined}
          className={
            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition focus-ring " +
            (settingsActive
              ? "bg-bg-card-chip/60 text-text-normal font-medium"
              : "text-text-muted hover:bg-hover-default/40 hover:text-text-normal") +
            (collapsed ? " justify-center px-0" : "")
          }
        >
          <Settings className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          {!collapsed ? <span>Settings</span> : null}
        </Link>

        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={
            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs text-text-muted transition hover:bg-hover-default/40 hover:text-text-normal focus-ring " +
            (collapsed ? "justify-center px-0" : "")
          }
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
