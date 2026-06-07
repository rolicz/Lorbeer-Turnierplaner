import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, Settings, ChevronLeft } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import { drawerLeft, scrim } from "../motion/motion";
import { activeDest, visibleDests } from "./navConfig";
import { usePageTitleValue } from "../layout/PageTitleContext";
import { useHideOnScroll } from "../layout/useHideOnScroll";
import { useContextualBack } from "./routeMeta";
import ConnectionIndicator from "./ConnectionIndicator";

/** Mobile (and tablet < lg) top bar + slide-in navigation drawer. */
export default function MobileChrome({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const { role } = useAuth();
  const loc = useLocation();
  const dests = visibleDests(role);
  const active = activeDest(loc.pathname);
  const settingsActive = loc.pathname.startsWith("/settings");
  const pageTitle = usePageTitleValue();
  const { hidden, atTop } = useHideOnScroll(72);
  const { isDetail, goBack } = useContextualBack();

  // The current page title: page-registered title wins, else the nav label, else brand.
  const title = pageTitle ?? active?.label ?? "Lorbeerkranz";

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
      {/* Auto-hiding top bar — slides up on scroll-down, back down on scroll-up. */}
      <header
        className={
          "sticky top-0 z-30 nav-shell backdrop-blur-md pt-[env(safe-area-inset-top,0px)] transition-transform duration-300 ease-out-expo lg:hidden " +
          (hidden && !open ? "-translate-y-full" : "translate-y-0") +
          (atTop ? "" : " shadow-pop")
        }
      >
        <div className="flex h-14 items-center gap-2 px-3">
          {isDetail ? (
            <button
              type="button"
              onClick={goBack}
              aria-label="Back"
              className="icon-button focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="icon-button focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <span className="min-w-0 truncate text-base font-semibold tracking-tight">{title}</span>
          <ConnectionIndicator />
          <span className="flex-1" />
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

              <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
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

              <div className="mt-auto border-t border-border-card-chip/40 px-3 py-3">
                <Link
                  to="/settings"
                  onClick={() => setOpen(false)}
                  aria-current={settingsActive ? "page" : undefined}
                  className={
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] transition focus-ring " +
                    (settingsActive
                      ? "bg-bg-card-chip/60 text-text-normal font-medium"
                      : "text-text-muted hover:bg-hover-default/40 hover:text-text-normal")
                  }
                >
                  <Settings className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span>Settings</span>
                </Link>
              </div>
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
