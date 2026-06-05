import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import { drawerLeft, scrim } from "../motion/motion";
import type { ThemeName } from "../layout/useThemeManager";
import { activeDest, visibleDests } from "./navConfig";
import ConnectionIndicator from "./ConnectionIndicator";
import SettingsPanel from "./SettingsPanel";

type PlayerLite = { id: number; display_name: string };

/** Mobile (and tablet < lg) top bar + slide-in navigation drawer. */
export default function MobileChrome({
  theme,
  setTheme,
  actorOptions,
  open,
  setOpen,
}: {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  actorOptions: PlayerLite[];
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const { role } = useAuth();
  const loc = useLocation();
  const dests = visibleDests(role);
  const active = activeDest(loc.pathname);

  // Lock body scroll + close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-30 nav-shell backdrop-blur-md pt-[env(safe-area-inset-top,0px)] lg:hidden">
        <div className="flex h-14 items-center gap-2 px-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="icon-button focus-ring inline-flex h-10 w-10 items-center justify-center"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-base font-semibold tracking-tight">
              {active?.label ?? "Lorbeerkranz"}
            </span>
          </div>
          <ConnectionIndicator compact />
        </div>
      </header>

      {/* Drawer */}
      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              variants={scrim}
              initial="hidden"
              animate="show"
              exit="exit"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            />
            <motion.aside
              variants={drawerLeft}
              initial="hidden"
              animate="show"
              exit="exit"
              className="absolute inset-y-0 left-0 flex w-[82%] max-w-[320px] flex-col border-r border-border-card-chip/40 bg-bg-card-outer pt-[env(safe-area-inset-top,0px)] shadow-pop"
            >
              <div className="flex h-14 items-center justify-between gap-2 px-4">
                <span className="inline-flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent/15 text-accent">
                    <i className="fa-solid fa-trophy text-sm" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold tracking-tight">Lorbeerkranz</span>
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="icon-button focus-ring inline-flex h-9 w-9 items-center justify-center"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <nav className="space-y-1 px-3 py-2">
                {dests.map((d) => {
                  const Icon = d.icon;
                  const isActive = active?.key === d.key;
                  return (
                    <Link
                      key={d.key}
                      to={d.to}
                      onClick={() => setOpen(false)}
                      aria-current={isActive ? "page" : undefined}
                      className={
                        "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] transition focus-ring " +
                        (isActive
                          ? "bg-bg-card-chip/60 text-text-normal font-medium"
                          : "text-text-muted hover:bg-hover-default/40 hover:text-text-normal")
                      }
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{d.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto border-t border-border-card-chip/40 px-4 py-4">
                <SettingsPanel
                  theme={theme}
                  setTheme={setTheme}
                  actorOptions={actorOptions}
                  onNavigate={() => setOpen(false)}
                />
              </div>
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
