import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import { activeDest, visibleDests } from "./navConfig";
import ConnectionIndicator from "./ConnectionIndicator";

/** Desktop-only collapsible left sidebar. */
export default function Sidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const { role } = useAuth();
  const loc = useLocation();
  const dests = visibleDests(role);
  const active = activeDest(loc.pathname);
  const settingsActive = loc.pathname.startsWith("/settings");

  return (
    <aside
      className={
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border-card-chip/40 bg-bg-card-outer/60 lg:flex " +
        (collapsed ? "w-[68px]" : "w-60")
      }
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
          <i className="fa-solid fa-trophy text-sm" aria-hidden="true" />
        </span>
        {!collapsed ? <span className="truncate text-sm font-semibold tracking-tight">Lorbeerkranz</span> : null}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-2">
        {dests.map((d) => {
          const Icon = d.icon;
          const isActive = active?.key === d.key;
          return (
            <Link
              key={d.key}
              to={d.to}
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
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent"
                  aria-hidden="true"
                />
              ) : null}
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              {!collapsed ? <span className="truncate">{d.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      {/* Footer: connection + settings link + collapse */}
      <div className="space-y-1 border-t border-border-card-chip/40 px-2.5 py-2">
        {!collapsed ? (
          <div className="px-2 pb-1">
            <ConnectionIndicator />
          </div>
        ) : null}

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
